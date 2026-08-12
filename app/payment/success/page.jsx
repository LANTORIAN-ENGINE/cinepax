'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useI18n } from '@/lib/i18n'
import { ticketQrPayload, ticketRows } from '@/lib/ticket'
import {
  ATTENTE, RESERVE, lireReponseReservation, placeManquante, texteManque,
} from '@/lib/veeziEtat'
import FinalSaleNotice from '@/components/FinalSaleNotice'

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

  // Enregistrement de la place au cinéma (Veezi) — voir lib/veeziEtat.js.
  // Sans référence dans l'URL, il n'y a rien à enregistrer ni rien à en dire.
  const [veezi, setVeezi] = useState({ etat: ref ? ATTENTE : null })
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
        setVeezi(lireReponseReservation(d))
      })
      .catch(() => setVeezi(lireReponseReservation(null)))
  }, [ref])

  function fmtMGA(cents) {
    if (cents == null) return null
    return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
  }

  // Le paiement est passé, mais la place n'est pas tenue au cinéma : l'écran
  // cesse de dire « c'est fait » et dit ce qu'il reste à faire.
  const manque = placeManquante(veezi.etat)

  // Le billet, dans l'ordre du contrôle — mêmes lignes que sur la confirmation
  // d'achat et dans l'espace client (lib/ticket.js).
  const details = booking
    ? ticketRows({
        filmTitle:       booking.filmTitle,
        sessionTime:     booking.sessionTime,
        screenName:      booking.screenName,
        seats:           booking.seats,
        ticketBreakdown: booking.ticketBreakdown,
        amount:          fmtMGA(booking.totalCents),
      }, t, locale)
    : []

  // Le QR porte la référence — lue par le scanner d'admin — et, autour d'elle,
  // le billet en clair pour un contrôle fait à l'appareil photo.
  const qrValue = ref
    ? ticketQrPayload({
        ref,
        filmTitle:       booking?.filmTitle,
        sessionTime:     booking?.sessionTime,
        screenName:      booking?.screenName,
        seats:           booking?.seats,
        ticketBreakdown: booking?.ticketBreakdown,
      })
    : ''

  // Génère un billet PDF téléchargeable (QR + détails). Import dynamique de
  // jsPDF pour garder la lib hors du bundle initial.
  async function downloadPdf() {
    const canvas = qrRef.current
    if (!canvas || !ref || pdfBusy) return
    setPdfBusy(true)
    try {
      const { jsPDF } = await import('jspdf')
      const qrPng = canvas.toDataURL('image/png')
      const logo = await loadImageData('/logo2.png').catch(() => null)

      // Le talon fait 90 mm de large ; sa hauteur, elle, dépend du billet —
      // un titre de film qui passe à la ligne, un tarif à deux catégories, un
      // n° Veezi présent ou non. On compose donc deux fois : une première
      // passe muette mesure la hauteur réelle, la seconde dessine sur une
      // page taillée à cette mesure. Ni débordement sur une seconde feuille,
      // ni long blanc en pied de page.
      const pageW = 90, mid = pageW / 2

      function compose(doc, draw) {
        const put = fn => { if (draw) fn() }

        // Bandeau titre — fond noir + logo Cinepax, comme le header du site.
        const bannerH = 18
        put(() => {
          doc.setFillColor(0, 0, 0)
          doc.rect(0, 0, pageW, bannerH, 'F')
          if (logo) {
            const logoH = 11
            const logoW = logoH * (logo.w / logo.h)
            doc.addImage(logo.dataUrl, 'PNG', (pageW - logoW) / 2, (bannerH - logoH) / 2, logoW, logoH)
          } else {
            // Repli texte si le logo ne charge pas.
            doc.setTextColor(255, 255, 255)
            doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
            doc.text('CINEPAX', mid, 9.5, { align: 'center' })
            doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
            doc.text('MADAGASCAR', mid, 13, { align: 'center' })
          }
        })

        let y = bannerH + 6
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
        put(() => {
          doc.setTextColor(25, 25, 25)
          doc.text(t('paySuccess.ticketDocTitle'), mid, y, { align: 'center' })
        })
        y += 4

        // QR
        const qrSize = 40
        put(() => doc.addImage(qrPng, 'PNG', (pageW - qrSize) / 2, y, qrSize, qrSize))
        y += qrSize + 6

        // Référence
        put(() => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
          doc.text(t('paySuccess.reference').toUpperCase(), mid, y, { align: 'center' })
        })
        y += 4.5
        put(() => {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(232, 25, 44)
          doc.text(String(ref), mid, y, { align: 'center' })
        })
        y += 7

        // N° billet Veezi
        if (veezi.numero) {
          put(() => {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
            doc.text(t('paySuccess.veeziNum').toUpperCase(), mid, y, { align: 'center' })
          })
          y += 4.5
          put(() => {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(25, 25, 25)
            doc.text(String(veezi.numero), mid, y, { align: 'center' })
          })
          y += 7
        }

        // Place non enregistrée : le papier le porte aussi. Un billet imprimé
        // survit à l'écran qui l'a annoncé, et c'est lui que le client tendra
        // à l'accueil — il ne doit pas ressembler à un billet en règle.
        if (manque) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
          const warnLines = doc.splitTextToSize(t('veezi.pdfNotice'), 66)
          const warnH = 4.2 * warnLines.length + 5.5
          put(() => {
            doc.setDrawColor(193, 18, 31); doc.setFillColor(253, 236, 238)
            doc.roundedRect(8, y, 74, warnH, 1.5, 1.5, 'FD')
            doc.setTextColor(155, 20, 32)
            doc.text(warnLines, mid, y + 5.4, { align: 'center' })
          })
          y += warnH + 6
        }

        // Séparateur + le billet : film, jour, heure, salle, places, tarif,
        // montant. C'est ce que lit le contrôle à l'entrée.
        if (details.length) {
          put(() => { doc.setDrawColor(220, 220, 220); doc.line(8, y, 82, y) })
          y += 6
          doc.setFontSize(8)
          for (const [label, value] of details) {
            doc.setFont('helvetica', 'bold')
            const vlines = doc.splitTextToSize(String(value), 44)
            put(() => {
              doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
              doc.text(String(label), 8, y)
              doc.setFont('helvetica', 'bold'); doc.setTextColor(35, 35, 35)
              doc.text(vlines, 82, y, { align: 'right' })
            })
            y += 4.6 * vlines.length + 1.4
          }
        }

        // Voyant d'achat définitif — encadré, pour qu'il se distingue du reste
        // de la fiche même sur une photocopie en noir et blanc.
        y += 2
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
        const saleLines = doc.splitTextToSize(t('achat.finalSale'), 68)
        const saleH = 4 * saleLines.length + 5
        put(() => {
          doc.setDrawColor(200, 200, 200); doc.setFillColor(248, 248, 248)
          doc.roundedRect(8, y, 74, saleH, 1.5, 1.5, 'FD')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(90, 90, 90)
          doc.text(saleLines, mid, y + 5.2, { align: 'center' })
        })
        y += saleH + 7

        // Pied de page
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
        const footLines = doc.splitTextToSize(t('paySuccess.ticketFooter'), 74)
        put(() => {
          doc.setTextColor(150, 150, 150)
          doc.text(footLines, mid, y, { align: 'center' })
        })
        return y + 3 * footLines.length + 5
      }

      // 1re passe : mesure, sur une page volontairement trop haute.
      const height = compose(
        new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, 400] }),
        false,
      )
      // 2e passe : le vrai billet, à la hauteur mesurée.
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, Math.ceil(height)] })
      compose(doc, true)

      doc.save(`billet-cinepax-${ref}.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="bni-success-page">
      <div className="bni-success-card">
        <div className={`bni-success-icon ${manque ? 'bni-success-icon--manque' : ''}`}>
          {manque ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="40" height="40" aria-hidden>
              <path d="M12 3l9.5 16.5h-19L12 3z" strokeLinejoin="round"/>
              <path d="M12 9.5v4.4M12 17.2h.01" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        <h1 className="bni-success-title">{manque ? t('veezi.deskTitle') : t('paySuccess.title')}</h1>
        <p className="bni-success-sub">
          {manque ? t('veezi.deskSub') : t('paySuccess.sub')}
        </p>

        {ref && (
          <div className="bni-success-ref">
            <span className="bni-success-ref-label">{t('paySuccess.reference')}</span>
            <span className="bni-success-ref-val">{ref}</span>
          </div>
        )}

        {/* Enregistrement de la place au cinéma (Veezi) */}
        {veezi.etat === RESERVE && veezi.numero && (
          <div className="bni-success-ref">
            <span className="bni-success-ref-label">{t('paySuccess.veeziNum')}</span>
            <span className="bni-success-ref-val">{veezi.numero}</span>
          </div>
        )}

        {veezi.etat === ATTENTE && (
          <div className="bni-veezi">
            <span className="bni-veezi-spinner" aria-hidden />
            <span className="bni-veezi-msg">{t('veezi.pending')}</span>
          </div>
        )}

        {/* Ni spinner ni silence : la place manque, et le client doit repartir
            en le sachant, avec sa référence et la marche à suivre. */}
        {manque && (
          <div className="bni-veezi bni-veezi--error" role="alert">
            <svg className="bni-veezi-warn" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" width="17" height="17" aria-hidden>
              <path d="M10 2.5l7.5 13H2.5L10 2.5z" strokeLinejoin="round"/>
              <path d="M10 7.4v3.4M10 13.2h.01" strokeLinecap="round"/>
            </svg>
            <span className="bni-veezi-msg">
              <strong className="bni-veezi-titre">{t('veezi.failTitle')}</strong>
              {texteManque(veezi.etat, veezi.sieges, t)}
              {ref && <em className="bni-veezi-ref">{t('veezi.deskRef', { ref })}</em>}
            </span>
          </div>
        )}

        {/* QR code du billet + téléchargement PDF */}
        {ref && (
          <div className="bni-qr-wrap">
            <span className="bni-qr-title">{t('paySuccess.qrTitle')}</span>
            <div className="bni-qr-frame">
              <QRCodeCanvas
                ref={qrRef}
                value={qrValue}
                size={480}
                level="M"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#0d0d0d"
                /* Affiché plus grand depuis que le code porte tout le billet et
                   non plus la seule référence : ~53 modules au lieu de ~25, il
                   faut garder assez de pixels par module pour se scanner sur
                   un écran de téléphone, à bout de bras, dans un hall. */
                style={{ width: 190, height: 190, display: 'block', borderRadius: 6 }}
              />
            </div>
            <p className="bni-qr-hint">{t('paySuccess.qrHint')}</p>

            {/* Le billet en clair, sous le QR : le contrôle vérifie film,
                jour, heure, salle, places et tarif sans rien scanner. */}
            {details.length > 0 && (
              <dl className="bni-ticket-rows">
                {details.map(([label, value]) => (
                  <div key={label} className="bni-ticket-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

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

        <FinalSaleNotice className="bni-final-sale" />

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
