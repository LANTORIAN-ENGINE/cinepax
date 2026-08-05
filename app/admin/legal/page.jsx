'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { invalidateLegalCache } from '@/lib/useLegal'
import { GROUP_TERMS, GROUP_PRIVACY, legalPath, htmlToText } from '@/lib/legal'
import RichEditor from '@/components/RichEditor'
import { IconCheck, IconAlert, IconPlus, IconTrash, IconArrowRight, IconShield, IconDoc } from '@/components/icons'

// ─── /admin/legal — rédaction des documents légaux ────────────────────────────
//
// Ce que voit le client vient d'ici, et de nulle part ailleurs : enregistrer
// suffit à mettre le site à jour, sans redéploiement.
//
// Le geste qui compte est celui de la version. Corriger une virgule ne doit
// pas redemander leur accord à tous les clients ; publier une clause
// nouvelle, si. La montée de version est donc un choix explicite, armé par
// une case à part, et l'écran annonce ce qu'elle coûte : le nombre exact
// d'acceptations qui redeviendront à faire.

const EMPTY_DOC = {
  id: null,
  slug: '',
  title_fr: '', title_en: '',
  summary_fr: '', summary_en: '',
  body_fr: '', body_en: '',
  version: 1,
  requires_consent: false,
  consent_group: null,
  consent_label_fr: '', consent_label_en: '',
  scroll_gate: true,
  is_published: false,
  in_footer: true,
  sort_order: 100,
}

export default function AdminLegal() {
  const { t } = useI18n()
  const [tab, setTab] = useState('docs')
  const [token, setToken] = useState(null)

  const [documents, setDocuments] = useState([])
  const [settings, setSettings] = useState(null)
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [editing, setEditing] = useState(null)   // null = liste, sinon le document ouvert

  useEffect(() => {
    const supabase = createClient()
    supabase?.auth.getSession().then(({ data: { session } }) =>
      setToken(session?.access_token || null)
    )
  }, [])

  const reload = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/legal', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'load_failed')
      setDocuments(data.documents || [])
      setSettings(data.settings || null)
      setStats(data.stats || {})
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { reload() }, [reload])

  if (editing) {
    return (
      <DocEditor
        initial={editing}
        stats={stats[editing.slug]}
        token={token}
        onDone={async () => { setEditing(null); invalidateLegalCache(); await reload() }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('adminLegal.title')}</h1>
        <p className="admin-page-subtitle">{t('adminLegal.subtitle')}</p>
      </div>

      <div className="admin-prix-tabs">
        <button className={`admin-filter-tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
          {t('adminLegal.tabDocs')}
        </button>
        <button className={`admin-filter-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          {t('adminLegal.tabSettings')}
        </button>
      </div>

      {loadError && (
        <p className="alegal-error" role="alert">
          <IconAlert size={15} />
          {t('adminLegal.errLoad')}
        </p>
      )}

      {tab === 'docs' ? (
        <DocList
          documents={documents}
          stats={stats}
          loading={loading}
          token={token}
          onEdit={setEditing}
          onNew={() => setEditing({ ...EMPTY_DOC })}
          onDeleted={reload}
        />
      ) : (
        <SettingsPanel
          settings={settings}
          documents={documents}
          token={token}
          onSaved={reload}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LISTE DES DOCUMENTS
═══════════════════════════════════════════════════════════════ */
function DocList({ documents, stats, loading, token, onEdit, onNew, onDeleted }) {
  const { t, locale } = useI18n()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function remove(doc) {
    if (!window.confirm(t('adminLegal.removeConfirm', { title: doc.title_fr }))) return
    setBusy(doc.id)
    setError(null)
    try {
      const res  = await fetch('/api/admin/legal', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: doc.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error === 'document_consenti'
          ? t('adminLegal.removeBlocked', { n: data.consents })
          : t('adminLegal.errSave'))
        return
      }
      onDeleted()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="admin-section" aria-busy="true">
        <div className="alegal-sk">
          {[0, 1, 2, 3].map(i => <span key={i} className="ask" style={{ height: 46, borderRadius: 8, '--ask-d': `${i * 0.06}s` }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">{t('adminLegal.tabDocs')}</h2>
        <button className="alegal-new" onClick={onNew}>
          <IconPlus size={15} />
          {t('adminLegal.newDoc')}
        </button>
      </div>

      {error && <p className="alegal-error" role="alert"><IconAlert size={15} />{error}</p>}

      {documents.length === 0 ? (
        <p className="admin-empty">{t('adminLegal.listEmpty')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table alegal-table">
            <thead>
              <tr>
                <th>{t('adminLegal.colDoc')}</th>
                <th>{t('adminLegal.colVersion')}</th>
                <th>{t('adminLegal.colConsent')}</th>
                <th>{t('adminLegal.colState')}</th>
                <th>{t('adminLegal.colUpdated')}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => {
                const s = stats[doc.slug]
                return (
                  <tr key={doc.id} className="admin-tr--clickable" onClick={() => onEdit(doc)}>
                    <td>
                      <p className="alegal-doc-name">{doc.title_fr}</p>
                      <p className="alegal-doc-slug">{legalPath(doc.slug)}</p>
                    </td>

                    <td>
                      <span className="alegal-version">v{doc.version}</span>
                      {s?.current > 0 && (
                        <p className="alegal-stat">
                          {t(s.current > 1 ? 'adminLegal.statsCurrentMany' : 'adminLegal.statsCurrent', { n: s.current })}
                        </p>
                      )}
                      {s && s.total > s.current && (
                        <p className="alegal-stat alegal-stat--warn">
                          {t('adminLegal.statsOutdated', { n: s.total - s.current })}
                        </p>
                      )}
                    </td>

                    <td>
                      {doc.requires_consent ? (
                        <span className="alegal-chip alegal-chip--consent">
                          <IconShield size={12} />
                          {t('adminLegal.consentRequired')}
                        </span>
                      ) : (
                        <span className="alegal-none">{t('adminLegal.consentNone')}</span>
                      )}
                    </td>

                    <td>
                      <span className={`alegal-chip ${doc.is_published ? 'alegal-chip--live' : 'alegal-chip--draft'}`}>
                        {doc.is_published ? t('adminLegal.published') : t('adminLegal.draft')}
                      </span>
                      {doc.in_footer && doc.is_published && (
                        <p className="alegal-stat">{t('adminLegal.inFooter')}</p>
                      )}
                    </td>

                    <td className="admin-td-meta">
                      {new Date(doc.updated_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>

                    <td className="alegal-actions" onClick={e => e.stopPropagation()}>
                      <button className="alegal-act" onClick={() => onEdit(doc)}>
                        {t('adminLegal.edit')}
                      </button>
                      <button
                        className="alegal-act alegal-act--danger"
                        onClick={() => remove(doc)}
                        disabled={busy === doc.id}
                        aria-label={t('adminLegal.remove')}
                        title={t('adminLegal.remove')}
                      >
                        <IconTrash size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ÉDITEUR D'UN DOCUMENT
═══════════════════════════════════════════════════════════════ */
function DocEditor({ initial, stats, token, onDone, onCancel }) {
  const { t } = useI18n()
  const [doc, setDoc] = useState(initial)
  const [lang, setLang] = useState('fr')
  const [bump, setBump] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  const set = (key, value) => {
    setDoc(d => ({ ...d, [key]: value }))
    setDirty(true)
    setSaved(null)
  }

  // Quitter avec des modifications non enregistrées est une perte sèche :
  // un contrat se rédige en plusieurs minutes, pas en un jet.
  useEffect(() => {
    if (!dirty) return
    function warn(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    setError(null)

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.slug || '')) { setError(t('adminLegal.errSlug')); return }
    if (!doc.title_fr?.trim() || !doc.title_en?.trim())    { setError(t('adminLegal.errTitles')); return }
    if (doc.requires_consent && !doc.consent_group)        { setError(t('adminLegal.errGroup')); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/legal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document: doc, bumpVersion: bump }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error === 'slug_deja_pris' ? t('adminLegal.errSlugTaken') : t('adminLegal.errSave'))
        return
      }

      setDirty(false)
      setSaved(bump ? t('adminLegal.savedBumped', { n: data.document.version }) : t('adminLegal.saved'))
      // Le retour à la liste laisse le temps de lire la confirmation :
      // enregistrer sans retour visible donne l'impression d'un clic perdu.
      setTimeout(onDone, 700)
    } catch {
      setError(t('adminLegal.errSave'))
    } finally {
      setSaving(false)
    }
  }

  const isNew   = !doc.id
  const titleKey = lang === 'fr' ? 'title_fr' : 'title_en'
  const sumKey   = lang === 'fr' ? 'summary_fr' : 'summary_en'
  const bodyKey  = lang === 'fr' ? 'body_fr' : 'body_en'
  const labelKey = lang === 'fr' ? 'consent_label_fr' : 'consent_label_en'

  return (
    <div className="admin-page alegal-editor">
      <div className="alegal-editor-bar">
        <div>
          <button className="alegal-back" onClick={onCancel}>← {t('adminLegal.backToList')}</button>
          <h1 className="admin-page-title">
            {isNew ? t('adminLegal.creating') : doc.title_fr || t('adminLegal.editing')}
          </h1>
        </div>

        <div className="alegal-editor-actions">
          {dirty && <span className="alegal-dirty">{t('adminLegal.unsaved')}</span>}
          {saved && <span className="alegal-saved"><IconCheck size={14} />{saved}</span>}
          <button className="alegal-cancel" onClick={onCancel}>{t('adminLegal.cancel')}</button>
          <button className="alegal-save" onClick={save} disabled={saving}>
            {saving ? t('adminLegal.saving') : t('adminLegal.save')}
          </button>
        </div>
      </div>

      {error && <p className="alegal-error" role="alert"><IconAlert size={15} />{error}</p>}

      <div className="alegal-grid">
        {/* ── Colonne rédaction ── */}
        <div className="alegal-main">
          <div className="alegal-langtabs" role="tablist">
            {['fr', 'en'].map(code => (
              <button
                key={code}
                role="tab"
                aria-selected={lang === code}
                className={`alegal-langtab ${lang === code ? 'active' : ''}`}
                onClick={() => setLang(code)}
              >
                {t(code === 'fr' ? 'adminLegal.langFr' : 'adminLegal.langEn')}
                {!doc[code === 'fr' ? 'body_fr' : 'body_en'] && <span className="alegal-langdot" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.fldTitle')}</span>
            <input
              type="text"
              className="alegal-input alegal-input--title"
              value={doc[titleKey] || ''}
              onChange={e => set(titleKey, e.target.value)}
            />
          </label>

          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.fldSummary')}</span>
            <textarea
              className="alegal-input alegal-textarea"
              rows={2}
              value={doc[sumKey] || ''}
              onChange={e => set(sumKey, e.target.value)}
            />
            <span className="alegal-hint">{t('adminLegal.fldSummaryHint')}</span>
          </label>

          <div className="alegal-field">
            <span className="alegal-label">{t('adminLegal.fldBody')}</span>
            <RichEditor
              key={`${doc.id || 'new'}-${lang}`}
              value={doc[bodyKey] || ''}
              onChange={html => set(bodyKey, html)}
              ariaLabel={t('adminLegal.fldBody')}
            />
            {lang === 'en' && !htmlToText(doc.body_en) && (
              <span className="alegal-hint alegal-hint--warn">{t('adminLegal.fldBodyEmpty')}</span>
            )}
          </div>
        </div>

        {/* ── Colonne réglages ── */}
        <aside className="alegal-side">
          <section className="alegal-card">
            <h2 className="alegal-card-title">{t('adminLegal.colState')}</h2>

            <label className="alegal-field">
              <span className="alegal-label">{t('adminLegal.fldSlug')}</span>
              <input
                type="text"
                className="alegal-input alegal-input--mono"
                value={doc.slug || ''}
                onChange={e => set('slug', e.target.value.toLowerCase())}
                placeholder="cgv"
              />
              <span className="alegal-hint">{t('adminLegal.fldSlugHint')}</span>
            </label>

            <Toggle
              checked={doc.is_published}
              onChange={v => set('is_published', v)}
              label={t('adminLegal.fldPublished')}
              hint={t('adminLegal.fldPublishedHint')}
            />
            <Toggle
              checked={doc.in_footer}
              onChange={v => set('in_footer', v)}
              label={t('adminLegal.fldFooter')}
            />

            <label className="alegal-field">
              <span className="alegal-label">{t('adminLegal.fldOrder')}</span>
              <input
                type="number"
                className="alegal-input alegal-input--num"
                value={doc.sort_order ?? 100}
                onChange={e => set('sort_order', parseInt(e.target.value, 10) || 0)}
              />
              <span className="alegal-hint">{t('adminLegal.fldOrderHint')}</span>
            </label>
          </section>

          <section className="alegal-card">
            <h2 className="alegal-card-title">{t('adminLegal.colConsent')}</h2>

            <Toggle
              checked={doc.requires_consent}
              onChange={v => {
                set('requires_consent', v)
                if (v && !doc.consent_group) set('consent_group', GROUP_TERMS)
              }}
              label={t('adminLegal.fldConsent')}
              hint={t('adminLegal.fldConsentHint')}
            />

            {doc.requires_consent && (
              <>
                <label className="alegal-field">
                  <span className="alegal-label">{t('adminLegal.fldGroup')}</span>
                  <select
                    className="alegal-input"
                    value={doc.consent_group || GROUP_TERMS}
                    onChange={e => set('consent_group', e.target.value)}
                  >
                    <option value={GROUP_TERMS}>{t('adminLegal.groupTerms')}</option>
                    <option value={GROUP_PRIVACY}>{t('adminLegal.groupPrivacy')}</option>
                  </select>
                  <span className="alegal-hint">{t('adminLegal.fldGroupHint')}</span>
                </label>

                <label className="alegal-field">
                  <span className="alegal-label">{t('adminLegal.fldConsentLabel')}</span>
                  <textarea
                    className="alegal-input alegal-textarea"
                    rows={3}
                    value={doc[labelKey] || ''}
                    onChange={e => set(labelKey, e.target.value)}
                  />
                  <span className="alegal-hint">{t('adminLegal.fldConsentLabelHint')}</span>
                </label>

                <Toggle
                  checked={doc.scroll_gate}
                  onChange={v => set('scroll_gate', v)}
                  label={t('adminLegal.fldGate')}
                  hint={t('adminLegal.fldGateHint')}
                />
              </>
            )}
          </section>

          {!isNew && (
            <section className={`alegal-card alegal-card--version ${bump ? 'is-armed' : ''}`}>
              <h2 className="alegal-card-title">{t('adminLegal.colVersion')}</h2>
              <p className="alegal-version-now">v{doc.version}</p>

              <Toggle
                checked={bump}
                onChange={v => { setBump(v); setSaved(null) }}
                label={t('adminLegal.bump')}
                hint={t('adminLegal.bumpHint', { n: doc.version + 1 })}
              />

              {bump && (
                <p className="alegal-bump-warn" role="status">
                  <IconAlert size={14} />
                  {t('adminLegal.bumpArmed', {
                    n: doc.version,
                    next: doc.version + 1,
                    count: stats?.current || 0,
                  })}
                </p>
              )}
            </section>
          )}

          {!isNew && doc.is_published && (
            <a href={legalPath(doc.slug)} target="_blank" rel="noreferrer" className="alegal-preview">
              <IconDoc size={15} />
              {t('legal.openFullPage')}
              <IconArrowRight size={13} />
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   RÉGLAGES — bandeau et exercice des droits
═══════════════════════════════════════════════════════════════ */
function SettingsPanel({ settings, documents, token, onSaved }) {
  const { t } = useI18n()
  const [form, setForm] = useState(settings || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (settings) setForm(settings) }, [settings])

  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setSaved(false) }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/legal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: form }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error === 'email_invalide' ? t('adminLegal.errSave') : t('adminLegal.errSave')); return }
      setSaved(true)
      onSaved()
    } catch {
      setError(t('adminLegal.errSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="alegal-settings">
      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t('adminLegal.setDocsTitle')}</h2>
        </div>
        <p className="admin-section-desc">{t('adminLegal.setDocsLead')}</p>

        <Toggle
          checked={form.banner_enabled !== false}
          onChange={v => set('banner_enabled', v)}
          label={t('adminLegal.bannerEnabled')}
        />

        <div className="alegal-two">
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.bannerTitle')} — FR</span>
            <input className="alegal-input" value={form.banner_title_fr || ''}
              onChange={e => set('banner_title_fr', e.target.value)} />
          </label>
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.bannerTitle')} — EN</span>
            <input className="alegal-input" value={form.banner_title_en || ''}
              onChange={e => set('banner_title_en', e.target.value)} />
          </label>
        </div>

        <div className="alegal-two">
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.bannerText')} — FR</span>
            <textarea className="alegal-input alegal-textarea" rows={3} value={form.banner_text_fr || ''}
              onChange={e => set('banner_text_fr', e.target.value)} />
          </label>
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.bannerText')} — EN</span>
            <textarea className="alegal-input alegal-textarea" rows={3} value={form.banner_text_en || ''}
              onChange={e => set('banner_text_en', e.target.value)} />
          </label>
        </div>

        <label className="alegal-field">
          <span className="alegal-label">{t('adminLegal.bannerDoc')}</span>
          <select className="alegal-input" value={form.banner_doc_slug || ''}
            onChange={e => set('banner_doc_slug', e.target.value)}>
            {documents.filter(d => d.is_published).map(d => (
              <option key={d.slug} value={d.slug}>{d.title_fr}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t('adminLegal.setContactTitle')}</h2>
        </div>
        <p className="admin-section-desc">{t('adminLegal.setContactLead')}</p>

        <div className="alegal-two">
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.dpoName')}</span>
            <input className="alegal-input" value={form.dpo_name || ''}
              onChange={e => set('dpo_name', e.target.value)} />
          </label>
          <label className="alegal-field">
            <span className="alegal-label">{t('adminLegal.dpoEmail')}</span>
            <input className="alegal-input" type="email" value={form.dpo_email || ''}
              onChange={e => set('dpo_email', e.target.value)} />
          </label>
        </div>

        <label className="alegal-field">
          <span className="alegal-label">{t('adminLegal.dpoAddress')}</span>
          <input className="alegal-input" value={form.dpo_address || ''}
            onChange={e => set('dpo_address', e.target.value)} />
        </label>

        <label className="alegal-field alegal-field--inline">
          <span className="alegal-label">{t('adminLegal.retention')}</span>
          <span className="alegal-retention">
            <input className="alegal-input alegal-input--num" type="number" min="1"
              value={form.retention_months ?? 36}
              onChange={e => set('retention_months', parseInt(e.target.value, 10) || 0)} />
            <span className="alegal-unit">{t('adminLegal.retentionMonths')}</span>
          </span>
          <span className="alegal-hint">{t('adminLegal.retentionHint')}</span>
        </label>
      </section>

      {error && <p className="alegal-error" role="alert"><IconAlert size={15} />{error}</p>}

      <div className="alegal-settings-foot">
        {saved && <span className="alegal-saved"><IconCheck size={14} />{t('adminLegal.setSaved')}</span>}
        <button className="alegal-save" onClick={save} disabled={saving}>
          {saving ? t('adminLegal.saving') : t('adminLegal.save')}
        </button>
      </div>
    </div>
  )
}

/* ── Interrupteur ────────────────────────────────────────────────
   Le libellé est cliquable dans toute sa largeur : viser une pastille de
   18 px à la souris comme au doigt est une contrainte inutile. */
function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="alegal-toggle-row">
      <label className="alegal-toggle">
        <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span className="alegal-toggle-track" aria-hidden="true"><span className="alegal-toggle-knob" /></span>
        <span className="alegal-toggle-label">{label}</span>
      </label>
      {hint && <p className="alegal-hint alegal-hint--toggle">{hint}</p>}
    </div>
  )
}
