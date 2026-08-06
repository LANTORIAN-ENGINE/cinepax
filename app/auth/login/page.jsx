'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { useLegalDocuments } from '@/lib/useLegal'
import { buildConsentGroups } from '@/lib/legal'
import LegalConsent from '@/components/LegalConsent'
import { IconArrowRight, IconAlert } from '@/components/icons'

export default function LoginPage() {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  // Reconsentement. Une version publiée depuis la dernière visite rend le
  // consentement précédent caduc : on le redemande à l'entrée, une fois
  // l'identité vérifiée, plutôt que de laisser le compte tourner sur un
  // accord donné pour un autre texte.
  const { documents } = useLegalDocuments({ body: true })
  const [pending, setPending]   = useState(null)   // null = rien à demander
  const [accepted, setAccepted] = useState([])
  const [consentError, setConsentErr] = useState(null)
  const [saving, setSaving] = useState(false)

  const pendingGroups = useMemo(() => {
    if (!pending?.slugs?.length) return []
    return buildConsentGroups(
      documents.filter(d => pending.slugs.includes(d.slug)),
      lang
    )
  }, [pending, documents, lang])

  async function landing(supabase, user) {
    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    return profile?.is_admin ? '/admin' : '/mon-compte'
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    if (!supabase) { setError(t('auth.errSupabase')); setLoading(false); return }

    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? t('auth.errCreds')
        : error.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const next  = await landing(supabase, user)
    const token = signIn?.session?.access_token

    // Cet appel réclame aussi les consentements laissés sous l'adresse
    // avant la création du compte — voir GET /api/legal/consent.
    try {
      const res  = await fetch('/api/legal/consent', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()

      if (res.ok && data.pending?.length) {
        setPending({ slugs: data.pending, next, token })
        setLoading(false)
        return
      }
    } catch {
      // Le rappel n'est pas un péage : si l'appel échoue, la connexion
      // aboutit quand même et la demande reviendra au prochain passage.
    }

    router.push(next)
  }

  async function confirmConsent() {
    if (!pendingGroups.every(g => accepted.includes(g.group))) {
      setConsentErr(t('legal.consentMissing'))
      return
    }

    setSaving(true)
    setConsentErr(null)
    try {
      const res = await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pending.token}` },
        body: JSON.stringify({ slugs: pending.slugs, context: 'login', locale: lang }),
      })
      if (!res.ok) { setConsentErr(t('legal.consentSaveError')); return }
      router.push(pending.next)
    } catch {
      setConsentErr(t('legal.consentSaveError'))
    } finally {
      setSaving(false)
    }
  }

  // ── Écran de reconsentement ──
  if (pending) {
    const count = pending.slugs.length
    const titles = pendingGroups
      .flatMap(g => g.documents.map(d => d.title))
      .join(', ')

    return (
      <div className="auth-form-box auth-form-box--consent">
        <span className="auth-consent-mark" aria-hidden="true"><IconAlert size={22} /></span>
        <h1 className="auth-title">{t('legal.updateTitle')}</h1>
        <p className="auth-subtitle">
          {t('legal.updateLead', {
            docs: titles,
            verb: t(count > 1 ? 'legal.updateVerbMany' : 'legal.updateVerbOne'),
          })}
        </p>

        <LegalConsent
          groups={pendingGroups}
          value={accepted}
          onChange={next => { setAccepted(next); setConsentErr(null) }}
          error={consentError}
        />

        <button
          type="button"
          className="auth-submit-btn"
          onClick={confirmConsent}
          disabled={saving || !pendingGroups.every(g => accepted.includes(g.group))}
        >
          {saving ? t('legal.updateSaving') : t('legal.updateAccept')}
        </button>
      </div>
    )
  }

  return (
    <div className="auth-form-box">
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
