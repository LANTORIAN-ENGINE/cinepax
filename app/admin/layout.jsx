'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconGauge, IconTicket, IconUsers, IconTag, IconHome, IconLogOut, IconMenu, IconMail, IconDoc, IconSliders, IconFilm } from '@/components/icons'
import { AdminChromeSkeleton } from '@/components/skeletons'

const NAV = [
  { href: '/admin',              labelKey: 'adminNav.dashboard',    Icon: IconGauge  },
  { href: '/admin/reservations', labelKey: 'adminNav.reservations', Icon: IconTicket },
  { href: '/admin/clients',      labelKey: 'adminNav.clients',      Icon: IconUsers  },
  { href: '/admin/messages',     labelKey: 'adminNav.messages',     Icon: IconMail   },
  { href: '/admin/prix',         labelKey: 'adminNav.pricing',      Icon: IconTag    },
  { href: '/admin/bandes-annonces', labelKey: 'adminNav.trailers',  Icon: IconFilm   },
  { href: '/admin/legal',        labelKey: 'adminNav.legal',        Icon: IconDoc    },
  { href: '/admin/parametres',   labelKey: 'adminNav.settings',     Icon: IconSliders },
]

// ─── Coque de l'administration ────────────────────────────────────────────────
//
// Ce composant est monté une fois, à l'entrée dans l'espace, et ne l'est plus
// jamais tant qu'on y reste : le rail de gauche, son défilement et le compteur
// de messages traversent les changements de page. Deux conditions à cela, et
// elles se perdent facilement :
//
//   1. La navigation passe par <Link>. Un <a href> déclenche un chargement de
//      document complet — React redémarre, la barre latérale se redessine, les
//      droits se revérifient : exactement ce qu'on cherche à éviter.
//
//   2. Le contrôle d'accès ne se rejoue pas à chaque clic. Il se fait à
//      l'entrée, puis se *surveille* via onAuthStateChange. Une vérification
//      indexée sur le chemin coûtait deux appels réseau par clic et pouvait
//      faire courir deux redirections l'une contre l'autre.
//
// Ce qui charge à la navigation, c'est le corps : chaque page tient son propre
// écran d'attente, et app/admin/loading.jsx couvre l'intervalle où son code
// n'est pas encore arrivé.
export default function AdminLayout({ children }) {
  const { t } = useI18n()
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [sideOpen, setSideOpen] = useState(false)
  const [newMessages, setNewMessages] = useState(0)
  // La déconnexion navigue elle-même ; sans ce drapeau la surveillance de
  // session partirait vers /auth/login au même instant.
  const leaving = useRef(false)

  // ── Contrôle d'accès : une fois à l'entrée, puis en veille ──────────────────
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setChecking(false); return }
    let alive = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.replace('/auth/login'); return }

      // Vérification admin via API serveur (service role, bypass RLS)
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)

      const data = res?.ok ? await res.json().catch(() => ({})) : {}

      if (!alive) return
      if (!data?.is_admin) { router.replace('/'); return }
      setChecking(false)
    })

    // Session perdue après l'entrée — expiration, ou déconnexion depuis un
    // autre onglet : on sort. C'est ce qui remplace la revérification par page.
    // L'état initial, lui, est l'affaire du getSession ci-dessus.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && !leaving.current) router.replace('/auth/login')
    })

    return () => { alive = false; subscription.unsubscribe() }
  }, [router])

  // ── Compteur de messages non traités ───────────────────────────────────────
  // Le seul relevé qui suit la navigation : il signale ce qui attend une
  // réponse, la raison d'ouvrir la page plutôt que de la chercher. Il se refait
  // au changement de page — notamment au retour de /admin/messages, où l'état
  // vient justement de bouger — sans rien retarder à l'écran.
  const refreshMessages = useCallback(async () => {
    const supabase = createClient()
    if (!supabase) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    try {
      const res = await fetch('/api/admin/messages?status=new', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) setNewMessages((await res.json())?.counts?.new || 0)
    } catch { /* le compteur n'est qu'un indice : il peut manquer */ }
  }, [])

  useEffect(() => {
    if (checking) return
    refreshMessages()
  }, [pathname, checking, refreshMessages])

  // Le tiroir mobile se referme sur la page atteinte, y compris quand elle
  // l'est par le bouton retour du navigateur.
  useEffect(() => { setSideOpen(false) }, [pathname])

  async function logout() {
    leaving.current = true
    const supabase = createClient()
    await supabase?.auth.signOut()
    router.replace('/')
  }

  if (checking) return <AdminChromeSkeleton />

  return (
    <div className="admin-wrap">
      {/* Mobile overlay */}
      {sideOpen && <div className="admin-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`admin-sidebar ${sideOpen ? 'open' : ''}`}>
        {/* Le logo est déjà porté par la barre de navigation, juste au-dessus
            de ce rail : ici il ne reste que ce qui nomme l'espace. */}
        <div className="admin-sidebar-brand">
          <p className="admin-brand-name">Cinepax</p>
          <p className="admin-brand-role">{t('adminNav.brandRole')}</p>
        </div>

        <nav className="admin-nav">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${pathname === item.href ? 'active' : ''}`}
              aria-current={pathname === item.href ? 'page' : undefined}
              onClick={() => setSideOpen(false)}
            >
              <span className="admin-nav-icon"><item.Icon /></span>
              {t(item.labelKey)}
              {item.href === '/admin/messages' && newMessages > 0 && (
                <span className="admin-nav-count">{newMessages}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link href="/" className="admin-nav-item">
            <span className="admin-nav-icon"><IconHome /></span>
            {t('adminNav.publicSite')}
          </Link>
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
          <IconMenu size={19} />
          {/* Le mot accompagne le pictogramme : seul, il se lisait comme un
              ornement posé en haut de page. Il ne paraît qu'en dessous de
              900 px, là où la colonne devient un tiroir. */}
          <span className="admin-menu-toggle-label">{t('adminNav.sections')}</span>
        </button>
        {children}
      </div>
    </div>
  )
}
