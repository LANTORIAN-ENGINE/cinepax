'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconArrowRight } from '@/components/icons'
import { DashboardSkeleton } from '@/components/skeletons'

const TZ = 'Etc/GMT-3'

function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}
function formatMGA(cents, moneyLocale = 'fr-MG') {
  if (!cents) return 'Ar 0'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

export default function AdminDashboard() {
  const { t, locale, moneyLocale } = useI18n()
  const [stats,   setStats]   = useState(null)
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    Promise.all([
      supabase.from('bookings').select('id, total_amount_cents, status, created_at, payment_status').gte('created_at', todayStart.toISOString()),
      supabase.from('bookings').select('id, booking_ref, film_title, screen_name, session_time, total_amount_cents, status, payment_method, guest_name, user_id').order('created_at', { ascending: false }).limit(8),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]).then(([{ data: today }, { data: recent }, { count: clientCount }]) => {
      const todayRevenue = (today || []).reduce((s, b) => s + (b.total_amount_cents || 0), 0)
      const todayCount   = (today || []).length
      const paidCount    = (today || []).filter(b => b.payment_status === 'paid' || b.status === 'confirmed').length

      setStats({ todayRevenue, todayCount, paidCount, clientCount: clientCount || 0 })
      setRecent(recent || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <DashboardSkeleton />

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('dashboard.title')}</h1>
        <p className="admin-page-subtitle">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Chiffres du jour ──────────────────────────────────────
          Une bande à filets plutôt que quatre cartes identiques : les
          nombres portent la hiérarchie, et la recette du jour — le seul
          chiffre qu'on regarde vraiment en premier — reçoit l'accent. */}
      <div className="dash-rail">
        <Figure
          label={t('dashboard.todayRevenue')}
          value={formatMGA(stats?.todayRevenue, moneyLocale)}
          lead
        />
        <Figure
          label={t('dashboard.todayBookings')}
          value={stats?.todayCount ?? 0}
        />
        <Figure
          label={t('dashboard.confirmedSeats')}
          value={stats?.paidCount ?? 0}
          note={stats?.todayCount
            ? t('dashboard.ofToday', { n: stats.todayCount })
            : null}
        />
        <Figure
          label={t('dashboard.registeredClients')}
          value={stats?.clientCount ?? 0}
        />
      </div>

      {/* ── Dernières réservations ── */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t('dashboard.latest')}</h2>
          <a href="/admin/reservations" className="admin-section-link">
            {t('dashboard.viewAll')}
            <IconArrowRight size={14} />
          </a>
        </div>

        {recent.length === 0 ? (
          <p className="admin-empty">{t('dashboard.empty')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('dashboard.thReference')}</th>
                  <th>{t('dashboard.thFilm')}</th>
                  <th>{t('dashboard.thSession')}</th>
                  <th>{t('dashboard.thClient')}</th>
                  <th>{t('dashboard.thAmount')}</th>
                  <th>{t('dashboard.thStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(b => (
                  <tr key={b.id}>
                    <td><code className="admin-ref">{b.booking_ref}</code></td>
                    <td className="admin-td-film">{b.film_title}</td>
                    <td className="admin-td-meta">{formatDate(b.session_time, locale)}</td>
                    <td className="admin-td-meta">{b.guest_name || (b.user_id ? t('dashboard.client') : t('dashboard.guest'))}</td>
                    <td>{formatMGA(b.total_amount_cents, moneyLocale)}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Figure({ label, value, note, lead = false }) {
  return (
    <div className={`dash-figure ${lead ? 'dash-figure--lead' : ''}`}>
      <p className="dash-figure-label">{label}</p>
      <p className="dash-figure-value">{value}</p>
      {note && <p className="dash-figure-note">{note}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const { t } = useI18n()
  const map = {
    confirmed: { key: 'dashboard.statusConfirmed', cls: 'status-confirmed' },
    pending:   { key: 'dashboard.statusPending',   cls: 'status-pending'   },
    cancelled: { key: 'dashboard.statusCancelled', cls: 'status-cancelled' },
    used:      { key: 'dashboard.statusUsed',      cls: 'status-used'      },
  }
  const s = map[status] || map.confirmed
  return <span className={`admin-badge ${s.cls}`}>{t(s.key)}</span>
}
