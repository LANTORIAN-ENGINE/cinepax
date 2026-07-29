'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

const TZ = 'Etc/GMT-3'
const CINEMA_ID = '0000000309'

// Récupère la grille tarifaire LIVE de Veezi, groupée par PriceCardName.
// Pour chaque price card, on prend une séance représentative où CINEP est actif
// et on lit ses billets via l'API Connect (même source que le tunnel de réservation).
// Retour : { [veezi_name]: Ticket[] }  (vide si aucune séance CINEP pour ce type)
async function loadLiveTariffs() {
  const sess = await fetch('/api/veezi/v1/session').then(r => r.json()).catch(() => [])
  const repr = {}  // veezi_name → sessionId (1re séance CINEP trouvée)
  for (const s of Array.isArray(sess) ? sess : []) {
    const name = s.PriceCardName
    if (!name || repr[name]) continue
    if ((s.SalesVia || []).includes('CINEP')) repr[name] = s.Id
  }
  const out = {}
  await Promise.all(Object.entries(repr).map(async ([name, sid]) => {
    try {
      const data = await fetch(
        `/api/connect/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${sid}/tickets`
      ).then(r => r.json())
      if (data?.ResponseCode === 0 && Array.isArray(data.Tickets)) {
        out[name] = data.Tickets
          .filter(t => t.PriceInCents > 0 && (t.SalesChannels || []).includes('CINEP'))
          .sort((a, b) => (a.DisplaySequence ?? 999) - (b.DisplaySequence ?? 999))
      }
    } catch { /* type sans séance CINEP exploitable — secours utilisé */ }
  }))
  return out
}

function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}
function formatMGA(cents, moneyLocale = 'fr-MG') {
  if (!cents && cents !== 0) return '—'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

const PALETTE = ['#e8192c','#4a9eff','#22c55e','#a855f7','#f97316','#06b6d4','#eab308','#ec4899']

export default function AdminPrix() {
  const { t } = useI18n()
  const [tab, setTab] = useState('cards') // 'cards' | 'sessions'

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('prix.title')}</h1>
        <p className="admin-page-subtitle">{t('prix.subtitle')}</p>
      </div>

      <div className="admin-prix-tabs">
        <button className={`admin-filter-tab ${tab === 'cards' ? 'active' : ''}`}
          onClick={() => setTab('cards')}>
          {t('prix.tabCards')}
        </button>
        <button className={`admin-filter-tab ${tab === 'sessions' ? 'active' : ''}`}
          onClick={() => setTab('sessions')}>
          {t('prix.tabSessions')}
        </button>
      </div>

      {tab === 'cards'    && <PriceCards />}
      {tab === 'sessions' && <SessionPrices />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 1 — Types de billets (PriceCardName de Veezi)
═══════════════════════════════════════════════════════════════ */
function PriceCards() {
  const { t, moneyLocale } = useI18n()
  const [cards,       setCards]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [token,       setToken]       = useState(null)
  const [liveTariffs, setLiveTariffs] = useState(null)  // null = en cours, {} = chargé

  // Ingestion
  const [discovered,  setDiscovered]  = useState(null)  // null | [{veezi_name, count, sessions}]
  const [discovering, setDiscovering] = useState(false)
  const [selected,    setSelected]    = useState(new Set())
  const [ingesting,   setIngesting]   = useState(false)
  const [ingestMsg,   setIngestMsg]   = useState(null)

  useEffect(() => {
    const supabase = createClient()
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) =>
        setToken(session?.access_token || null)
      )
    }
    loadCards()
    loadLiveTariffs().then(setLiveTariffs).catch(() => setLiveTariffs({}))
  }, [])

  async function loadCards() {
    setLoading(true)
    const res = await fetch('/api/price-cards')
    const { cards } = await res.json()
    setCards(cards || [])
    setLoading(false)
  }

  /* — Découverte des PriceCardName depuis les sessions Veezi — */
  async function discover() {
    setDiscovering(true)
    setIngestMsg(null)
    try {
      const [sessRes, cardsRes] = await Promise.all([
        fetch('/api/veezi/v1/session').then(r => r.json()),
        fetch('/api/price-cards').then(r => r.json()),
      ])

      const sessions = Array.isArray(sessRes) ? sessRes : []
      const existing = new Set((cardsRes.cards || []).map(c => c.veezi_name))

      // Grouper par PriceCardName
      const map = {}
      sessions.forEach(s => {
        const name = s.PriceCardName
        if (!name) return
        if (!map[name]) map[name] = { veezi_name: name, count: 0, alreadyIn: existing.has(name) }
        map[name].count++
      })

      const list = Object.values(map).sort((a, b) => b.count - a.count)
      setDiscovered(list)

      // Pré-sélectionner ceux qui ne sont pas encore en base
      setSelected(new Set(list.filter(c => !c.alreadyIn).map(c => c.veezi_name)))
    } catch (e) {
      setIngestMsg({ type: 'error', text: t('prix.errorPrefix', { msg: e.message }) })
    } finally {
      setDiscovering(false)
    }
  }

  /* — Ingestion des sélectionnés — */
  async function ingest() {
    if (!selected.size) return
    setIngesting(true)
    setIngestMsg(null)

    const toIngest = [...selected].map((name, i) => ({
      veezi_name:   name,
      display_name: name,
      color:        PALETTE[i % PALETTE.length],
      price_cents:  0,
    }))

    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const res = await fetch('/api/price-cards', {
        method: 'POST',
        headers,
        body: JSON.stringify({ cards: toIngest }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('prix.ingestError'))

      setIngestMsg({ type: 'success', text: t('prix.ingestSuccess', { n: data.cards?.length || 0 }) })
      setDiscovered(null)
      setSelected(new Set())
      await loadCards()
    } catch (e) {
      setIngestMsg({ type: 'error', text: e.message })
    } finally {
      setIngesting(false)
    }
  }

  function toggleSelect(name) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  return (
    <div className="admin-section">

      {/* — Ingestion banner — */}
      <div className="pc-ingest-banner">
        <div className="pc-ingest-text">
          <p className="pc-ingest-title">{t('prix.importTitle')}</p>
          <p className="pc-ingest-desc">
            {t('prix.importDesc', { code: 'PriceCardName' })}
          </p>
        </div>
        <button className="pc-ingest-btn" onClick={discover} disabled={discovering}>
          {discovering
            ? <><span className="pay-spinner" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }}/>{t('prix.scanning')}</>
            : <><svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
              </svg>{t('prix.scanSessions')}</>
          }
        </button>
      </div>

      {ingestMsg && (
        <div className={`pc-ingest-msg ${ingestMsg.type}`}>{ingestMsg.text}</div>
      )}

      {/* — Résultats de découverte — */}
      {discovered && (
        <div className="pc-discover-panel">
          <div className="pc-discover-header">
            <p className="pc-discover-title">
              {t('prix.typesFound', { n: discovered.length, count: discovered.length })}
            </p>
            <div className="pc-discover-actions">
              <button className="adp-btn" onClick={() => setSelected(new Set(discovered.filter(c => !c.alreadyIn).map(c => c.veezi_name)))}>
                {t('prix.selectAll')}
              </button>
              <button className="adp-btn" onClick={() => setSelected(new Set())}>
                {t('prix.deselectAll')}
              </button>
            </div>
          </div>

          <div className="pc-discover-list">
            {discovered.map(c => (
              <label key={c.veezi_name} className={`pc-discover-item ${selected.has(c.veezi_name) ? 'selected' : ''} ${c.alreadyIn ? 'already-in' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(c.veezi_name)}
                  onChange={() => toggleSelect(c.veezi_name)}
                  disabled={c.alreadyIn}
                />
                <span className="pc-discover-name">{c.veezi_name}</span>
                <span className="pc-discover-count">{t('prix.sessionCount', { n: c.count, count: c.count })}</span>
                {c.alreadyIn && <span className="pc-already-badge">{t('prix.alreadyImported')}</span>}
              </label>
            ))}
          </div>

          {selected.size > 0 && (
            <button className="pc-confirm-btn" onClick={ingest} disabled={ingesting}>
              {ingesting
                ? <><span className="pay-spinner" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }}/>{t('prix.importing')}</>
                : t('prix.ingestBtn', { n: selected.size, count: selected.size })
              }
            </button>
          )}
        </div>
      )}

      {/* — Liste des types de billets configurés — */}
      {loading ? (
        <div className="admin-table-loading"><div className="compte-spinner" /></div>
      ) : cards.length === 0 && !discovered ? (
        <div className="pc-empty">
          <svg viewBox="0 0 48 48" fill="none" width="44" height="44">
            <rect x="6" y="10" width="36" height="28" rx="3" stroke="#333" strokeWidth="2"/>
            <path d="M16 19h16M16 24h10M16 29h8" stroke="#333" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>{t('prix.emptyCards')}</p>
          <p className="pc-empty-sub">{t('prix.emptyCardsSub')}</p>
        </div>
      ) : cards.length > 0 ? (
        <>
          <p className="admin-section-desc" style={{ marginTop: 24 }}>
            {t('prix.cardsDesc', { code: 'PriceCardName' })}
          </p>
          <div className="pc-cards-grid">
            {cards.map(card => (
              <PriceCardRow
                key={card.id}
                card={card}
                token={token}
                liveTickets={liveTariffs?.[card.veezi_name] || null}
                liveLoading={liveTariffs === null}
                onUpdate={updated => setCards(prev => prev.map(c => c.id === updated.id ? updated : c))}
                onDelete={id => setCards(prev => prev.filter(c => c.id !== id))}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/* — Ligne éditable d'un price card — */
function PriceCardRow({ card, token, liveTickets, liveLoading, onUpdate, onDelete }) {
  const { t, moneyLocale } = useI18n()
  const [price,   setPrice]   = useState(card.price_cents != null ? card.price_cents / 100 : '')
  const [label,   setLabel]   = useState(card.display_name || card.veezi_name)
  const [color,   setColor]   = useState(card.color || '#e8192c')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  async function save() {
    setSaving(true)
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch('/api/price-cards', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        id:           card.id,
        display_name: label.trim() || card.veezi_name,
        color,
        price_cents:  Math.round(parseFloat(price || 0) * 100),
      }),
    })
    const data = await res.json()
    if (data.card) { onUpdate(data.card); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  async function del() {
    if (!window.confirm(t('prix.deleteConfirm', { name: card.veezi_name }))) return
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/price-cards?id=${card.id}`, { method: 'DELETE', headers })
    onDelete(card.id)
  }

  const hasLive = Array.isArray(liveTickets) && liveTickets.length > 0

  return (
    <div className={`pc-card ${hasLive ? 'has-live' : ''}`}>
      <div className="pc-card-row">
        {/* Couleur */}
        <div className="pc-card-color-wrap">
          <div className="pc-card-color-swatch" style={{ background: color }} />
          <select className="pc-color-select" value={color} onChange={e => setColor(e.target.value)}>
            {PALETTE.map(c => (
              <option key={c} value={c} style={{ background: c }}>{'⬤'}</option>
            ))}
          </select>
        </div>

        {/* Nom Veezi (lecture seule) + libellé éditable */}
        <div className="pc-card-names">
          <span className="pc-veezi-name">{card.veezi_name}</span>
          <input
            className="pc-label-input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={t('prix.displayedLabel')}
          />
        </div>

        {/* Prix de secours */}
        <div className="pc-fallback-wrap">
          <span className="pc-fallback-label">{t('prix.fallback')}</span>
          <div className="admin-price-input-wrap">
            <input
              type="number" min="0" step="500"
              className="admin-price-input"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="0"
            />
            <span className="admin-price-unit">Ar</span>
          </div>
        </div>

        {/* Actions */}
        <div className="pc-card-actions">
          <button className="adp-btn adp-btn--confirm" onClick={save} disabled={saving}>
            {saving ? '…' : saved ? '✓' : 'OK'}
          </button>
          <button className="admin-cat-delete" onClick={del}>✕</button>
        </div>
      </div>

      {/* Grille tarifaire live Veezi (source réelle quand CINEP est actif) */}
      <div className="pc-live">
        {liveLoading ? (
          <span className="pc-live-status">{t('prix.loadingLive')}</span>
        ) : hasLive ? (
          <>
            <span className="pc-live-badge">{t('prix.liveVeezi')}</span>
            <div className="pc-live-grid">
              {liveTickets.map(ticket => (
                <span key={ticket.TicketTypeCode} className="pc-live-item">
                  <span className="pc-live-name">{ticket.Description}</span>
                  <span className="pc-live-price">{formatMGA(ticket.PriceInCents, moneyLocale)}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <span className="pc-live-status pc-live-off">
            {t('prix.cinepOff')}
          </span>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 2 — Prix par séance (override spécifique)
═══════════════════════════════════════════════════════════════ */
function SessionPrices() {
  const { t, locale, moneyLocale } = useI18n()
  const [sessions,  setSessions]  = useState([])
  const [prices,    setPrices]    = useState({})
  const [cards,     setCards]     = useState({})  // veezi_name → price_cents
  const [editing,   setEditing]   = useState({})
  const [saving,    setSaving]    = useState({})
  const [loadingS,  setLoadingS]  = useState(true)
  const [token,     setToken]     = useState(null)

  useEffect(() => {
    const supabase = createClient()
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) =>
        setToken(session?.access_token || null)
      )
    }

    Promise.all([
      fetch('/api/veezi/v1/session').then(r => r.json()),
      fetch('/api/price-cards').then(r => r.json()),
    ]).then(([sessData, cardsData]) => {
      const list = Array.isArray(sessData) ? sessData : []
      const now  = new Date()
      const upcoming = list
        .filter(s => new Date(s.PreShowStartTime || s.FeatureStartTime || s.ShowTime) > now)
        .sort((a, b) =>
          new Date(a.PreShowStartTime || a.FeatureStartTime || a.ShowTime) -
          new Date(b.PreShowStartTime || b.FeatureStartTime || b.ShowTime)
        )
        .slice(0, 80)
      setSessions(upcoming)

      // Map price_cards by veezi_name
      const cardMap = {}
      ;(cardsData.cards || []).forEach(c => { cardMap[c.veezi_name] = c.price_cents })
      setCards(cardMap)

      if (!upcoming.length) { setLoadingS(false); return }
      const supabase = createClient()
      if (!supabase) { setLoadingS(false); return }
      supabase
        .from('session_prices')
        .select('session_id, price_cents')
        .in('session_id', upcoming.map(s => String(s.Id)))
        .then(({ data }) => {
          const map = {}
          ;(data || []).forEach(p => { map[p.session_id] = p.price_cents })
          setPrices(map)
          setLoadingS(false)
        })
    }).catch(() => setLoadingS(false))
  }, [])

  async function savePrice(session) {
    const sid = String(session.Id)
    const raw = editing[sid]
    if (raw === undefined) return
    const ariary = parseFloat(raw)
    if (isNaN(ariary) || ariary < 0) return

    setSaving(s => ({ ...s, [sid]: true }))
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    await fetch('/api/prices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId:   sid,
        filmId:      String(session.FilmId),
        filmTitle:   session.FilmTitle || '',
        screenId:    session.ScreenId,
        sessionTime: session.PreShowStartTime || session.FeatureStartTime || session.ShowTime,
        priceCents:  Math.round(ariary * 100),
      }),
    })

    setPrices(p => ({ ...p, [sid]: Math.round(ariary * 100) }))
    setEditing(e => { const n = { ...e }; delete n[sid]; return n })
    setSaving(s => ({ ...s, [sid]: false }))
  }

  async function deletePrice(sessionId) {
    if (!window.confirm(t('prix.deletePriceConfirm'))) return
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/prices?sessionId=${sessionId}`, { method: 'DELETE', headers })
    setPrices(p => { const n = { ...p }; delete n[sessionId]; return n })
  }

  if (loadingS) return <div className="admin-table-loading"><div className="compte-spinner" /></div>

  return (
    <div className="admin-section">
      <p className="admin-section-desc">
        {t('prix.sessionsDesc')}
      </p>

      {sessions.length === 0 ? (
        <p className="admin-empty">{t('prix.emptySessions')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('prix.thSession')}</th>
                <th>{t('prix.thFilm')}</th>
                <th>{t('prix.thScreen')}</th>
                <th>{t('prix.thTicketType')}</th>
                <th>{t('prix.thFallbackPrice')}</th>
                <th>{t('prix.thSpecificPrice')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const sid      = String(s.Id)
                const override = prices[sid]
                const cardPrice = s.PriceCardName ? cards[s.PriceCardName] : null
                const editVal  = editing[sid]
                const isSaving = saving[sid]

                return (
                  <tr key={sid}>
                    <td className="admin-td-meta">
                      {formatDate(s.PreShowStartTime || s.FeatureStartTime || s.ShowTime, locale)}
                    </td>
                    <td className="admin-td-film">{s.FilmTitle || s.FilmId}</td>
                    <td className="admin-td-meta">{s.ScreenName || t('film.screenFallback', { id: s.ScreenId })}</td>
                    <td>
                      {s.PriceCardName
                        ? <span className="pc-tag">{s.PriceCardName}</span>
                        : <span className="admin-price-unset">—</span>
                      }
                    </td>
                    <td>
                      {cardPrice != null
                        ? <span className="pc-inherited">{formatMGA(cardPrice, moneyLocale)}</span>
                        : <span className="admin-price-unset">{t('prix.notSet')}</span>
                      }
                    </td>
                    <td>
                      {override != null && editVal === undefined ? (
                        <strong className="admin-price-set">{formatMGA(override, moneyLocale)}</strong>
                      ) : (
                        <div className="admin-price-input-wrap">
                          <input
                            type="number" min="0" step="500"
                            className="admin-price-input"
                            placeholder={cardPrice != null ? t('prix.inherited', { value: cardPrice/100 }) : t('prix.example')}
                            value={editVal ?? (override != null ? override / 100 : '')}
                            onChange={e => setEditing(p => ({ ...p, [sid]: e.target.value }))}
                          />
                          <span className="admin-price-unit">Ar</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="admin-price-actions">
                        {editVal !== undefined && (
                          <button className="adp-btn adp-btn--confirm"
                            disabled={isSaving} onClick={() => savePrice(s)}>
                            {isSaving ? '…' : 'OK'}
                          </button>
                        )}
                        {override != null && editVal === undefined && (
                          <>
                            <button className="adp-btn"
                              onClick={() => setEditing(p => ({ ...p, [sid]: String(override/100) }))}>
                              {t('prix.edit')}
                            </button>
                            <button className="adp-btn adp-btn--cancel"
                              onClick={() => deletePrice(sid)}>✕</button>
                          </>
                        )}
                        {override == null && editVal === undefined && (
                          <button className="adp-btn"
                            onClick={() => setEditing(p => ({ ...p, [sid]: '' }))}>
                            {t('prix.define')}
                          </button>
                        )}
                      </div>
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
