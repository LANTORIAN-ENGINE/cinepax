'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import AchatBand from './AchatBand'
import FinalSaleNotice from './FinalSaleNotice'
import LegalCheckoutNotice from './LegalCheckoutNotice'
import Aide, { AideChiffres, AideCarte, AideNote } from './Aide'

function fixImageUrl(url) {
  if (!url) return null
  if (url.startsWith('https://cdn.eu.veezi.com/')) return url
  const fixed = url.replace(/^https?:\/\/\//, 'https://www.cinepax.mg/')
  return `/api/image?url=${encodeURIComponent(fixed)}`
}

export default function PaymentForm({
  film, session, seats,
  ticketUnitPrice,
  ticketBreakdown,
  totalOverrideCents,
  sessionLabel,
  sessionISOTime,
  formatPrice,
  onConfirm,
  onBack,
}) {
  const { t } = useI18n()
  const [user,         setUser]         = useState(null)
  const [loadingUser,  setLoadingUser]  = useState(true)
  const [guestName,    setGuestName]    = useState('')
  const [guestEmail,   setGuestEmail]   = useState('')
  const [guestPhone,   setGuestPhone]   = useState('')
  const [payMethod,    setPayMethod]    = useState('card')
  const [phoneNum,     setPhoneNum]     = useState('')
  const [bniIframeHtml, setBniIframeHtml] = useState(null)
  const [bniLoading,   setBniLoading]   = useState(false)
  const [fallbackCard, setFallbackCard] = useState(null)   // booking en attente de paiement simulé
  const [fallbackReason, setFallbackReason] = useState(null)
  const [cardForm,     setCardForm]     = useState({ number: '', expiry: '', cvc: '', name: '' })
  const [cardProcessing, setCardProcessing] = useState(false)
  const [cardError,    setCardError]    = useState(null)
  const [sessionPrice, setSessionPrice] = useState(ticketUnitPrice)
  const [priceLabel,   setPriceLabel]   = useState(null)
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [formError,    setFormError]    = useState(null)

  useEffect(() => {
    const supabase = createClient()
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user)
        setLoadingUser(false)
      })
    } else {
      setLoadingUser(false)
    }
    if (ticketUnitPrice == null) {
      setLoadingPrice(true)
      const pcParam = session?.PriceCardName
        ? `&priceCardName=${encodeURIComponent(session.PriceCardName)}`
        : ''
      fetch(`/api/prices?sessionId=${session?.Id}${pcParam}`)
        .then(r => r.json())
        .then(({ price, source, label }) => {
          if (price != null) {
            setSessionPrice(price)
            if (label) setPriceLabel(label)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPrice(false))
    }
  }, [session?.Id, ticketUnitPrice])

  // ─── Sous-écrans de paiement dans l'historique ──────────────────────────────
  // La page bancaire (BNI) et le formulaire carte de secours occupent tout
  // l'écran : un retour navigateur doit y ramener au formulaire, pas quitter la
  // réservation. On les inscrit en query (?ecran=bni|carte) — le chemin reste
  // celui de l'étape paiement, que le tunnel gère de son côté.
  const checkoutStage = fallbackCard ? 'carte' : (bniIframeHtml || bniLoading) ? 'bni' : null
  const stageRef = useRef(null)

  useEffect(() => {
    if (checkoutStage === stageRef.current) return
    const opening = checkoutStage && !stageRef.current
    stageRef.current = checkoutStage
    const url = new URL(window.location.href)
    if (checkoutStage) url.searchParams.set('ecran', checkoutStage)
    else if (url.searchParams.has('ecran')) url.searchParams.delete('ecran')
    else return  // fermé par le retour navigateur : l'URL est déjà à jour
    const target = url.pathname + url.search
    // Ouverture → une entrée à dépiler ; changement ou fermeture → on remplace.
    window.history[opening ? 'pushState' : 'replaceState']({}, '', target)
  }, [checkoutStage])

  useEffect(() => {
    function onPopState() {
      if (new URLSearchParams(window.location.search).has('ecran')) return
      stageRef.current = null
      setFallbackCard(null)
      setBniIframeHtml(null)
      setBniLoading(false)
      setCardError(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Fermeture par le bouton : on dépile l'entrée ouverte par le sous-écran,
  // ce qui déclenche onPopState — sinon le premier retour navigateur suivant
  // semblerait ne rien faire.
  function closeCheckout() {
    if (new URLSearchParams(window.location.search).has('ecran')) {
      window.history.back()
      return
    }
    setFallbackCard(null)
    setBniIframeHtml(null)
    setBniLoading(false)
    setCardError(null)
  }

  const effectivePrice = sessionPrice
  // Longueur seule — c'est tout ce que la règle d'aide reçoit du numéro saisi.
  const cardDigits = cardForm.number.replace(/\D/g, '').length
  const hasBreakdown = Array.isArray(ticketBreakdown) && ticketBreakdown.length > 0
  // Total : priorité au détail des billets (grille live), sinon prix unitaire × places
  const totalCents = totalOverrideCents != null
    ? totalOverrideCents
    : (effectivePrice != null ? effectivePrice * seats.length : null)

  function validate() {
    if (!user) {
      if (!guestName.trim()) return t('payment.errName')
      if (!guestEmail.trim() || !guestEmail.includes('@')) return t('payment.errEmail')
    }
    if (payMethod === 'orange' || payMethod === 'mvola') {
      if (!phoneNum.trim()) return t('payment.errPhone')
    }
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError(null)
    setSubmitting(true)

    try {
      const supabase = createClient()
      let authToken = null
      if (supabase) {
        const { data: { session: authSession } } = await supabase.auth.getSession()
        authToken = authSession?.access_token ?? null
      }

      const headers = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          guestName:        user ? null : guestName.trim(),
          guestEmail:       user ? null : guestEmail.trim(),
          guestPhone:       user ? null : (payMethod === 'card' ? guestPhone.trim() : phoneNum.trim()),
          sessionId:        String(session.Id),
          filmId:           String(session.FilmId),
          filmTitle:        film.Title,
          screenId:         session.ScreenId,
          screenName:       session.ScreenName || `Salle ${session.ScreenId}`,
          sessionTime:      sessionISOTime,
          seats,
          totalAmountCents: totalCents ?? 0,
          paymentMethod:    payMethod,
          pricePerSeat:     effectivePrice ?? 0,
          ticketBreakdown:  hasBreakdown ? ticketBreakdown : null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        // La vente s'est refermée entre l'arrivée sur ce formulaire et son
        // envoi — le délai avant séance est passé. Le serveur est seul juge
        // là-dessus ; on traduit son verdict plutôt que d'afficher son code.
        if (errData.error === 'vente_close') {
          throw new Error(t('ventes.closedDuringPayment'))
        }
        throw new Error(errData.error || t('payment.genericError', { status: res.status }))
      }

      const { booking } = await res.json()

      if (payMethod === 'card') {
        // Tenter de charger l'iframe BNI Pay réelle
        setBniLoading(true)
        let bniError = null
        try {
          const redirectUrl = `${window.location.origin}/payment/success?ref=${booking.booking_ref}`
          const bniRes = await fetch('/api/bni-pay/load', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              orderId:    booking.booking_ref,
              amountCents: totalCents ?? 0,
              redirectUrl,
            }),
          })
          const bniData = await bniRes.json().catch(() => ({}))

          if (!bniRes.ok || bniData.error) {
            bniError = bniData.error || t('payment.bniReasonHttp', { status: bniRes.status })
          } else if (bniData.answer?.operation_status !== 'success') {
            bniError = t('payment.bniReasonStatus', { status: bniData.answer?.operation_status ?? t('payment.bniReasonUnexpected') })
          } else {
            setBniLoading(false)
            setBniIframeHtml(bniData.answer.payment_zone_data)
            return
          }
        } catch (e) {
          bniError = t('payment.bniReasonUnreachable', { msg: e.message })
        }

        // ── Fallback : BNI Pay indisponible → formulaire carte de test ──
        setBniLoading(false)
        setFallbackReason(bniError)
        setFallbackCard(booking)
      } else {
        // Orange / MVola : paiement encaissé → on affiche la confirmation
        // immédiatement ; l'enregistrement Veezi (avec loader) s'y fait ensuite.
        onConfirm(booking)
      }
    } catch (e) {
      setFormError(e.message)
      setBniLoading(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Formulaire carte de test (fallback BNI) ──────────────────────────────────
  function setCard(field, value) {
    setCardForm(f => ({ ...f, [field]: value }))
  }

  function formatCardNumber(v) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }

  function formatExpiry(v) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  async function handleFallbackSubmit(e) {
    e.preventDefault()
    setCardError(null)

    const digits = cardForm.number.replace(/\s/g, '')
    if (digits.length < 13) { setCardError(t('payment.errCardNumber')); return }
    if (!/^\d{2}\/\d{2}$/.test(cardForm.expiry)) { setCardError(t('payment.errExpiry')); return }
    if (cardForm.cvc.replace(/\D/g, '').length < 3) { setCardError(t('payment.errCvc')); return }
    if (!cardForm.name.trim()) { setCardError(t('payment.errCardHolder')); return }

    setCardProcessing(true)
    try {
      // Marque la réservation comme payée (transaction simulée) — best effort
      await fetch('/api/bni-pay/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingRef: fallbackCard.booking_ref }),
      }).catch(() => {})

      // Petite latence pour simuler le traitement bancaire
      await new Promise(r => setTimeout(r, 700))
      // Paiement (simulé) encaissé → confirmation ; réservation Veezi ensuite.
      onConfirm({ ...fallbackCard, payment_status: 'paid', _simulated: true })
    } finally {
      setCardProcessing(false)
    }
  }

  const poster   = fixImageUrl(film?.FilmPosterUrl || film?.FilmPosterThumbnailUrl)
  const backdrop = fixImageUrl(film?.BackdropImageUrl || film?.FilmPosterUrl)
  const screenLabel = session?.ScreenName || t('film.screenFallback', { id: session?.ScreenId })

  // ── Fallback : formulaire carte de test (BNI Pay indisponible) ──────────────
  if (fallbackCard) {
    return (
      <div className="bni-checkout-page">
        <div className="bni-checkout-inner">
          <div className="bni-checkout-header">
            <button
              className="bni-checkout-close"
              type="button"
              onClick={closeCheckout}
              aria-label={t('payment.cancel')}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 3L5 8L10 13" strokeLinecap="round"/>
              </svg>
              {t('payment.back')}
            </button>
            <span className="bni-checkout-title">{t('payment.cardTestTitle')}</span>
            <img src="/visa-mastercard.jpg" alt="Visa Mastercard" className="bni-checkout-logo" />
          </div>

          <div className="bni-checkout-summary">
            <span className="bni-checkout-film">{film.Title}</span>
            <span className="bni-checkout-sep">·</span>
            <span className="bni-checkout-seats">
              {t('payment.seatCount', { n: seats.length, count: seats.length })}
            </span>
            {totalCents != null && (
              <>
                <span className="bni-checkout-sep">·</span>
                <span className="bni-checkout-amount">{formatPrice(totalCents)}</span>
              </>
            )}
          </div>

          <FinalSaleNotice when="before" className="bni-final-sale" />

          <div className="card-test-banner">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <strong>{t('payment.bniUnavailable')}</strong> {t('payment.bniSimulated')}
              {fallbackReason && <span className="card-test-reason"> ({fallbackReason})</span>}
            </div>
          </div>

          <form className="card-test-form" onSubmit={handleFallbackSubmit} noValidate>
            <div className="pay-field pay-field--full">
              {/* La question du client tient en un nombre : combien de
                  chiffres. La règle y répond en les montrant, et se remplit
                  pendant qu'il tape — il compte à l'œil, sans nous croire
                  sur parole. Elle ne reçoit que la longueur saisie, jamais
                  le numéro : rien du PAN ne sort du champ. */}
              <span className="aide-libelle">
                <label>{t('payment.cardNumber')}</label>
                <Aide titre={t('aide.panTitre')} ancre="carte">
                  <p>{t('aide.panTexte')}</p>
                  <AideChiffres saisis={cardDigits} total={16} />
                </Aide>
              </span>
              <div className="pay-input-icon-wrap">
                <svg className="pay-input-icon" viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
                <input
                  type="text" inputMode="numeric"
                  className="pay-input-with-icon"
                  placeholder="4242 4242 4242 4242"
                  value={cardForm.number}
                  onChange={e => setCard('number', formatCardNumber(e.target.value))}
                  autoComplete="cc-number"
                />
              </div>
            </div>

            <div className="pay-fields-grid">
              <div className="pay-field pay-field--half">
                <span className="aide-libelle">
                  <label>{t('payment.expiry')}</label>
                  <Aide titre={t('aide.expTitre')} ancre="carte">
                    <p>{t('aide.expTexte')}</p>
                    <AideCarte face="recto" />
                  </Aide>
                </span>
                <input
                  type="text" inputMode="numeric"
                  placeholder="MM/AA"
                  value={cardForm.expiry}
                  onChange={e => setCard('expiry', formatExpiry(e.target.value))}
                  autoComplete="cc-exp"
                />
              </div>
              <div className="pay-field pay-field--half">
                {/* « Où est le cryptogramme ? » est une question d'endroit
                    sur un objet : aucune phrase ne la règle aussi vite
                    qu'un dos de carte dessiné. */}
                <span className="aide-libelle">
                  <label>{t('payment.cvc')}</label>
                  <Aide titre={t('aide.cvcTitre')} ancre="carte" place="gauche">
                    <p>{t('aide.cvcTexte')}</p>
                    <AideCarte face="dos" />
                  </Aide>
                </span>
                <input
                  type="text" inputMode="numeric"
                  placeholder="123"
                  value={cardForm.cvc}
                  onChange={e => setCard('cvc', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  autoComplete="cc-csc"
                />
              </div>
              <div className="pay-field pay-field--full">
                <span className="aide-libelle">
                  <label>{t('payment.cardHolder')}</label>
                  <Aide titre={t('aide.titulaireTitre')} ancre="carte">
                    <p>{t('aide.titulaireTexte')}</p>
                  </Aide>
                </span>
                <input
                  type="text"
                  placeholder="JEAN RAKOTO"
                  value={cardForm.name}
                  onChange={e => setCard('name', e.target.value)}
                  autoComplete="cc-name"
                />
              </div>
            </div>

            {cardError && (
              <div className="pay-error-box">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {cardError}
              </div>
            )}

            <button type="submit" className="pay-submit-btn" disabled={cardProcessing}>
              {cardProcessing
                ? <><span className="pay-spinner" />{t('payment.processing')}</>
                : <>
                    {t('payment.pay')} {totalCents != null && <span className="pay-submit-price">{formatPrice(totalCents)}</span>}
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M3 8H13M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
              }
            </button>
          </form>

          <p className="bni-checkout-note">
            <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V5H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1h-1.5v-.5A3.5 3.5 0 008 1zm2 4v-.5a2 2 0 10-4 0V5h4z" clipRule="evenodd"/>
            </svg>
            {t('payment.testNote')}
          </p>
        </div>
      </div>
    )
  }

  if (bniIframeHtml || bniLoading) {
    return (
      <div className="bni-checkout-page">
        <div className="bni-checkout-inner">
          <div className="bni-checkout-header">
            <button
              className="bni-checkout-close"
              type="button"
              onClick={closeCheckout}
              aria-label={t('payment.cancel')}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 3L5 8L10 13" strokeLinecap="round"/>
              </svg>
              {t('payment.back')}
            </button>
            <span className="bni-checkout-title">{t('payment.bniSecure')}</span>
            <img src="/visa-mastercard.jpg" alt="Visa Mastercard" className="bni-checkout-logo" />
          </div>

          <div className="bni-checkout-summary">
            <span className="bni-checkout-film">{film.Title}</span>
            <span className="bni-checkout-sep">·</span>
            <span className="bni-checkout-seats">
              {t('payment.seatCount', { n: seats.length, count: seats.length })}
            </span>
            {totalCents != null && (
              <>
                <span className="bni-checkout-sep">·</span>
                <span className="bni-checkout-amount">{formatPrice(totalCents)}</span>
              </>
            )}
          </div>

          <FinalSaleNotice when="before" className="bni-final-sale" />

          {/* Le client vient de quitter notre formulaire pour celui de sa
              banque. Personne ne lui a dit combien de chiffres taper ni
              qu'un code allait suivre par SMS : c'est là qu'on abandonne.
              La note reste affichée pendant toute la saisie. */}
          <AideNote titre={t('aide.modeTitre')} ancre="carte" className="bni-checkout-aide">
            {t('aide.modeTexte')}
          </AideNote>

          {bniLoading ? (
            <div className="bni-checkout-loading">
              <div className="bni-checkout-spinner" />
              <p>{t('payment.bniConnecting')}</p>
            </div>
          ) : (
            <div
              className="bni-checkout-frame"
              dangerouslySetInnerHTML={{ __html: bniIframeHtml }}
            />
          )}

          <p className="bni-checkout-note">
            <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V5H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1h-1.5v-.5A3.5 3.5 0 008 1zm2 4v-.5a2 2 0 10-4 0V5h4z" clipRule="evenodd"/>
            </svg>
            {t('payment.bniHandled')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="payment-page">
      <div className="payment-inner">

        {/* ══ LEFT — Résumé commande ══════════════════════════════════════ */}
        <aside className="pay-summary">
          {backdrop && (
            <div className="pay-summary-bg" aria-hidden>
              <img src={backdrop} alt="" />
              <div className="pay-summary-bg-overlay" />
            </div>
          )}

          <div className="pay-summary-content">
            <div className="pay-film-header">
              {poster && <img src={poster} alt={film.Title} className="pay-poster" />}
              <div className="pay-film-text">
                <p className="pay-film-eyebrow">{t('payment.yourBooking')}</p>
                <h2 className="pay-film-title">{film.Title}</h2>
                <p className="pay-film-meta">{screenLabel}&nbsp;·&nbsp;{sessionLabel}</p>
              </div>
            </div>

            <div className="pay-hr" />

            <div className="pay-seats-section">
              <p className="pay-seats-count">
                {t('payment.seatCountSelected', { n: seats.length, count: seats.length })}
              </p>
              <div className="pay-seats-list">
                {seats.map(s => (
                  <div key={s.displayKey} className="pay-seat-row">
                    <span className="pay-seat-badge">{s.displayKey}</span>
                    <span className="pay-seat-name">{t('payment.row', { row: s.rowName })}</span>
                    <span className="pay-seat-price">
                      {hasBreakdown ? '' : loadingPrice ? '…' : effectivePrice != null ? formatPrice(effectivePrice) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {hasBreakdown && (
              <>
                <div className="pay-hr" />
                <div className="pay-ticket-breakdown">
                  {ticketBreakdown.map(t => (
                    <div key={t.code} className="pay-ticket-row">
                      <span className="pay-ticket-qty">{t.qty}×</span>
                      <span className="pay-ticket-name">{t.description}</span>
                      <span className="pay-ticket-line">{formatPrice(t.qty * t.priceInCents)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="pay-hr" />

            <div className="pay-total-row">
              <span className="pay-total-label">{t('payment.total')}</span>
              <span className="pay-total-amount">
                {loadingPrice
                  ? '…'
                  : totalCents != null
                    ? formatPrice(totalCents)
                    : <span className="pay-price-undefined">{t('payment.priceToSet')}</span>
                }
              </span>
            </div>

            {effectivePrice == null && !loadingPrice && (
              <p className="pay-price-hint">
                {t('payment.priceHint')}
              </p>
            )}
          </div>
        </aside>

        {/* ══ RIGHT — Formulaire de paiement ══════════════════════════════ */}
        <div className="pay-form-panel">
          <div className="pay-form-inner">

            <button className="pay-back-btn" type="button" onClick={onBack}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 3L5 8L10 13" strokeLinecap="round"/>
              </svg>
              {t('payment.back')}
            </button>

            <AchatBand size="sm" />

            <h1 className="pay-form-title">{t('payment.formTitle')}</h1>
            <p className="pay-form-subtitle">{t('payment.formSubtitle')}</p>

            <form onSubmit={handleSubmit} noValidate>

              {/* — Coordonnées (visiteur) — */}
              {!loadingUser && !user && (
                <div className="pay-section">
                  <h3 className="pay-section-title">
                    <span className="pay-section-num">01</span>
                    {t('payment.yourDetails')}
                  </h3>
                  <div className="pay-fields-grid">
                    <div className="pay-field pay-field--half">
                      <label>{t('payment.fullName')}</label>
                      <input type="text" value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                        placeholder="Jean Rakoto" autoComplete="name" />
                    </div>
                    <div className="pay-field pay-field--half">
                      <span className="aide-libelle">
                        <label>{t('payment.email')}</label>
                        <Aide titre={t('aide.emailTitre')} ancre="apres">
                          <p>{t('aide.emailTexte')}</p>
                        </Aide>
                      </span>
                      <input type="email" value={guestEmail}
                        onChange={e => setGuestEmail(e.target.value)}
                        placeholder="jean@example.mg" autoComplete="email" required />
                    </div>
                    <div className="pay-field pay-field--full">
                      <label>{t('payment.phoneOptional')}</label>
                      <input type="tel" value={guestPhone}
                        onChange={e => setGuestPhone(e.target.value)}
                        placeholder="+261 32 XX XXX XX" autoComplete="tel" />
                    </div>
                    <p className="pay-field-hint pay-field-hint--email">
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13" aria-hidden>
                        <path d="M2.94 6.34A2 2 0 014.7 5.3h10.6a2 2 0 011.76 1.04L10 11 2.94 6.34z"/>
                        <path d="M18 8.12l-7.44 4.9a1 1 0 01-1.12 0L2 8.12V13.7a2 2 0 002 2h12a2 2 0 002-2V8.12z"/>
                      </svg>
                      {t('payment.emailHint')}
                    </p>
                  </div>
                  <p className="pay-login-hint">
                    {t('payment.alreadyCustomer')}{' '}
                    <a href="/auth/login" className="pay-login-link">{t('payment.logIn')}</a>
                    {' '}{t('payment.toFindBookings')}
                  </p>
                </div>
              )}

              {/* — Utilisateur connecté — */}
              {!loadingUser && user && (
                <div className="pay-section pay-user-section">
                  <div className="pay-user-badge">
                    <div className="pay-user-avatar">
                      {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                    </div>
                    <div className="pay-user-info">
                      <p className="pay-user-name">{user.user_metadata?.full_name || t('payment.customer')}</p>
                      <p className="pay-user-email">{user.email}</p>
                    </div>
                    <a href="/auth/login" className="pay-logout-link">{t('payment.change')}</a>
                  </div>
                </div>
              )}

              {/* — Méthode de paiement — */}
              <div className="pay-section">
                {/* Le point d'abandon du tunnel n'est pas la saisie de la
                    carte, c'est ce qui la suit : la page de la banque et le
                    code par SMS, que personne n'a annoncés. On les annonce
                    ici, avant le clic. */}
                <h3 className="pay-section-title">
                  <span className="pay-section-num">{!loadingUser && !user ? '02' : '01'}</span>
                  <span className="aide-titre-ligne">
                    {t('payment.paymentMethod')}
                    <Aide titre={t('aide.modeTitre')} ancre="paiement">
                      <p>{t('aide.modeTexte')}</p>
                    </Aide>
                  </span>
                </h3>

                <div className="pay-methods-grid">
                  {[
                    { id: 'card',   label: t('payment.cardMethod'), logo: '/visa-mastercard.jpg', color: '#1a56db' },
                    { id: 'orange', label: 'Orange Money',        logo: '/orange.png',          color: '#ff6600', soon: true },
                    { id: 'mvola',  label: 'MVola',               logo: '/mvola.png',           color: '#e30613', soon: true },
                  ].map(m => (
                    <button key={m.id} type="button"
                      className={`pay-method-btn ${payMethod === m.id ? 'active' : ''} ${m.soon ? 'soon' : ''}`}
                      style={{ '--mc': m.color }}
                      disabled={m.soon}
                      aria-disabled={m.soon || undefined}
                      title={m.soon ? t('payment.mobileMoneySoon') : undefined}
                      onClick={() => { if (!m.soon) setPayMethod(m.id) }}
                    >
                      <img src={m.logo} alt={m.label} className="pay-method-logo" />
                      <span className="pay-method-label">{m.label}</span>
                      {m.soon && (
                        <span className="pay-method-soon">{t('payment.soonBadge')}</span>
                      )}
                      {payMethod === m.id && !m.soon && (
                        <span className="pay-method-check" aria-hidden>
                          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" width="10" height="10">
                            <path d="M2 6L5 9L10 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <p className="pay-methods-note">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12" aria-hidden>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  {t('payment.mobileMoneySoon')}
                </p>

                {/* Mobile money form */}
                {(payMethod === 'orange' || payMethod === 'mvola') && (
                  <div className="pay-mobile-form">
                    <div className="pay-field pay-field--full">
                      <span className="aide-libelle">
                        <label>
                          {payMethod === 'orange' ? t('payment.numberOrange') : t('payment.numberMvola')}
                        </label>
                        <Aide titre={t('aide.mobileTitre')} ancre="paiement">
                          <p>{t('aide.mobileTexte')}</p>
                        </Aide>
                      </span>
                      <div className="pay-input-icon-wrap">
                        <svg className="pay-input-icon" viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        <input type="tel" value={phoneNum}
                          onChange={e => setPhoneNum(e.target.value)}
                          placeholder={payMethod === 'orange' ? '+261 32 XX XXX XX' : '+261 34 XX XXX XX'}
                          className="pay-input-with-icon"
                          required
                        />
                      </div>
                      <p className="pay-field-hint">
                        {t('payment.phoneHint')}
                      </p>
                    </div>
                  </div>
                )}

                {/* BNI Pay — info card */}
                {payMethod === 'card' && (
                  <div className="bni-card-info">
                    <div className="bni-card-info-logo">
                      <img src="/visa-mastercard.jpg" alt="Visa / Mastercard" />
                    </div>
                    <div className="bni-card-info-text">
                      <p className="bni-card-info-title">{t('payment.bniSecure')}</p>
                      <p className="bni-card-info-sub">
                        {t('payment.bniInfoSub')}
                      </p>
                      <div className="bni-card-info-badges">
                        <span className="bni-badge">
                          <svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10">
                            <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V5H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1h-1.5v-.5A3.5 3.5 0 008 1zm2 4v-.5a2 2 0 10-4 0V5h4z" clipRule="evenodd"/>
                          </svg>
                          3D Secure
                        </span>
                        <span className="bni-badge">SSL 256-bit</span>
                        <span className="bni-badge">Visa / Mastercard</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* — Erreur — */}
              {formError && (
                <div className="pay-error-box">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {formError}
                </div>
              )}

              {/* — Submit — */}
              {/* Dernier rappel avant l'engagement : le bouton valide un
                  achat, pas une mise en attente. */}
              <FinalSaleNotice when="before" tone="strong" className="pay-final-sale" />

              <button type="submit" className="pay-submit-btn" disabled={submitting || bniLoading}>
                {(submitting || bniLoading)
                  ? <><span className="pay-spinner" />{bniLoading ? t('payment.connectingBni') : t('payment.processingShort')}</>
                  : <>
                      {payMethod === 'card' ? t('payment.payByCard') : t('payment.confirmBooking')}
                      {totalCents != null && (
                        <span className="pay-submit-price">{formatPrice(totalCents)}</span>
                      )}
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M3 8H13M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                }
              </button>

              <p className="pay-secure-note">
                <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V5H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1h-1.5v-.5A3.5 3.5 0 008 1zm2 4v-.5a2 2 0 10-4 0V5h4z" clipRule="evenodd" />
                </svg>
                {t('payment.secureNote')}
              </p>

              {/* Le contrat, à portée de clic sans quitter le paiement. */}
              <LegalCheckoutNotice className="pay-legal-note" />
            </form>
          </div>
        </div>

      </div>
    </div>
  )
}
