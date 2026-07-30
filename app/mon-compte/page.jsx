'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconLogOut, IconTicket, IconQr, IconClose } from '@/components/icons'
import { AccountSkeleton } from '@/components/skeletons'

const TZ = 'Etc/GMT-3'

function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })
}
function formatMGA(cents, moneyLocale = 'fr-MG') {
  if (!cents && cents !== 0) return '—'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

const STATUS_CLS = {
  confirmed: { key: 'account.statusConfirmed', cls: 'status-confirmed' },
  pending:   { key: 'account.statusPending',   cls: 'status-pending'   },
  cancelled: { key: 'account.statusCancelled', cls: 'status-cancelled' },
  used:      { key: 'account.statusUsed',      cls: 'status-used'      },
}
const PAY_METHOD_LABELS = {
  orange: 'Orange Money',
  mvola:  'MVola',
  card:   'account.payCard',
}

export default function MonComptePage() {
  const { t, locale, moneyLocale } = useI18n()
  const router = useRouter()
  const [user,      setUser]      = useState(null)
  const [profile,   setProfile]   = useState(null)
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('bookings') // 'bookings' | 'profile'
  const [qrOpen,    setQrOpen]    = useState(null)       // booking.id
  const [cancelBusyId, setCancelBusyId] = useState(null) // booking.id en cours d'annulation

  // Profile form
  const [editName,  setEditName]  = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState(null)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      setUser(user)

      // Rattache les réservations faites en visiteur avec le même email
      // (avant l'inscription) — puis on charge l'historique à jour.
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await fetch('/api/bookings/claim', {
            method:  'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        }
      } catch { /* best effort — l'historique reste consultable */ }

      const [{ data: prof }, { data: bks }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('bookings')
          .select('*, booking_seats(display_key)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      setProfile(prof)
      setEditName(prof?.full_name || user.user_metadata?.full_name || '')
      setEditPhone(prof?.phone || user.user_metadata?.phone || '')
      setBookings(bks || [])
      setLoading(false)
    })
  }, [])

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    const supabase = createClient()
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: editName.trim(),
      phone: editPhone.trim(),
    })
    setSaveMsg(t('account.saved'))
    setSaving(false)
  }

  async function logout() {
    const supabase = createClient()
    await supabase?.auth.signOut()
    router.push('/')
  }

  // Annule une réservation à venir : libère la place au cinéma (Veezi) puis la
  // passe en « annulée ». Nécessite un jeton de session pour l'API serveur.
  async function cancelBooking(booking) {
    if (!window.confirm(t('account.cancelConfirm'))) return
    setCancelBusyId(booking.id)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/veezi/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body:    JSON.stringify({ bookingRef: booking.booking_ref }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || 'failed')
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
    } catch {
      alert(t('account.cancelError'))
    } finally {
      setCancelBusyId(null)
    }
  }

  if (loading) return <AccountSkeleton />

  const upcoming = bookings.filter(b => new Date(b.session_time) >= new Date() && b.status !== 'cancelled')
  const past     = bookings.filter(b => new Date(b.session_time) <  new Date() || b.status === 'cancelled')

  return (
    <div className="compte-page">
      {/* — Header — */}
      <div className="compte-header">
        <div className="compte-header-inner">
          <div className="compte-avatar">
            {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="compte-header-text">
            <h1 className="compte-name">
              {profile?.full_name || user?.user_metadata?.full_name || t('account.defaultName')}
            </h1>
            <p className="compte-email">{user?.email}</p>
          </div>
          <button className="compte-logout-btn" onClick={logout}>
            <IconLogOut size={16} />
            {t('account.logout')}
          </button>
        </div>
      </div>

      {/* — Tabs — */}
      <div className="compte-tabs-wrap">
        <div className="compte-tabs">
          <button className={`compte-tab ${tab === 'bookings' ? 'active' : ''}`}
            onClick={() => setTab('bookings')}>
            {t('account.tabBookings')}
            <span className="compte-tab-count">{bookings.length}</span>
          </button>
          <button className={`compte-tab ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')}>
            {t('account.tabProfile')}
          </button>
        </div>
      </div>

      <div className="compte-content">

        {/* ═══ Onglet Réservations ═════════════════════════════════ */}
        {tab === 'bookings' && (
          <div className="compte-bookings">
            {bookings.length === 0 && (
              <div className="compte-empty">
                <IconTicket size={44} />
                <p>{t('account.empty')}</p>
                <a href="/" className="compte-empty-cta">{t('account.bookNow')}</a>
              </div>
            )}

            {upcoming.length > 0 && (
              <>
                <h2 className="compte-section-title">{t('account.upcoming')}</h2>
                <div className="compte-cards">
                  {upcoming.map(b => (
                    <BookingCard key={b.id} booking={b} qrOpen={qrOpen} setQrOpen={setQrOpen}
                      onCancel={cancelBooking} cancelBusy={cancelBusyId === b.id} />
                  ))}
                </div>
              </>
            )}

            {past.length > 0 && (
              <>
                <h2 className="compte-section-title compte-section-title--past">{t('account.past')}</h2>
                <div className="compte-cards compte-cards--past">
                  {past.map(b => <BookingCard key={b.id} booking={b} qrOpen={qrOpen} setQrOpen={setQrOpen} />)}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Onglet Profil ═══════════════════════════════════════ */}
        {tab === 'profile' && (
          <div className="compte-profile">
            <div className="compte-profile-card">
              <h2>{t('account.personalInfo')}</h2>
              <form onSubmit={saveProfile}>
                <div className="auth-field">
                  <label>{t('account.fullName')}</label>
                  <input type="text" value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Jean Rakoto" />
                </div>
                <div className="auth-field">
                  <label>{t('account.email')}</label>
                  <input type="email" value={user?.email || ''} disabled className="auth-input-disabled" />
                </div>
                <div className="auth-field">
                  <label>{t('account.phone')}</label>
                  <input type="tel" value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="+261 32 XX XXX XX" />
                </div>
                {saveMsg && <p className="compte-save-msg">{saveMsg}</p>}
                <button type="submit" className="auth-submit-btn" disabled={saving}>
                  {saving ? t('account.saving') : t('account.saveChanges')}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Carte de réservation ──────────────────────────────────────────────────────
function BookingCard({ booking, qrOpen, setQrOpen, onCancel, cancelBusy }) {
  const { t, locale, moneyLocale } = useI18n()
  const isOpen  = qrOpen === booking.id
  const status  = STATUS_CLS[booking.status] || STATUS_CLS.confirmed
  const qrData  = booking.qr_code_data || booking.booking_ref

  const seats = booking.booking_seats?.map(s => s.display_key).join(', ') || '—'
  const payLabel = PAY_METHOD_LABELS[booking.payment_method]

  // Annulable = séance à venir, pas déjà annulée / utilisée
  const cancellable = onCancel &&
    new Date(booking.session_time) > new Date() &&
    booking.status !== 'cancelled' && booking.status !== 'used'

  return (
    <div className={`bk-card ${isOpen ? 'bk-card--open' : ''}`}>
      <div className="bk-card-main">
        <div className="bk-card-left">
          <div className="bk-ref">{booking.booking_ref}</div>
          <h3 className="bk-film">{booking.film_title}</h3>
          <p className="bk-meta">
            {booking.screen_name || t('film.screenFallback', { id: booking.screen_id })}
            &nbsp;·&nbsp;
            {formatDate(booking.session_time, locale)}
          </p>
          <p className="bk-seats">{t('account.seatsLabel')} <strong>{seats}</strong></p>
          {booking.total_amount_cents > 0 && (
            <p className="bk-amount">{formatMGA(booking.total_amount_cents, moneyLocale)}</p>
          )}
        </div>
        <div className="bk-card-right">
          <span className={`bk-status ${status.cls}`}>{t(status.key)}</span>
          <button
            className="bk-qr-toggle"
            onClick={() => setQrOpen(isOpen ? null : booking.id)}
            aria-expanded={isOpen}
          >
            {isOpen ? <IconClose size={14} /> : <IconQr size={14} />}
            {isOpen ? t('account.close') : t('account.qrCode')}
          </button>
          {cancellable && (
            <button
              className="bk-cancel-btn"
              disabled={cancelBusy}
              onClick={() => onCancel(booking)}
            >
              {cancelBusy ? t('account.cancelling') : t('account.cancelBooking')}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="bk-qr-panel">
          <div className="bk-qr-frame">
            <QRCodeSVG value={qrData} size={148}
              bgColor="transparent" fgColor="currentColor" level="M" />
          </div>
          <div className="bk-qr-info">
            <p className="bk-qr-ref">{booking.booking_ref}</p>
            <p className="bk-qr-hint">{t('account.qrHint')}</p>
            {booking.payment_method && (
              <p className="bk-pay-method">
                {t('account.via')} {payLabel ? (payLabel.startsWith('account.') ? t(payLabel) : payLabel) : booking.payment_method}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
