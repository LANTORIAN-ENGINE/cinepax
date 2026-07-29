'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

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

  if (loading) return <div className="admin-page-loading"><div className="compte-spinner" /></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('dashboard.title')}</h1>
        <p className="admin-page-subtitle">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="admin-stats-grid">
        <StatCard
          label={t('dashboard.todayBookings')}
          value={stats?.todayCount ?? 0}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10A1 1 0 019 9zm-3 0a1 1 0 100 2h.01a1 1 0 100-2H6z" clipRule="evenodd"/>
            </svg>
          }
          color="#e8192c"
        />
        <StatCard
          label={t('dashboard.todayRevenue')}
          value={formatMGA(stats?.todayRevenue, moneyLocale)}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
            </svg>
          }
          color="#22c55e"
        />
        <StatCard
          label={t('dashboard.confirmedSeats')}
          value={stats?.paidCount ?? 0}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          }
          color="#4a9eff"
        />
        <StatCard
          label={t('dashboard.registeredClients')}
          value={stats?.clientCount ?? 0}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
          }
          color="#a855f7"
        />
      </div>

      {/* ── Dernières réservations ── */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t('dashboard.latest')}</h2>
          <a href="/admin/reservations" className="admin-section-link">{t('dashboard.viewAll')}</a>
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

function StatCard({ label, value, icon, color }) {
  return (
    <div className="admin-stat-card" style={{ '--sc': color }}>
      <div className="admin-stat-icon">{icon}</div>
      <div className="admin-stat-body">
        <p className="admin-stat-value">{value}</p>
        <p className="admin-stat-label">{label}</p>
      </div>
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
