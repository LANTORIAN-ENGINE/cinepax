'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

// Rend un texte multi-ligne (séparé par \n) avec des <br/>
function MultiLine({ text }) {
  return text.split('\n').map((line, i) => (
    <span key={i}>{i > 0 && <br />}{line}</span>
  ))
}

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
    <div className="auth-page">
      {/* — Panneau artistique gauche — */}
      <div className="auth-artwork" aria-hidden>
        <div className="auth-artwork-inner">
          <div className="auth-film-strip">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="auth-film-frame" style={{ '--fi': i }} />
            ))}
          </div>
          <div className="auth-artwork-text">
            <p className="auth-artwork-eyebrow">{t('auth.eyebrow')}</p>
            <h2 className="auth-artwork-headline"><MultiLine text={t('auth.loginHeadline')} /></h2>
            <p className="auth-artwork-sub">{t('auth.loginArtSub')}</p>
          </div>
        </div>
      </div>

      {/* — Formulaire — */}
      <div className="auth-form-side">
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

          <div className="auth-links">
            <p>{t('auth.noAccount')}{' '}
              <a href="/auth/register" className="auth-link">{t('auth.createAccount')}</a>
            </p>
            <p><a href="/" className="auth-link auth-link--ghost">{t('auth.backHome')}</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
