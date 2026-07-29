'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

const NAV = [
  {
    href: '/admin',
    labelKey: 'adminNav.dashboard',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
      </svg>
    ),
  },
  {
    href: '/admin/reservations',
    labelKey: 'adminNav.reservations',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10A1 1 0 019 9zm-3 0a1 1 0 100 2h.01a1 1 0 100-2H6z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    href: '/admin/clients',
    labelKey: 'adminNav.clients',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
      </svg>
    ),
  },
  {
    href: '/admin/prix',
    labelKey: 'adminNav.pricing',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
      </svg>
    ),
  },
]

export default function AdminLayout({ children }) {
  const { t } = useI18n()
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setChecking(false); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/auth/login'); return }

      // Vérification admin via API serveur (service role, bypass RLS)
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)

      const data = res?.ok ? await res.json().catch(() => ({})) : {}

      if (!data?.is_admin) { router.push('/'); return }
      setChecking(false)
    })
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase?.auth.signOut()
    router.push('/')
  }

  if (checking) return (
    <div className="admin-loading">
      <div className="compte-spinner" />
    </div>
  )

  return (
    <div className="admin-wrap">
      {/* Mobile overlay */}
      {sideOpen && <div className="admin-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`admin-sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-brand">
          <img src="/logo.jpg" alt="Cinepax" className="admin-brand-logo" />
          <div>
            <p className="admin-brand-name">Cinepax</p>
            <p className="admin-brand-role">{t('adminNav.brandRole')}</p>
          </div>
        </div>

        <nav className="admin-nav">
          {NAV.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${pathname === item.href ? 'active' : ''}`}
              onClick={() => setSideOpen(false)}
            >
              <span className="admin-nav-icon">{item.icon}</span>
              {t(item.labelKey)}
            </a>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <a href="/" className="admin-nav-item">
            <span className="admin-nav-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
              </svg>
            </span>
            {t('adminNav.publicSite')}
          </a>
          <button className="admin-nav-item admin-logout-btn" onClick={logout}>
            <span className="admin-nav-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
            </span>
            {t('adminNav.logout')}
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="admin-content">
        <button className="admin-menu-toggle" onClick={() => setSideOpen(s => !s)}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}
