'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n, formatDuration } from '@/lib/i18n'
import { IconAlert, IconCheck, IconClock } from '@/components/icons'
import {
  CUTOFF_PRESETS, CUTOFF_MAX, DEFAULTS, normalizeCutoff, minutesUntilClose, isSaleOpen,
} from '@/lib/ventes'

// ─── Paramètres de vente en ligne ─────────────────────────────────────────────
// Un seul réglage, mais qui décide de ce que des milliers de visiteurs voient :
// le délai avant séance où la vente en ligne se referme. Un nombre de minutes
// seul ne dit rien — 45 minutes, c'est beaucoup ou peu ? La page répond par
// deux choses concrètes : la phrase « une séance de 20:00 s'arrête de vendre à
// 19:15 », et l'aperçu des séances réellement concernées en ce moment, tiré de
// la programmation Veezi du jour. On règle en regardant l'effet, pas le chiffre.

const TZ = 'Etc/GMT-3'

function formatHour(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  })
}

// Exemple d'horaire pour la phrase de démonstration : 20 h, la séance du soir.
// Une date fixe (et non « maintenant ») pour que la phrase ne change pas sous
// les yeux pendant qu'on lit.
function exampleTimes(minutes, locale) {
  const show  = new Date('2026-01-01T20:00:00Z')
  const close = new Date(show.getTime() - normalizeCutoff(minutes) * 60_000)
  const fmt = d => d.toLocaleTimeString(locale, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
  return { show: fmt(show), close: fmt(close) }
}

export default function AdminParametres() {
  const { t, lang, locale } = useI18n()

  const [token,   setToken]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState(null)
  const [missing, setMissing] = useState(false)   // migration SQL pas encore passée

  const [form,  setForm]  = useState(DEFAULTS)
  const [saisi, setSaisi] = useState(String(DEFAULTS.cutoffMinutes))  // champ libre, tel que tapé

  // Séances à venir, pour l'aperçu. Servies par /api/programme (déjà assemblées
  // avec leur titre de film) plutôt que par le catalogue Veezi brut, qui pèse
  // 5,5 Mo pour la seule chose qui manque ici : le nom du film.
  const [sessions, setSessions] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const jeton = session?.access_token || null
      setToken(jeton)
      if (!jeton) { setLoading(false); return }

      const res  = await fetch('/api/admin/ventes', { headers: { Authorization: `Bearer ${jeton}` } })
      const data = await res.json().catch(() => ({}))

      if (res.status === 503 && data.error === 'table_absente') setMissing(true)
      else if (!res.ok) setError(t('adminSettings.errLoad'))

      if (data.settings) {
        setForm(data.settings)
        setSaisi(String(data.settings.cutoffMinutes))
      }
      setLoading(false)
    })

    fetch('/api/programme')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const plates = []
        for (const day of d?.days || []) {
          for (const film of day.films || []) {
            for (const s of film.sessions || []) plates.push({ ...s, title: film.title })
          }
        }
        setSessions(plates.sort((a, b) => new Date(a.start) - new Date(b.start)))
      })
      .catch(() => setSessions([]))

    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const cutoff = normalizeCutoff(saisi, form.cutoffMinutes)
  const ex = exampleTimes(cutoff, locale)

  // Effet du réglage en ce moment même : ce qui se refermerait tout de suite,
  // et ce qui se refermera dans les prochaines heures. Douze séances suffisent
  // à donner la mesure — au-delà, on répète.
  const apercu = useMemo(() => {
    if (!sessions) return null
    const prochaines = sessions.filter(s => new Date(s.start).getTime() > now).slice(0, 12)
    return prochaines.map(s => ({
      ...s,
      open:  isSaleOpen(s.start, cutoff, now),
      dans:  minutesUntilClose(s.start, cutoff, now),
    }))
  }, [sessions, cutoff, now])

  const closedNow = apercu ? apercu.filter(s => !s.open).length : 0

  function setCutoff(value) {
    setSaisi(String(value))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ventes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          cutoffMinutes:   cutoff,
          hideInProgramme: form.hideInProgramme === true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t('adminSettings.errSave')); return }
      setForm(data.settings)
      setSaisi(String(data.settings.cutoffMinutes))
      setSaved(true)
    } catch {
      setError(t('adminSettings.errSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('adminSettings.title')}</h1>
        <p className="admin-page-subtitle">{t('adminSettings.subtitle')}</p>
      </div>

      {missing && (
        <div className="aset-warn" role="alert">
          <IconAlert size={16} />
          <span>{t('adminSettings.errMigration')} <code>supabase/migration_sales_settings.sql</code></span>
        </div>
      )}

      {loading ? (
        <div className="aset-loading" aria-hidden="true">
          <div className="sk-shine" style={{ height: 140, borderRadius: 10 }} />
          <div className="sk-shine" style={{ height: 220, borderRadius: 10, marginTop: 18 }} />
        </div>
      ) : (
        <>
          {/* ── Le délai ───────────────────────────────────────────────── */}
          <section className="admin-section">
            <div className="admin-section-header">
              <h2 className="admin-section-title">{t('adminSettings.cutoffTitle')}</h2>
            </div>
            <p className="admin-section-desc">{t('adminSettings.cutoffLead')}</p>

            <div className="aset-presets" role="group" aria-label={t('adminSettings.cutoffTitle')}>
              {CUTOFF_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`aset-preset ${cutoff === p ? 'active' : ''}`}
                  onClick={() => setCutoff(p)}
                >
                  {p === 0 ? t('adminSettings.presetNone') : formatDuration(p, lang)}
                </button>
              ))}
            </div>

            <label className="aset-field">
              <span className="aset-label">{t('adminSettings.cutoffLabel')}</span>
              <span className="aset-numwrap">
                <input
                  className="aset-num"
                  type="number"
                  min="0"
                  max={CUTOFF_MAX}
                  step="5"
                  value={saisi}
                  onChange={e => setCutoff(e.target.value)}
                  onBlur={() => setSaisi(String(cutoff))}
                />
                <span className="aset-unit">{t('adminSettings.minutes')}</span>
              </span>
            </label>

            {/* Le réglage traduit en horaires. C'est cette phrase qu'on relit
                avant d'enregistrer, pas le nombre de minutes. */}
            <p className="aset-example">
              <IconClock size={16} />
              {cutoff === 0
                ? t('adminSettings.exampleNone', { show: ex.show })
                : t('adminSettings.example', { show: ex.show, close: ex.close })}
            </p>
          </section>

          {/* ── Ce que ça change, maintenant ───────────────────────────── */}
          <section className="admin-section">
            <div className="admin-section-header">
              <h2 className="admin-section-title">{t('adminSettings.previewTitle')}</h2>
              {apercu && apercu.length > 0 && (
                <span className={`aset-count ${closedNow ? 'is-closed' : ''}`}>
                  {t('adminSettings.previewCount', {
                    n: closedNow, count: closedNow, total: apercu.length,
                  })}
                </span>
              )}
            </div>
            <p className="admin-section-desc">{t('adminSettings.previewLead')}</p>

            {apercu === null && <p className="admin-empty">{t('adminSettings.previewLoading')}</p>}
            {apercu?.length === 0 && <p className="admin-empty">{t('adminSettings.previewEmpty')}</p>}

            {apercu?.length > 0 && (
              <ul className="aset-preview">
                {apercu.map(s => (
                  <li key={s.id} className={`aset-prev-row ${s.open ? '' : 'is-closed'}`}>
                    <span className="aset-prev-hour">{formatHour(s.start, locale)}</span>
                    <span className="aset-prev-title">{s.title}</span>
                    <span className="aset-prev-state">
                      {s.open
                        ? (s.dans <= 120
                            ? t('adminSettings.stateClosesIn', { n: s.dans })
                            : t('adminSettings.stateOpen'))
                        : t('adminSettings.stateClosed')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Le programme de la semaine ─────────────────────────────── */}
          <section className="admin-section">
            <div className="admin-section-header">
              <h2 className="admin-section-title">{t('adminSettings.progTitle')}</h2>
            </div>
            <p className="admin-section-desc">{t('adminSettings.progLead')}</p>

            <div className="aset-toggle-row">
              <label className="aset-toggle">
                <input
                  type="checkbox"
                  checked={form.hideInProgramme === true}
                  onChange={e => {
                    setForm(f => ({ ...f, hideInProgramme: e.target.checked }))
                    setSaved(false)
                  }}
                />
                <span className="aset-toggle-track" aria-hidden="true"><span className="aset-toggle-knob" /></span>
                <span className="aset-toggle-label">{t('adminSettings.progHide')}</span>
              </label>
              <p className="aset-hint">
                {form.hideInProgramme === true
                  ? t('adminSettings.progHintOn')
                  : t('adminSettings.progHintOff')}
              </p>
            </div>
          </section>

          {error && <p className="aset-error" role="alert"><IconAlert size={15} />{error}</p>}

          <div className="aset-foot">
            {saved && <span className="aset-saved"><IconCheck size={14} />{t('adminSettings.saved')}</span>}
            <button className="aset-save" onClick={save} disabled={saving || !token}>
              {saving ? t('adminSettings.saving') : t('adminSettings.save')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
