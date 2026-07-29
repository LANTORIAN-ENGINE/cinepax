'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

export default function NavAuth() {
  const { t } = useI18n()
  const [user,    setUser]    = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [open,    setOpen]    = useState(false)

  // Vérifie le statut admin via l'API serveur (service role, bypass RLS)
  async function fetchAdminStatus(jwt) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return false
      const data = await res.json()
      return data.is_admin === true
    } catch {
      return false
    }
  }

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    // onAuthStateChange comme seule source de vérité
    // — fire immédiatement avec INITIAL_SESSION sur la page initiale
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) {
          setUser(null)
          setIsAdmin(false)
          return
        }

        setUser(session.user)

        // JWT disponible dans session.access_token
        const admin = await fetchAdminStatus(session.access_token)
        setIsAdmin(admin)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase?.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setOpen(false)
    window.location.href = '/'
  }

  /* ── Visiteur ──────────────────────────────────────────────── */
  if (!user) return (
    <div className="nav-auth-wrap">
      <a href="/auth/login"    className="nav-auth-btn nav-auth-btn--ghost">{t('auth_nav.login')}</a>
      <a href="/auth/register" className="nav-auth-btn nav-auth-btn--primary">{t('auth_nav.register')}</a>
    </div>
  )

  /* ── Utilisateur connecté ──────────────────────────────────── */
  const initial = (user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()

  return (
    <div className="nav-auth-wrap nav-user-wrap">
      {/* Raccourci admin visible dans la navbar */}
      {isAdmin && (
        <a href="/admin" className="nav-admin-link">
          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
          </svg>
          {t('auth_nav.admin')}
        </a>
      )}

      {/* Avatar + dropdown */}
      <div className="nav-user-menu-wrap">
        <button className="nav-user-btn" onClick={() => setOpen(o => !o)}>
          <span className="nav-user-avatar" style={isAdmin ? { background: '#e8192c' } : {}}>
            {initial}
          </span>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
            <path d="M2 4l4 4 4-4" strokeLinecap="round"/>
          </svg>
        </button>

        {open && (
          <>
            <div className="nav-user-overlay" onClick={() => setOpen(false)} />
            <div className="nav-user-dropdown">

              {/* En-tête */}
              <div className="nav-user-dropdown-header">
                <div className="nav-dd-name-row">
                  <p>{user.user_metadata?.full_name || user.email?.split('@')[0]}</p>
                  {isAdmin && <span className="nav-dd-admin-badge">{t('auth_nav.admin')}</span>}
                </div>
                <p className="nav-dd-email">{user.email}</p>
              </div>

              {/* Menu selon le rôle */}
              {isAdmin ? (
                <>
                  <a href="/admin" className="nav-dd-item nav-dd-item--primary" onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                    </svg>
                    {t('auth_nav.dashboard')}
                  </a>
                  <a href="/admin/reservations" className="nav-dd-item" onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10A1 1 0 019 9zm-3 0a1 1 0 100 2h.01a1 1 0 100-2H6z" clipRule="evenodd"/>
                    </svg>
                    {t('auth_nav.reservations')}
                  </a>
                  <a href="/admin/clients" className="nav-dd-item" onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                    </svg>
                    {t('auth_nav.clients')}
                  </a>
                  <a href="/admin/prix" className="nav-dd-item" onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                    </svg>
                    {t('auth_nav.pricing')}
                  </a>
                  <div className="nav-dd-sep" />
                  <a href="/" className="nav-dd-item nav-dd-item--muted" onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5H4v2h1V5zM4 9H3v2h1V9zm0 4H3v2h1v-2z" clipRule="evenodd"/>
                    </svg>
                    {t('auth_nav.publicSite')}
                  </a>
                </>
              ) : (
                <a href="/mon-compte" className="nav-dd-item" onClick={() => setOpen(false)}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  {t('auth_nav.myBookings')}
                </a>
              )}

              <button className="nav-dd-item nav-dd-logout" onClick={logout}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                {t('auth_nav.logout')}
              </button>

            </div>
          </>
        )}
      </div>
    </div>
  )
}
