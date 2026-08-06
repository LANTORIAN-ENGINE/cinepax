'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { useLegalDocuments } from '@/lib/useLegal'
import { buildConsentGroups } from '@/lib/legal'
import LegalConsent from '@/components/LegalConsent'
import { IconArrowRight } from '@/components/icons'

export default function RegisterPage() {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState(null)
  const [loading,   setLoading]   = useState(false)

  // Consentements. Les documents et leurs libellés viennent de la base :
  // c'est l'administration qui décide ce qui doit être accepté ici, et le
  // formulaire s'y adapte sans qu'on y retouche.
  const { documents } = useLegalDocuments({ body: true })
  const groups = useMemo(() => buildConsentGroups(documents, lang), [documents, lang])
  const [accepted, setAccepted]       = useState([])
  const [consentError, setConsentErr] = useState(null)

  const allGroupsAccepted = groups.every(g => accepted.includes(g.group))

  async function handleRegister(e) {
    e.preventDefault()
    setError(null)
    setConsentErr(null)

    if (password !== confirm) { setError(t('auth.errPwMatch')); return }
    if (password.length < 6)  { setError(t('auth.errPwLen')); return }

    // Le compte ne se crée pas tant que les cases obligatoires ne sont pas
    // cochées : accepter après coup n'aurait rien d'un consentement préalable.
    if (!allGroupsAccepted) { setConsentErr(t('legal.consentMissing')); return }

    setLoading(true)
    const supabase = createClient()
    if (!supabase) { setError(t('auth.errSupabase')); setLoading(false); return }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
    })

    if (error) { setError(error.message); setLoading(false); return }

    // Trace du consentement. La version acceptée et l'horodatage sont
    // relevés côté serveur : le navigateur ne dit que ce qui a été coché.
    //
    // Deux voies, selon que l'inscription ouvre une session tout de suite
    // ou attend une confirmation par e-mail. Sans session, la trace est
    // déposée sous l'adresse et rejoint le compte à la première connexion.
    const slugs = groups.flatMap(g => g.documents.map(d => d.slug))
    const token = data?.session?.access_token

    try {
      await fetch('/api/legal/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ slugs, context: 'register', locale: lang, email }),
      })
    } catch {
      // Le compte est créé : bloquer ici laisserait l'utilisateur devant un
      // formulaire qui a déjà abouti. Le rappel de consentement à la
      // connexion rattrapera une trace qui n'aurait pas été déposée.
    }

    router.push('/mon-compte')
  }

  return (
    <div className="auth-form-box">
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

        <LegalConsent
          groups={groups}
          value={accepted}
          onChange={next => { setAccepted(next); setConsentErr(null) }}
          error={consentError}
        />

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit-btn" disabled={loading || !allGroupsAccepted}>
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
