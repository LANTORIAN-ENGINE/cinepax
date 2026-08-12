'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import QrScanner from '@/components/QrScanner'
import { useI18n } from '@/lib/i18n'
import { TableSkeleton } from '@/components/skeletons'

const TZ = 'Etc/GMT-3'

// Extrait la référence de réservation depuis le contenu d'un QR :
// accepte une URL (?ref= / ?verify=), un JSON { ref }, ou la référence brute.
function extractRef(text) {
  if (!text) return null
  try {
    const u = new URL(text)
    const p = u.searchParams.get('ref') || u.searchParams.get('verify')
    if (p) return p.trim()
  } catch { /* pas une URL */ }
  try {
    const j = JSON.parse(text)
    if (j?.ref) return String(j.ref).trim()
  } catch { /* pas du JSON */ }
  return text.trim()
}
function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}
function formatMGA(cents, moneyLocale = 'fr-MG') {
  if (!cents && cents !== 0) return '—'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

function payLabel(m, t) {
  if (m === 'orange') return 'Orange Money'
  if (m === 'mvola')  return 'MVola'
  if (m === 'card')   return t('reservations.cardPay')
  return m
}
const STATUS_MAP = {
  confirmed: { key: 'reservations.statusConfirmed', cls: 'status-confirmed' },
  pending:   { key: 'reservations.statusPending',   cls: 'status-pending'   },
  cancelled: { key: 'reservations.statusCancelled', cls: 'status-cancelled' },
  used:      { key: 'reservations.statusUsed',      cls: 'status-used'      },
}

// ── L'achat est-il arrivé au cinéma ? ───────────────────────────────────────
// Colonne distincte de l'état de l'achat : un achat « confirmé » chez nous
// peut n'exister nulle part dans le système du cinéma — c'est précisément le
// cas qu'il faut pouvoir repérer, et que rien n'affichait jusqu'ici.
//
// `veezi_status` reste null tant que /api/veezi/reserve n'a pas répondu. Comme
// l'appel ne part que du navigateur du client, un null durable veut dire que
// personne n'a jamais tenté l'enregistrement : c'est un manque, pas une attente.
const VEEZI_MAP = {
  reserved: { key: 'reservations.veeziReserved', cls: 'veezi-ok'   },
  none:     { key: 'reservations.veeziNone',     cls: 'veezi-ko'   },
  failed:   { key: 'reservations.veeziFailed',   cls: 'veezi-ko'   },
  seatTaken:{ key: 'reservations.veeziSeatTaken',cls: 'veezi-ko'   },
  skipped:  { key: 'reservations.veeziSkipped',  cls: 'veezi-warn' },
  released: { key: 'reservations.veeziReleased', cls: 'veezi-none' },
}

function veeziEtat(b) {
  if (b.veezi_status === 'cancelled')     return 'released'
  if (b.veezi_booking_number)             return 'reserved'
  if (b.veezi_status === 'failed')        return 'failed'
  if (b.veezi_status === 'seat_unavailable') return 'seatTaken'
  if (b.veezi_status === 'skipped')       return 'skipped'
  return 'none'
}

export default function AdminReservations() {
  const { t, locale, moneyLocale } = useI18n()
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')  // all | confirmed | pending | cancelled
  const [expanded,  setExpanded]  = useState(null)
  const [total,     setTotal]     = useState(0)
  const [scanning,  setScanning]  = useState(false)
  const [verify,    setVerify]    = useState(null)  // null | { state, booking?, ref? }
  const [checking,  setChecking]  = useState(false)
  const [actionBusyId, setActionBusyId] = useState(null) // id en cours (annulation/suppression)

  const loadBookings = useCallback(async (q, f) => {
    setLoading(true)
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    let query = supabase
      .from('bookings')
      .select('*, booking_seats(display_key, price_cents)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100)

    // « Non transmis » ne se lit pas dans `status` mais dans l'absence de
    // numéro Veezi : ce sont les achats qui n'ont pas de place au cinéma, et
    // qu'il faut aller reprendre à la main dans le back-office.
    if (f === 'veeziKo') query = query.is('veezi_booking_number', null).neq('status', 'cancelled')
    else if (f !== 'all') query = query.eq('status', f)
    if (q.trim()) {
      query = query.or(
        `booking_ref.ilike.%${q}%,film_title.ilike.%${q}%,guest_name.ilike.%${q}%,guest_email.ilike.%${q}%`
      )
    }

    const { data, count } = await query
    setBookings(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [])

  useEffect(() => { loadBookings(search, filter) }, [filter])

  function handleSearch(e) {
    e.preventDefault()
    loadBookings(search, filter)
  }

  async function updateStatus(id, newStatus) {
    const supabase = createClient()
    await supabase?.from('bookings').update({ status: newStatus }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b))
  }

  async function authToken() {
    const supabase = createClient()
    const { data: { session } } = await supabase?.auth.getSession() ?? { data: {} }
    return session?.access_token
  }

  // Annulation « vraie » : libère la place au cinéma (Veezi) + passe en annulée.
  // Réservé aux séances non commencées (contrôlé aussi côté serveur).
  async function cancelReservation(b) {
    if (!window.confirm(t('reservations.cancelReleaseConfirm'))) return
    setActionBusyId(b.id)
    try {
      const res = await fetch('/api/veezi/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
        body:    JSON.stringify({ bookingRef: b.booking_ref }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || 'failed')
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x))
    } catch {
      alert(t('reservations.cancelError'))
    } finally {
      setActionBusyId(null)
    }
  }

  // Suppression définitive (séance passée ou réservation déjà annulée).
  async function deleteReservation(b) {
    if (!window.confirm(t('reservations.deleteConfirm'))) return
    setActionBusyId(b.id)
    try {
      const res = await fetch('/api/bookings/delete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
        body:    JSON.stringify({ bookingRef: b.booking_ref }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || 'failed')
      setBookings(prev => prev.filter(x => x.id !== b.id))
      setTotal(n => Math.max(0, n - 1))
      setExpanded(null)
    } catch {
      alert(t('reservations.deleteError'))
    } finally {
      setActionBusyId(null)
    }
  }

  // Un QR a été scanné → retrouve la réservation par sa référence.
  async function handleScan(text) {
    setScanning(false)
    const ref = extractRef(text)
    if (!ref) { setVerify({ state: 'notfound', ref: text }); return }

    const supabase = createClient()
    if (!supabase) { setVerify({ state: 'notfound', ref }); return }

    const { data } = await supabase
      .from('bookings')
      .select('*, booking_seats(display_key, price_cents)')
      .eq('booking_ref', ref)
      .maybeSingle()

    setVerify(data ? { state: 'found', booking: data } : { state: 'notfound', ref })
  }

  // Valide l'entrée : marque la réservation comme « utilisée ».
  async function checkIn(booking) {
    setChecking(true)
    await updateStatus(booking.id, 'used')
    setVerify({ state: 'checked', booking: { ...booking, status: 'used' } })
    setChecking(false)
  }

  function exportCSV() {
    const headers = [
      t('reservations.csvReference'), t('reservations.csvFilm'), t('reservations.csvSession'),
      t('reservations.csvScreen'), t('reservations.csvClient'), t('reservations.csvEmail'),
      t('reservations.csvSeats'), t('reservations.csvTotal'), t('reservations.csvPayment'),
      t('reservations.csvStatus'), t('reservations.csvCinema'), t('reservations.csvVeeziNum'),
      t('reservations.csvDate'),
    ]
    const rows = bookings.map(b => [
      b.booking_ref,
      b.film_title,
      formatDate(b.session_time, locale),
      b.screen_name || '',
      b.guest_name || '',
      b.guest_email || '',
      (b.booking_seats || []).map(s => s.display_key).join(' '),
      b.total_amount_cents ? b.total_amount_cents / 100 : 0,
      b.payment_method || '',
      b.status || '',
      t(VEEZI_MAP[veeziEtat(b)].key),
      b.veezi_booking_number || '',
      formatDate(b.created_at, locale),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `reservations_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const now = Date.now()

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('reservations.title')}</h1>
        <div className="admin-header-actions">
          <button className="admin-scan-btn" onClick={() => { setVerify(null); setScanning(true) }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
              <path d="M3 7V4a1 1 0 011-1h3M17 7V4a1 1 0 00-1-1h-3M3 13v3a1 1 0 001 1h3M17 13v3a1 1 0 01-1 1h-3M3 10h14" strokeLinecap="round"/>
            </svg>
            {t('reservations.scan')}
          </button>
          <button className="admin-export-btn" onClick={exportCSV}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
            {t('reservations.exportCsv')}
          </button>
        </div>
      </div>

      {scanning && (
        <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />
      )}

      {verify && (
        <VerifyModal
          verify={verify}
          checking={checking}
          t={t}
          locale={locale}
          onCheckIn={checkIn}
          onScanAgain={() => { setVerify(null); setScanning(true) }}
          onClose={() => setVerify(null)}
        />
      )}

      {/* Filtres */}
      <div className="admin-filters-row">
        <form onSubmit={handleSearch} className="admin-search-form">
          <input
            type="text"
            className="admin-search-input"
            placeholder={t('reservations.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="admin-search-btn">{t('reservations.search')}</button>
        </form>

        <div className="admin-filter-tabs">
          {[
            { val: 'all',       label: t('reservations.all') },
            { val: 'confirmed', label: t('reservations.confirmed') },
            { val: 'pending',   label: t('reservations.pending') },
            { val: 'cancelled', label: t('reservations.cancelled') },
            { val: 'veeziKo',   label: t('reservations.filterVeeziKo') },
          ].map(tab => (
            <button key={tab.val}
              className={`admin-filter-tab ${filter === tab.val ? 'active' : ''}`}
              onClick={() => setFilter(tab.val)}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      <p className="admin-count">{t('reservations.count', { n: total, count: total })}</p>

      {loading ? (
        <TableSkeleton rows={8} headers={[
          t('reservations.thReference'), t('reservations.thFilm'), t('reservations.thSession'),
          t('reservations.thClient'), t('reservations.thSeats'), t('reservations.thAmount'),
          t('reservations.thPayment'), t('reservations.thStatus'), t('reservations.thCinema'), '',
        ]} />
      ) : bookings.length === 0 ? (
        <p className="admin-empty">{t('reservations.empty')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('reservations.thReference')}</th>
                <th>{t('reservations.thFilm')}</th>
                <th>{t('reservations.thSession')}</th>
                <th>{t('reservations.thClient')}</th>
                <th>{t('reservations.thSeats')}</th>
                <th>{t('reservations.thAmount')}</th>
                <th>{t('reservations.thPayment')}</th>
                <th>{t('reservations.thStatus')}</th>
                <th>{t('reservations.thCinema')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => {
                const started = new Date(b.session_time).getTime() <= now
                const cine    = VEEZI_MAP[veeziEtat(b)]
                return (
                <>
                  <tr key={b.id} className={`admin-tr ${expanded === b.id ? 'admin-tr--open' : ''} ${started ? 'admin-tr--past' : 'admin-tr--upcoming'}`}
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><code className="admin-ref">{b.booking_ref}</code></td>
                    <td className="admin-td-film">{b.film_title}</td>
                    <td className="admin-td-meta">
                      {formatDate(b.session_time, locale)}
                      <span className={`admin-temporal ${started ? 'is-past' : 'is-upcoming'}`}>
                        {started ? t('reservations.tagPast') : t('reservations.tagCancellable')}
                      </span>
                    </td>
                    <td className="admin-td-meta">{b.guest_name || b.guest_email || (b.user_id ? t('reservations.account') : t('reservations.guest'))}</td>
                    <td>{(b.booking_seats || []).map(s => s.display_key).join(', ') || '—'}</td>
                    <td>{formatMGA(b.total_amount_cents, moneyLocale)}</td>
                    <td>{b.payment_method ? payLabel(b.payment_method, t) : '—'}</td>
                    <td>
                      <span className={`admin-badge ${STATUS_MAP[b.status]?.cls || 'status-confirmed'}`}>
                        {STATUS_MAP[b.status] ? t(STATUS_MAP[b.status].key) : b.status}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-badge ${cine.cls}`} title={b.veezi_booking_number || undefined}>
                        {t(cine.key)}
                      </span>
                    </td>
                    <td>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"
                        style={{ transform: expanded === b.id ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>
                        <path d="M3 6l5 5 5-5" strokeLinecap="round"/>
                      </svg>
                    </td>
                  </tr>

                  {expanded === b.id && (
                    <tr key={`${b.id}-detail`} className="admin-tr-detail">
                      <td colSpan={10}>
                        <div className="admin-detail-panel">
                          <div className="admin-detail-grid">
                            <div><p className="adp-label">{t('reservations.dScreen')}</p><p className="adp-val">{b.screen_name || t('film.screenFallback', { id: b.screen_id })}</p></div>
                            <div><p className="adp-label">{t('reservations.dSessionId')}</p><p className="adp-val">{b.session_id}</p></div>
                            <div><p className="adp-label">{t('reservations.dEmail')}</p><p className="adp-val">{b.guest_email || '—'}</p></div>
                            <div><p className="adp-label">{t('reservations.dPhone')}</p><p className="adp-val">{b.guest_phone || '—'}</p></div>
                            <div><p className="adp-label">{t('reservations.dBookedOn')}</p><p className="adp-val">{formatDate(b.created_at, locale)}</p></div>
                            {/* Ce que le cinéma en sait : le n° de réservation
                                Veezi, ou la raison pour laquelle il n'y en a
                                pas. Sans cette ligne, un achat sans place au
                                cinéma ressemblait à tous les autres. */}
                            <div>
                              <p className="adp-label">{t('reservations.dVeezi')}</p>
                              <p className="adp-val">
                                {b.veezi_booking_number
                                  ? `${t(cine.key)} · ${b.veezi_booking_number}`
                                  : t(cine.key)}
                              </p>
                            </div>
                          </div>
                          <div className="admin-detail-actions">
                            {b.status !== 'confirmed' && b.status !== 'cancelled' && (
                              <button className="adp-btn adp-btn--confirm" onClick={() => updateStatus(b.id, 'confirmed')}>{t('reservations.confirm')}</button>
                            )}
                            {b.status !== 'used' && b.status !== 'cancelled' && (
                              <button className="adp-btn adp-btn--use" onClick={() => updateStatus(b.id, 'used')}>{t('reservations.markUsed')}</button>
                            )}
                            {/* Séance à venir & non annulée → annulation qui LIBÈRE la place au cinéma */}
                            {!started && b.status !== 'cancelled' && (
                              <button className="adp-btn adp-btn--cancel" disabled={actionBusyId === b.id}
                                onClick={() => cancelReservation(b)}>
                                {actionBusyId === b.id ? t('reservations.cancelling') : t('reservations.cancelBooking')}
                              </button>
                            )}
                            {/* Séance passée OU déjà annulée → plus d'annulation possible, suppression */}
                            {(started || b.status === 'cancelled') && (
                              <button className="adp-btn adp-btn--delete" disabled={actionBusyId === b.id}
                                onClick={() => deleteReservation(b)}>
                                {actionBusyId === b.id ? t('reservations.deleting') : t('reservations.deleteBooking')}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Modale de vérification d'un billet scanné
═══════════════════════════════════════════════════════════════ */
function VerifyModal({ verify, checking, t, locale, onCheckIn, onScanAgain, onClose }) {
  const { state, booking, ref } = verify

  // Billet introuvable
  if (state === 'notfound') {
    return (
      <div className="qrs-overlay" role="dialog" aria-modal="true">
        <div className="verify-card verify-card--bad">
          <div className="verify-icon verify-icon--bad">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="34" height="34">
              <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="verify-title">{t('reservations.notFound')}</h2>
          <p className="verify-sub">{t('reservations.notFoundSub')}</p>
          {ref && <code className="verify-ref">{ref}</code>}
          <div className="verify-actions">
            <button className="adp-btn" onClick={onScanAgain}>{t('reservations.rescan')}</button>
            <button className="adp-btn adp-btn--cancel" onClick={onClose}>{t('reservations.close')}</button>
          </div>
        </div>
      </div>
    )
  }

  const seats  = (booking.booking_seats || []).map(s => s.display_key).join(', ') || '—'
  const isUsed = booking.status === 'used'
  const isCancelled = booking.status === 'cancelled'
  const justChecked = state === 'checked'
  // Alerte si le billet est déjà utilisé AVANT ce scan, ou annulé
  const alreadyUsed = isUsed && !justChecked
  const ok = justChecked
  const tone = ok ? 'ok' : (alreadyUsed || isCancelled) ? 'bad' : 'neutral'

  return (
    <div className="qrs-overlay" role="dialog" aria-modal="true">
      <div className={`verify-card verify-card--${tone}`}>
        <div className={`verify-icon verify-icon--${tone}`}>
          {ok ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="34" height="34">
              <circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (alreadyUsed || isCancelled) ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="34" height="34">
              <path d="M12 3l9 16H3z" strokeLinejoin="round" /><path d="M12 10v4M12 17.5v.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="34" height="34">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" />
            </svg>
          )}
        </div>

        <h2 className="verify-title">
          {ok ? t('reservations.entryValidated') : alreadyUsed ? t('reservations.alreadyUsedTitle') : isCancelled ? t('reservations.cancelledTitle') : t('reservations.validTitle')}
        </h2>
        <p className="verify-sub">
          {ok ? t('reservations.entryValidatedSub')
            : alreadyUsed ? t('reservations.alreadyUsedSub')
            : isCancelled ? t('reservations.cancelledSub')
            : t('reservations.validSub')}
        </p>

        <div className="verify-detail">
          <code className="verify-ref">{booking.booking_ref}</code>
          <div className="verify-rows">
            <div className="verify-row"><span>{t('reservations.vFilm')}</span><b>{booking.film_title}</b></div>
            <div className="verify-row"><span>{t('reservations.vSession')}</span><b>{formatDate(booking.session_time, locale)}</b></div>
            <div className="verify-row"><span>{t('reservations.vScreen')}</span><b>{booking.screen_name || t('film.screenFallback', { id: booking.screen_id })}</b></div>
            <div className="verify-row"><span>{t('reservations.vSeats')}</span><b className="verify-seats">{seats}</b></div>
            <div className="verify-row"><span>{t('reservations.vClient')}</span><b>{booking.guest_name || booking.guest_email || t('reservations.guest')}</b></div>
            <div className="verify-row">
              <span>{t('reservations.vStatus')}</span>
              <b><span className={`admin-badge ${STATUS_MAP[booking.status]?.cls || 'status-confirmed'}`}>
                {STATUS_MAP[booking.status] ? t(STATUS_MAP[booking.status].key) : booking.status}
              </span></b>
            </div>
          </div>
        </div>

        <div className="verify-actions">
          {!ok && !alreadyUsed && !isCancelled && (
            <button className="verify-checkin-btn" disabled={checking} onClick={() => onCheckIn(booking)}>
              {checking ? t('reservations.validating') : t('reservations.validateEntry')}
            </button>
          )}
          <button className="adp-btn" onClick={onScanAgain}>{t('reservations.scanAnother')}</button>
          <button className="adp-btn adp-btn--cancel" onClick={onClose}>{t('reservations.close')}</button>
        </div>
      </div>
    </div>
  )
}
