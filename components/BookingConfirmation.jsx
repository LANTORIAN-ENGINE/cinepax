'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useI18n } from '@/lib/i18n'

export default function BookingConfirmation({
  booking,
  filmTitle,
  sessionLabel,
  screenName,
  seats,
  totalCents,
  onReset,
}) {
  const { t, moneyLocale } = useI18n()
  const [visible, setVisible] = useState(false)
  // Enregistrement de la place au cinéma (Veezi) : pending → reserved | processing | off
  const [veezi, setVeezi] = useState({ state: 'pending', number: null })
  const veeziStarted = useRef(false)
  // Le QR encode la référence : l'admin la scanne pour retrouver et valider la place.
  const qrData = booking?.booking_ref || 'CINEPAX'

  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  // Finalise la réservation côté cinéma (Veezi) et affiche le n° de billet
  // dès qu'il est renvoyé. Idempotent côté serveur ; ne s'exécute qu'une fois.
  useEffect(() => {
    const ref = booking?.booking_ref
    if (!ref || veeziStarted.current) return
    veeziStarted.current = true

    fetch('/api/veezi/reserve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingRef: ref }),
    })
      .then(r => r.json())
      .then(d => {
        if (d?.veeziBookingNumber) setVeezi({ state: 'reserved', number: d.veeziBookingNumber })
        else if (d?.skipped)       setVeezi({ state: 'off', number: null })
        else                       setVeezi({ state: 'processing', number: null })
      })
      .catch(() => setVeezi({ state: 'processing', number: null }))
  }, [booking?.booking_ref])

  function formatMGA(cents) {
    if (!cents) return null
    return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
  }

  const paymentLabels = {
    orange:   'Orange Money',
    mvola:    'MVola',
    card:     t('confirmation.payCard'),
  }

  const details = [
    { label: t('confirmation.film'),    value: filmTitle },
    { label: t('confirmation.session'), value: sessionLabel },
    { label: t('confirmation.screen'),  value: screenName },
    { label: t('confirmation.seats'),   value: seats?.map(s => s.displayKey).join(', ') || '—' },
    ...(totalCents ? [{ label: t('confirmation.amount'), value: formatMGA(totalCents) }] : []),
    ...(booking?.payment_method ? [{ label: t('confirmation.payment'), value: paymentLabels[booking.payment_method] || booking.payment_method }] : []),
  ]

  return (
    <div className={`conf-page ${visible ? 'conf-visible' : ''}`}>
      <div className="conf-card">

        {/* Success icon */}
        <div className="conf-icon-wrap">
          <svg className="conf-check-svg" viewBox="0 0 60 60" fill="none">
            <circle className="conf-check-ring" cx="30" cy="30" r="28"
              stroke="#15803d" strokeWidth="2.5" />
            <path className="conf-check-path"
              d="M18 30L26 38L42 22"
              stroke="#15803d" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="conf-title">{t('confirmation.title')}</h1>
        <p className="conf-subtitle">{t('confirmation.subtitle')}</p>

        {/* Booking ref */}
        <div className="conf-ref-chip">
          <span className="conf-ref-label">{t('confirmation.reference')}</span>
          <code className="conf-ref-code">{booking?.booking_ref || '—'}</code>
        </div>

        {/* Enregistrement de la place au cinéma (Veezi) */}
        {veezi.state !== 'off' && (
          <div className={`conf-veezi conf-veezi--${veezi.state}`}>
            {veezi.state === 'pending' && (
              <>
                <span className="conf-veezi-spinner" aria-hidden />
                <span className="conf-veezi-text">{t('confirmation.veeziPending')}</span>
              </>
            )}
            {veezi.state === 'reserved' && (
              <>
                <svg className="conf-veezi-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" width="14" height="14">
                  <path d="M4 10.5L8.5 15L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="conf-veezi-text">{t('confirmation.veeziReserved')}</span>
                <code className="conf-veezi-num">{t('confirmation.veeziNum', { n: veezi.number })}</code>
              </>
            )}
            {veezi.state === 'processing' && (
              <>
                <span className="conf-veezi-spinner" aria-hidden />
                <span className="conf-veezi-text">{t('confirmation.veeziProcessing')}</span>
              </>
            )}
          </div>
        )}

        {/* QR Code */}
        <div className="conf-qr-wrap">
          <div className="conf-qr-frame">
            {/* Encre sombre sur blanc : c'est ce que les lecteurs de code
                attendent, et c'est ce qui sort d'une imprimante. */}
            <QRCodeSVG
              value={qrData}
              size={160}
              bgColor="#ffffff"
              fgColor="#14161a"
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="conf-qr-hint">{t('confirmation.qrHint')}</p>
        </div>

        {/* Ticket detail strip */}
        <div className="conf-ticket">
          <div className="conf-ticket-perforation" aria-hidden />
          <div className="conf-ticket-body">
            {details.map(({ label, value }) => value ? (
              <div key={label} className="conf-detail-row">
                <span className="conf-detail-label">{label}</span>
                <span className="conf-detail-value">{value}</span>
              </div>
            ) : null)}
          </div>
        </div>

        <p className="conf-note">
          {t('confirmation.note')}
        </p>

        <div className="conf-actions">
          <button className="conf-print-btn" onClick={() => window.print()}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v2h8v-2H6zm9-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
            </svg>
            {t('confirmation.print')}
          </button>
          <button className="conf-new-btn" onClick={onReset}>
            {t('confirmation.newBooking')}
          </button>
        </div>

      </div>
    </div>
  )
}
