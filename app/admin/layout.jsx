'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconGauge, IconTicket, IconUsers, IconTag, IconHome, IconLogOut, IconMenu, IconMail, IconDoc } from '@/components/icons'
import { AdminChromeSkeleton } from '@/components/skeletons'

const NAV = [
  { href: '/admin',              labelKey: 'adminNav.dashboard',    Icon: IconGauge  },
  { href: '/admin/reservations', labelKey: 'adminNav.reservations', Icon: IconTicket },
  { href: '/admin/clients',      labelKey: 'adminNav.clients',      Icon: IconUsers  },
  { href: '/admin/messages',     labelKey: 'adminNav.messages',     Icon: IconMail   },
  { href: '/admin/prix',         labelKey: 'adminNav.pricing',      Icon: IconTag    },
  { href: '/admin/legal',        labelKey: 'adminNav.legal',        Icon: IconDoc    },
]

export default function AdminLayout({ children }) {
  const { t } = useI18n()
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [sideOpen, setSideOpen] = useState(false)
  const [newMessages, setNewMessages] = useState(0)

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

      // Messages non traités : le compteur signale ce qui attend une
      // réponse, la raison d'ouvrir la page plutôt que de la chercher.
      fetch('/api/admin/messages?status=new', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => (r.ok ? r.json() : null))
        .then(d => setNewMessages(d?.counts?.new || 0))
        .catch(() => {})
    })
  }, [pathname])

  async function logout() {
    const supabase = createClient()
    await supabase?.auth.signOut()
    router.push('/')
  }

  if (checking) return <AdminChromeSkeleton />

  return (
    <div className="admin-wrap">
      {/* Mobile overlay */}
      {sideOpen && <div className="admin-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`admin-sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-brand">
          <img src="/logo2.png" alt="Cinepax" className="admin-brand-logo" />
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
              <span className="admin-nav-icon"><item.Icon /></span>
              {t(item.labelKey)}
              {item.href === '/admin/messages' && newMessages > 0 && (
                <span className="admin-nav-count">{newMessages}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <a href="/" className="admin-nav-item">
            <span className="admin-nav-icon"><IconHome /></span>
            {t('adminNav.publicSite')}
          </a>
          <button className="admin-nav-item admin-logout-btn" onClick={logout}>
            <span className="admin-nav-icon"><IconLogOut /></span>
            {t('adminNav.logout')}
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="admin-content">
        <button
          className="admin-menu-toggle"
          onClick={() => setSideOpen(s => !s)}
          aria-label={t('adminNav.menu')}
          aria-expanded={sideOpen}
        >
          <IconMenu size={22} />
        </button>
        {children}
      </div>
    </div>
  )
}
