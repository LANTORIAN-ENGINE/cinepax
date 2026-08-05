'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { CONTACT } from '@/lib/contenu'
import { SLUG_PDD } from '@/lib/legal'
import LegalDocLink from '@/components/LegalDocLink'

// ─── Formulaire de contact ────────────────────────────────────────────────────
// L'e-mail est le seul champ dont dépend le reste : il sert à répondre, et il
// rattache la demande au compte client quand l'adresse correspond (le lien se
// fait en base, sur l'e-mail seul). Le formulaire le dit à l'utilisateur plutôt
// que de le faire en silence — d'où le bandeau « connecté en tant que » et la
// mention de rattachement sur l'écran de confirmation.

const SUBJECTS = ['booking', 'rates', 'event', 'advertising', 'complaint', 'other']

const MSG_MAX  = 4000
const MSG_MIN  = 10
const NAME_MIN = 2
const NAME_MAX = 120

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/

const EMPTY = {
  subject: 'booking',
  fullName: '',
  email: '',
  phone: '',
  message: '',
  consent: false,
  company: '',   // honeypot
}

export default function ContactForm() {
  const { t, locale } = useI18n()
  const uid = useId()

  const [values,  setValues]  = useState(EMPTY)
  const [errors,  setErrors]  = useState({})
  const [touched, setTouched] = useState({})
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState(null)   // erreur globale (réseau, serveur)
  const [sent,    setSent]    = useState(null)       // { ref, linked }
  const [account, setAccount] = useState(null)       // { email, fullName, phone }

  const panelRef = useRef(null)
  const firstErrorRef = useRef(null)

  // Pré-remplissage depuis le compte connecté : on ne fait pas resaisir ce que
  // l'on connaît déjà. L'utilisateur reste libre de tout modifier.
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    let cancelled = false

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled || !user) return
      const { data: profile } = await supabase
        .from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle()
      if (cancelled) return

      const fullName = profile?.full_name || user.user_metadata?.full_name || ''
      const phone    = profile?.phone     || user.user_metadata?.phone     || ''
      setAccount({ email: user.email, fullName, phone })
      setValues(v => ({
        ...v,
        fullName: v.fullName || fullName,
        email:    v.email    || user.email || '',
        phone:    v.phone    || phone,
      }))
    })

    return () => { cancelled = true }
  }, [])

  function validate(vals) {
    const e = {}
    const name = vals.fullName.trim()
    if (name.length < NAME_MIN || name.length > NAME_MAX) e.fullName = t('cform.errName')

    const email = vals.email.trim()
    if (!email || !EMAIL_RE.test(email) || email.length > 254) e.email = t('cform.errEmail')

    if (vals.phone.trim().length > 40) e.phone = t('cform.errPhone')

    const msg = vals.message.trim()
    if (msg.length < MSG_MIN || msg.length > MSG_MAX) e.message = t('cform.errMessage')

    if (!vals.consent) e.consent = t('cform.errConsent')
    return e
  }

  function set(field, value) {
    const next = { ...values, [field]: value }
    setValues(next)
    // On ne surligne un champ qu'après l'avoir quitté une première fois ;
    // ensuite l'erreur se lève dès qu'elle est corrigée, sans attendre le blur.
    if (touched[field]) {
      setErrors(prev => ({ ...prev, [field]: validate(next)[field] }))
    }
    if (formError) setFormError(null)
  }

  function blur(field) {
    setTouched(prev => ({ ...prev, [field]: true }))
    setErrors(prev => ({ ...prev, [field]: validate(values)[field] }))
  }

  async function submit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    setTouched({ fullName: true, email: true, phone: true, message: true, consent: true })

    if (Object.keys(found).length) {
      // Le focus part sur le premier champ en défaut : au clavier comme au
      // lecteur d'écran, on sait immédiatement quoi corriger.
      requestAnimationFrame(() => firstErrorRef.current?.focus())
      return
    }

    setSending(true)
    setFormError(null)
    try {
      const res = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName: values.fullName.trim(),
          email:    values.email.trim(),
          phone:    values.phone.trim(),
          subject:  values.subject,
          message:  values.message.trim(),
          company:  values.company,
          locale,
        }),
      })

      if (res.status === 429) { setFormError(t('cform.errRate')); return }

      const data = await res.json().catch(() => ({}))

      if (res.status === 422 && data.fields) {
        const map = {
          fullName: t('cform.errName'), email: t('cform.errEmail'),
          phone: t('cform.errPhone'),   message: t('cform.errMessage'),
        }
        setErrors(Object.fromEntries(Object.keys(data.fields).map(k => [k, map[k]])))
        requestAnimationFrame(() => firstErrorRef.current?.focus())
        return
      }

      if (!res.ok || !data.ok) {
        setFormError(t('cform.errServer', { email: CONTACT.email }))
        return
      }

      setSent({ ref: data.ref, linked: data.linked })
      requestAnimationFrame(() => panelRef.current?.focus())
    } catch {
      setFormError(t('cform.errNetwork'))
    } finally {
      setSending(false)
    }
  }

  function writeAgain() {
    setSent(null)
    setErrors({})
    setTouched({})
    setValues({
      ...EMPTY,
      fullName: account?.fullName || '',
      email:    account?.email    || '',
      phone:    account?.phone    || '',
    })
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <section className="cform" aria-labelledby={`${uid}-ok`}>
        <div className="cform-perf" aria-hidden="true" />
        <div className="cform-body cform-done" ref={panelRef} tabIndex={-1}>
          <span className="cform-done-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="cform-done-title" id={`${uid}-ok`}>{t('cform.okTitle')}</h2>
          <p className="cform-done-lead">{t('cform.okLead')}</p>

          <p className="cform-done-ref">
            <span className="cform-done-ref-label">{t('cform.okRef')}</span>
            <code>{sent.ref}</code>
          </p>

          <p className="cform-done-note">
            {sent.linked ? t('cform.okLinked') : t('cform.okGuest')}
          </p>

          <div className="cform-done-actions">
            <a className="cform-submit" href={sent.linked ? '/mon-compte?onglet=demandes' : '/auth/register'}>
              {sent.linked ? t('cform.okLinkedCta') : t('cform.okGuestCta')}
            </a>
            <button type="button" className="cform-ghost" onClick={writeAgain}>
              {t('cform.okAgain')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Le premier champ en défaut reçoit la ref, dans l'ordre visuel du formulaire.
  const order = ['fullName', 'email', 'phone', 'message', 'consent']
  const firstBad = order.find(f => errors[f])
  const refFor = f => (f === firstBad ? firstErrorRef : undefined)

  const msgLen = values.message.length
  const nearMax = msgLen > MSG_MAX * 0.9

  return (
    <section className="cform" aria-labelledby={`${uid}-title`}>
      <div className="cform-perf" aria-hidden="true" />

      <div className="cform-body">
        <p className="cform-eyebrow">{t('cform.eyebrow')}</p>
        <h2 className="cform-title" id={`${uid}-title`}>{t('cform.title')}</h2>
        <p className="cform-lead">{t('cform.lead')}</p>

        {account && (
          <p className="cform-account">
            <strong>{t('cform.signedIn', { email: account.email })}</strong>
            <span>{t('cform.signedInHint')}</span>
          </p>
        )}

        <form onSubmit={submit} noValidate>
          {/* Piège à robots : hors flux, hors tabulation, hors lecteurs d'écran */}
          <div className="cform-hp" aria-hidden="true">
            <label htmlFor={`${uid}-company`}>Société</label>
            <input
              id={`${uid}-company`} name="company" type="text" tabIndex={-1}
              autoComplete="off" value={values.company}
              onChange={e => set('company', e.target.value)}
            />
          </div>

          {/* — Sujet — */}
          <div className="cfield">
            <label className="cfield-label" htmlFor={`${uid}-subject`}>
              {t('cform.subject')}
            </label>
            <div className="cfield-select">
              <select
                id={`${uid}-subject`} value={values.subject}
                onChange={e => set('subject', e.target.value)}
              >
                {SUBJECTS.map(s => (
                  <option key={s} value={s}>{t(`cform.subjects.${s}`)}</option>
                ))}
              </select>
              <svg className="cfield-caret" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
                <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* — Nom + téléphone — */}
          <div className="cfield-row">
            <Field
              id={`${uid}-name`} label={t('cform.name')} required
              error={errors.fullName} touched={touched.fullName} t={t}
            >
              <input
                ref={refFor('fullName')}
                id={`${uid}-name`} type="text" name="name" autoComplete="name"
                placeholder={t('cform.namePh')} maxLength={NAME_MAX}
                value={values.fullName}
                aria-invalid={errors.fullName ? 'true' : undefined}
                aria-describedby={errors.fullName ? `${uid}-name-err` : undefined}
                onChange={e => set('fullName', e.target.value)}
                onBlur={() => blur('fullName')}
              />
            </Field>

            <Field
              id={`${uid}-phone`} label={t('cform.phone')}
              error={errors.phone} touched={touched.phone} t={t}
            >
              <input
                ref={refFor('phone')}
                id={`${uid}-phone`} type="tel" name="tel" autoComplete="tel"
                placeholder={t('cform.phonePh')} maxLength={40}
                value={values.phone}
                aria-invalid={errors.phone ? 'true' : undefined}
                aria-describedby={errors.phone ? `${uid}-phone-err` : undefined}
                onChange={e => set('phone', e.target.value)}
                onBlur={() => blur('phone')}
              />
            </Field>
          </div>

          {/* — E-mail : le champ pivot — */}
          <Field
            id={`${uid}-email`} label={t('cform.email')} required
            hint={t('cform.emailHint')}
            error={errors.email} touched={touched.email} t={t}
          >
            <input
              ref={refFor('email')}
              id={`${uid}-email`} type="email" name="email" autoComplete="email"
              inputMode="email" placeholder={t('cform.emailPh')} maxLength={254}
              value={values.email}
              aria-invalid={errors.email ? 'true' : undefined}
              aria-describedby={
                errors.email && touched.email ? `${uid}-email-err` : `${uid}-email-hint`
              }
              onChange={e => set('email', e.target.value)}
              onBlur={() => blur('email')}
            />
          </Field>

          {/* — Message — */}
          <Field
            id={`${uid}-message`} label={t('cform.message')} required
            error={errors.message} touched={touched.message} t={t}
          >
            <textarea
              ref={refFor('message')}
              id={`${uid}-message`} name="message" rows={6}
              placeholder={t('cform.messagePh')} maxLength={MSG_MAX}
              value={values.message}
              aria-invalid={errors.message ? 'true' : undefined}
              aria-describedby={errors.message ? `${uid}-message-err` : undefined}
              onChange={e => set('message', e.target.value)}
              onBlur={() => blur('message')}
            />
            <span className={`cfield-counter ${nearMax ? 'is-near' : ''}`} aria-hidden="true">
              {t('cform.counter', { n: msgLen, max: MSG_MAX })}
            </span>
          </Field>

          {/* — Consentement — */}
          <div className={`cform-consent ${errors.consent && touched.consent ? 'has-error' : ''}`}>
            <input
              ref={refFor('consent')}
              id={`${uid}-consent`} type="checkbox" checked={values.consent}
              aria-invalid={errors.consent ? 'true' : undefined}
              aria-describedby={errors.consent ? `${uid}-consent-err` : undefined}
              onChange={e => {
                setTouched(p => ({ ...p, consent: true }))
                set('consent', e.target.checked)
              }}
            />
            <label htmlFor={`${uid}-consent`}>
              {t('cform.consent')}{' '}
              {/* La phrase dit ce qu'on garde ; le lien dit combien de temps,
                  qui y accède et comment le faire effacer. */}
              <LegalDocLink slug={SLUG_PDD} className="cform-consent-link">
                {t('legal.bannerLearnMore')}
              </LegalDocLink>
            </label>
          </div>
          {errors.consent && touched.consent && (
            <p className="cfield-error" id={`${uid}-consent-err`} role="alert">{errors.consent}</p>
          )}

          {formError && <p className="cform-alert" role="alert">{formError}</p>}

          <button type="submit" className="cform-submit" disabled={sending}>
            {sending ? t('cform.submitting') : t('cform.submit')}
          </button>
        </form>
      </div>
    </section>
  )
}

// ── Champ : libellé, marqueur obligatoire/facultatif, aide, erreur ────────────
function Field({ id, label, required, hint, error, touched, t, children }) {
  const show = error && touched
  return (
    <div className={`cfield ${show ? 'has-error' : ''}`}>
      <label className="cfield-label" htmlFor={id}>
        {label}
        <span className={`cfield-flag ${required ? 'is-required' : ''}`}>
          {required ? t('cform.required') : t('cform.optional')}
        </span>
      </label>
      <div className="cfield-control">{children}</div>
      {hint && !show && <p className="cfield-hint" id={`${id}-hint`}>{hint}</p>}
      {show && <p className="cfield-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  )
}
