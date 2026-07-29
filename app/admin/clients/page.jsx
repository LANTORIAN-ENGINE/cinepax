'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleDateString(locale, { dateStyle: 'short' })
}
function formatMGA(cents, moneyLocale = 'fr-MG') {
  if (!cents) return 'Ar 0'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

export default function AdminClients() {
  const { t, locale, moneyLocale } = useI18n()
  const [clients,  setClients]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)  // client id for details panel
  const [clientBookings, setClientBookings] = useState([])

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoading(true)
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    // Get all profiles with booking stats
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    // Get booking counts and totals per user
    const { data: bookingStats } = await supabase
      .from('bookings')
      .select('user_id, total_amount_cents, status, created_at')
      .not('user_id', 'is', null)

    // Also get guest bookings
    const { data: guestBookings } = await supabase
      .from('bookings')
      .select('guest_name, guest_email, total_amount_cents, created_at')
      .is('user_id', null)
      .not('guest_email', 'is', null)

    // Build enriched profiles
    const enriched = (profiles || []).map(p => {
      const pBks = (bookingStats || []).filter(b => b.user_id === p.id)
      return {
        ...p,
        type: 'registered',
        bookingCount: pBks.length,
        totalSpent: pBks.reduce((s, b) => s + (b.total_amount_cents || 0), 0),
        lastBooking: pBks.length > 0 ? pBks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at : null,
      }
    })

    // Group guests by email
    const guestMap = {}
    ;(guestBookings || []).forEach(b => {
      if (!b.guest_email) return
      if (!guestMap[b.guest_email]) {
        guestMap[b.guest_email] = { email: b.guest_email, name: b.guest_name, bookings: [] }
      }
      guestMap[b.guest_email].bookings.push(b)
    })
    const guests = Object.values(guestMap).map(g => ({
      id: `guest-${g.email}`,
      full_name: g.name || t('clients.guestName'),
      email: g.email,
      type: 'guest',
      bookingCount: g.bookings.length,
      totalSpent: g.bookings.reduce((s, b) => s + (b.total_amount_cents || 0), 0),
      lastBooking: g.bookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null,
    }))

    setClients([...enriched, ...guests])
    setLoading(false)
  }

  async function openClient(client) {
    if (selected === client.id) { setSelected(null); setClientBookings([]); return }
    setSelected(client.id)
    const supabase = createClient()
    if (!supabase) return

    let query
    if (client.type === 'registered') {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', client.id)
        .order('created_at', { ascending: false })
      query = data || []
    } else {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('guest_email', client.email)
        .is('user_id', null)
        .order('created_at', { ascending: false })
      query = data || []
    }
    setClientBookings(query)
  }

  const filtered = clients.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (c.full_name || '').toLowerCase().includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.phone || '').toLowerCase().includes(q)
  })

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('clients.title')}</h1>
        <span className="admin-page-count">{t('clients.count', { n: clients.length, count: clients.length })}</span>
      </div>

      <div className="admin-filters-row">
        <input
          type="text"
          className="admin-search-input"
          placeholder={t('clients.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="admin-table-loading"><div className="compte-spinner" /></div>
      ) : filtered.length === 0 ? (
        <p className="admin-empty">{t('clients.empty')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('clients.thClient')}</th>
                <th>{t('clients.thEmail')}</th>
                <th>{t('clients.thPhone')}</th>
                <th>{t('clients.thType')}</th>
                <th>{t('clients.thBookings')}</th>
                <th>{t('clients.thTotalSpent')}</th>
                <th>{t('clients.thLastBooking')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <>
                  <tr key={c.id}
                    className={`admin-tr admin-tr--clickable ${selected === c.id ? 'admin-tr--open' : ''}`}
                    onClick={() => openClient(c)}
                  >
                    <td>
                      <div className="admin-client-name">
                        <div className="admin-client-avatar">
                          {(c.full_name || c.email || 'U')[0].toUpperCase()}
                        </div>
                        {c.full_name || t('clients.noName')}
                      </div>
                    </td>
                    <td className="admin-td-meta">{c.email || '—'}</td>
                    <td className="admin-td-meta">{c.phone || '—'}</td>
                    <td>
                      <span className={`admin-badge ${c.type === 'registered' ? 'status-confirmed' : 'status-pending'}`}>
                        {c.type === 'registered' ? t('clients.registered') : t('clients.guest')}
                      </span>
                    </td>
                    <td>{c.bookingCount}</td>
                    <td>{formatMGA(c.totalSpent, moneyLocale)}</td>
                    <td className="admin-td-meta">{formatDate(c.lastBooking, locale)}</td>
                  </tr>

                  {selected === c.id && (
                    <tr key={`${c.id}-detail`} className="admin-tr-detail">
                      <td colSpan={7}>
                        <div className="admin-detail-panel">
                          <p className="adp-sub-title">{t('clients.history')}</p>
                          {clientBookings.length === 0 ? (
                            <p className="admin-empty">{t('clients.noBookings')}</p>
                          ) : (
                            <table className="admin-table admin-table--inner">
                              <thead>
                                <tr>
                                  <th>{t('clients.thReference')}</th>
                                  <th>{t('clients.thFilm')}</th>
                                  <th>{t('clients.thSession')}</th>
                                  <th>{t('clients.thSeats')}</th>
                                  <th>{t('clients.thAmount')}</th>
                                  <th>{t('clients.thStatus')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clientBookings.map(b => (
                                  <tr key={b.id}>
                                    <td><code className="admin-ref">{b.booking_ref}</code></td>
                                    <td>{b.film_title}</td>
                                    <td className="admin-td-meta">
                                      {new Date(b.session_time).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                                    </td>
                                    <td>—</td>
                                    <td>{formatMGA(b.total_amount_cents, moneyLocale)}</td>
                                    <td>
                                      <span className="admin-badge status-confirmed">
                                        {b.status || 'confirmed'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
