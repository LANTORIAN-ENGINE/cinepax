'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useI18n } from '@/lib/i18n'

const TZ = 'Etc/GMT-3' // Fuseau Madagascar

// Charge une image same-origin et la renvoie en PNG data-URL + dimensions,
// pour l'embarquer dans le PDF (jsPDF a besoin des dimensions pour l'échelle).
async function loadImageData(src) {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d').drawImage(img, 0, 0)
  return { dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
}

function SuccessContent() {
  const { t, locale, moneyLocale } = useI18n()
  const params = useSearchParams()
  const ref = params.get('ref')

  // Enregistrement de la place au cinéma (Veezi) : pending → reserved | processing | off | error
  const [veezi, setVeezi] = useState({ state: ref ? 'pending' : 'off', number: null })
  const [booking, setBooking] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const qrRef = useRef(null)      // <canvas> du QR — source de l'image PDF
  const started = useRef(false)

  // Paiement BNI encaissé (retour depuis MIPS) → enregistrer la réservation Veezi.
  useEffect(() => {
    if (!ref || started.current) return
    started.current = true

    fetch('/api/veezi/reserve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingRef: ref }),
    })
      .then(r => r.json())
      .then(d => {
        if (d?.booking) setBooking(d.booking)
        if (d?.veeziBookingNumber) setVeezi({ state: 'reserved', number: String(d.veeziBookingNumber) })
        else if (d?.skipped)       setVeezi({ state: 'off', number: null })
        else if (d?.error || d?.ok === false) setVeezi({ state: 'error', number: null })
        else                       setVeezi({ state: 'processing', number: null })
      })
      .catch(() => setVeezi({ state: 'error', number: null }))
  }, [ref])

  function fmtMGA(cents) {
    if (cents == null) return null
    return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
  }

  function fmtSession(iso) {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: TZ,
    }).format(d)
  }

  const details = booking ? [
    [t('paySuccess.ticketFilm'),    booking.filmTitle],
    [t('paySuccess.ticketSession'), fmtSession(booking.sessionTime)],
    [t('paySuccess.ticketScreen'),  booking.screenName],
    [t('paySuccess.ticketSeats'),   booking.seats?.length ? booking.seats.join(', ') : null],
    [t('paySuccess.ticketAmount'),  fmtMGA(booking.totalCents)],
  ].filter(([, v]) => v) : []

  // Génère un billet PDF téléchargeable (QR + détails). Import dynamique de
  // jsPDF pour garder la lib hors du bundle initial.
  async function downloadPdf() {
    const canvas = qrRef.current
    if (!canvas || !ref || pdfBusy) return
    setPdfBusy(true)
    try {
      const { jsPDF } = await import('jspdf')
      const qrPng = canvas.toDataURL('image/png')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [90, 150] })

      // Bandeau titre — fond noir + logo Cinepax, comme le header du site.
      const bannerH = 18
      doc.setFillColor(0, 0, 0)
      doc.rect(0, 0, 90, bannerH, 'F')
      const logo = await loadImageData('/logo.jpg').catch(() => null)
      if (logo) {
        const logoH = 11
        const logoW = logoH * (logo.w / logo.h)
        doc.addImage(logo.dataUrl, 'PNG', (90 - logoW) / 2, (bannerH - logoH) / 2, logoW, logoH)
      } else {
        // Repli texte si le logo ne charge pas.
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
        doc.text('CINEPAX', 45, 9.5, { align: 'center' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
        doc.text('MADAGASCAR', 45, 13, { align: 'center' })
      }

      let y = bannerH + 6
      doc.setTextColor(25, 25, 25)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text(t('paySuccess.ticketDocTitle'), 45, y, { align: 'center' })
      y += 4

      // QR
      const qrSize = 40
      doc.addImage(qrPng, 'PNG', (90 - qrSize) / 2, y, qrSize, qrSize)
      y += qrSize + 6

      // Référence
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
      doc.text(t('paySuccess.reference').toUpperCase(), 45, y, { align: 'center' }); y += 4.5
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(232, 25, 44)
      doc.text(String(ref), 45, y, { align: 'center' }); y += 7

      // N° billet Veezi
      if (veezi.number) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
        doc.text(t('paySuccess.veeziNum').toUpperCase(), 45, y, { align: 'center' }); y += 4.5
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(25, 25, 25)
        doc.text(String(veezi.number), 45, y, { align: 'center' }); y += 7
      }

      // Séparateur + détails
      if (details.length) {
        doc.setDrawColor(220, 220, 220); doc.line(8, y, 82, y); y += 6
        doc.setFontSize(8)
        for (const [label, value] of details) {
          doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
          doc.text(String(label), 8, y)
          doc.setFont('helvetica', 'bold'); doc.setTextColor(35, 35, 35)
          const vlines = doc.splitTextToSize(String(value), 44)
          doc.text(vlines, 82, y, { align: 'right' })
          y += 4.6 * vlines.length + 1.4
        }
      }

      // Pied de page
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(150, 150, 150)
      doc.text(doc.splitTextToSize(t('paySuccess.ticketFooter'), 74), 45, 144, { align: 'center' })

      doc.save(`billet-cinepax-${ref}.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="bni-success-page">
      <div className="bni-success-card">
        <div className="bni-success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="bni-success-title">{t('paySuccess.title')}</h1>
        <p className="bni-success-sub">
          {t('paySuccess.sub')}
        </p>

        {ref && (
          <div className="bni-success-ref">
            <span className="bni-success-ref-label">{t('paySuccess.reference')}</span>
            <span className="bni-success-ref-val">{ref}</span>
          </div>
        )}

        {/* Enregistrement de la place au cinéma (Veezi) */}
        {veezi.state !== 'off' && (
          veezi.state === 'reserved' ? (
            <div className="bni-success-ref">
              <span className="bni-success-ref-label">{t('paySuccess.veeziNum')}</span>
              <span className="bni-success-ref-val">{veezi.number}</span>
            </div>
          ) : (
            <div className={`bni-veezi bni-veezi--${veezi.state}`}>
              {(veezi.state === 'pending' || veezi.state === 'processing') && (
                <span className="bni-veezi-spinner" aria-hidden />
              )}
              {veezi.state === 'error' && (
                <svg className="bni-veezi-warn" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" width="15" height="15" aria-hidden>
                  <path d="M10 6.5v4.2M10 14h.01" strokeLinecap="round"/>
                  <path d="M10 2.5l7.5 13H2.5L10 2.5z" strokeLinejoin="round"/>
                </svg>
              )}
              <span className="bni-veezi-msg">
                {veezi.state === 'pending'    && t('paySuccess.veeziPending')}
                {veezi.state === 'processing' && t('paySuccess.veeziProcessing')}
                {veezi.state === 'error'      && t('paySuccess.veeziError')}
              </span>
            </div>
          )
        )}

        {/* QR code du billet + téléchargement PDF */}
        {ref && (
          <div className="bni-qr-wrap">
            <span className="bni-qr-title">{t('paySuccess.qrTitle')}</span>
            <div className="bni-qr-frame">
              <QRCodeCanvas
                ref={qrRef}
                value={ref}
                size={480}
                level="M"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#0d0d0d"
                style={{ width: 168, height: 168, display: 'block', borderRadius: 6 }}
              />
            </div>
            <p className="bni-qr-hint">{t('paySuccess.qrHint')}</p>
            <button type="button" className="bni-pdf-btn" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? (
                <>
                  <span className="bni-veezi-spinner" aria-hidden />
                  {t('paySuccess.preparingPdf')}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden>
                    <path d="M10 2a1 1 0 011 1v7.585l2.293-2.292a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 10.585V3a1 1 0 011-1z"/>
                    <path d="M4 15a1 1 0 011 1v1h10v-1a1 1 0 112 0v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2a1 1 0 011-1z"/>
                  </svg>
                  {t('paySuccess.downloadPdf')}
                </>
              )}
            </button>
          </div>
        )}

        <p className="bni-success-hint">
          {t('paySuccess.hint')}
        </p>

        <a href="/" className="bni-success-btn">
          {t('paySuccess.backHome')}
        </a>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="bni-success-page"><div className="bni-success-card" /></div>}>
      <SuccessContent />
    </Suspense>
  )
}
