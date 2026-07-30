'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconArrowRight } from '@/components/icons'

export default function LoginPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    if (!supabase) { setError(t('auth.errSupabase')); setLoading(false); return }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? t('auth.errCreds')
        : error.message)
      setLoading(false)
      return
    }

    // Check if admin → redirect to admin, else client space
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    router.push(profile?.is_admin ? '/admin' : '/mon-compte')
  }

  return (
    <div className="auth-form-box">
      <img src="/logo.jpg" alt="Cinepax" className="auth-logo" />
      <h1 className="auth-title">{t('auth.loginTitle')}</h1>
      <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>

      <form onSubmit={handleLogin} className="auth-form">
        <div className="auth-field">
          <label>{t('auth.emailLabel')}</label>
          <input type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jean@example.mg"
            autoComplete="email" required
          />
        </div>
        <div className="auth-field">
          <label>{t('auth.passwordLabel')}</label>
          <input type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password" required
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? t('auth.loggingIn') : t('auth.loginBtn')}
        </button>
      </form>

      {/* Seul passage vers l'inscription depuis que la barre ne propose plus
          qu'une porte : il doit se voir. Link et non <a> — un rechargement
          complet emporterait le panneau et son animation. */}
      <div className="auth-switch">
        <p className="auth-switch-q">{t('auth.noAccount')}</p>
        <Link href="/auth/register" className="auth-switch-btn">
          {t('auth.createAccount')}
          <IconArrowRight size={15} />
        </Link>
      </div>

      <p className="auth-back">
        <Link href="/" className="auth-link auth-link--ghost">{t('auth.backHome')}</Link>
      </p>
    </div>
  )
}
