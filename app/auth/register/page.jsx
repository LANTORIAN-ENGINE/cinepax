'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { IconArrowRight } from '@/components/icons'

export default function RegisterPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState(null)
  const [loading,   setLoading]   = useState(false)

  async function handleRegister(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) { setError(t('auth.errPwMatch')); return }
    if (password.length < 6)  { setError(t('auth.errPwLen')); return }

    setLoading(true)
    const supabase = createClient()
    if (!supabase) { setError(t('auth.errSupabase')); setLoading(false); return }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
    })

    if (error) { setError(error.message); setLoading(false); return }
    router.push('/mon-compte')
  }

  return (
    <div className="auth-form-box">
      <img src="/logo2.png" alt="Cinepax" className="auth-logo" />
      <h1 className="auth-title">{t('auth.registerTitle')}</h1>
      <p className="auth-subtitle">{t('auth.registerSubtitle')}</p>

      <form onSubmit={handleRegister} className="auth-form">
        <div className="auth-field">
          <label>{t('auth.fullNameLabel')}</label>
          <input type="text" value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Jean Rakoto"
            autoComplete="name" required
          />
        </div>
        <div className="auth-field">
          <label>{t('auth.emailLabel')}</label>
          <input type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jean@example.mg"
            autoComplete="email" required
          />
        </div>
        <div className="auth-field">
          <label>{t('auth.phoneLabel')}</label>
          <input type="tel" value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+261 32 XX XXX XX"
            autoComplete="tel"
          />
        </div>
        <div className="auth-field">
          <label>{t('auth.passwordLabel')}</label>
          <input type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('auth.passwordMin')}
            autoComplete="new-password" required
          />
        </div>
        <div className="auth-field">
          <label>{t('auth.confirmPassword')}</label>
          <input type="password" value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password" required
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? t('auth.creating') : t('auth.registerBtn')}
        </button>
      </form>

      <div className="auth-switch">
        <p className="auth-switch-q">{t('auth.alreadyCustomer')}</p>
        <Link href="/auth/login" className="auth-switch-btn">
          {t('auth.loginLink')}
          <IconArrowRight size={15} />
        </Link>
      </div>

      <p className="auth-back">
        <Link href="/" className="auth-link auth-link--ghost">{t('auth.backHome')}</Link>
      </p>
    </div>
  )
}
