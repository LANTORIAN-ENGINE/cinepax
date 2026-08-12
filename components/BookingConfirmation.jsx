'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useI18n } from '@/lib/i18n'
import { ticketQrPayload, ticketRows } from '@/lib/ticket'
import {
  ATTENTE, RESERVE, lireReponseReservation, placeManquante, texteManque,
} from '@/lib/veeziEtat'
import FinalSaleNotice from './FinalSaleNotice'
import EtapesAchat from './EtapesAchat'
import { PLACE } from '@/lib/etapesAchat'
import Aide from './Aide'

export default function BookingConfirmation({
  booking,
  filmTitle,
  sessionLabel,
  sessionISOTime,
  screenName,
  seats,
  ticketBreakdown,
  totalCents,
  onReset,
}) {
  const { t, locale, moneyLocale } = useI18n()
  const [visible, setVisible] = useState(false)
  // Enregistrement de la place au cinéma (Veezi) — voir lib/veeziEtat.js.
  const [veezi, setVeezi] = useState({ etat: ATTENTE })
  const veeziStarted = useRef(false)
  // Le QR porte la référence — c'est elle que le scanner d'admin lit pour
  // retrouver et valider la place — et, autour d'elle, tout ce que le contrôle
  // a besoin de vérifier à l'œil : film, jour, heure, salle, places, tarif.
  // Voir lib/ticket.js.
  const seatKeys = (seats || []).map(s => s.displayKey).filter(Boolean)
  const qrData = booking?.booking_ref
    ? ticketQrPayload({
        ref:             booking.booking_ref,
        filmTitle,
        sessionTime:     sessionISOTime,
        screenName,
        seats:           seatKeys,
        ticketBreakdown,
      })
    : 'CINEPAX'

  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  // Finalise la réservation côté cinéma (Veezi) et affiche le n° de billet
  // dès qu'il est renvoyé. Idempotent côté serveur ; ne s'exécute qu'une fois.
  // Tout ce qui n'aboutit pas est un échec affiché comme tel : personne ne
  // reprend cet appel derrière, un « en cours » ne finirait jamais.
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
      .then(d => setVeezi(lireReponseReservation(d)))
      .catch(() => setVeezi(lireReponseReservation(null)))
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

  // Le billet se lit dans l'ordre du contrôle : film, jour, heure, salle,
  // places, tarif, montant. Même ordre et mêmes libellés que sur le PDF et
  // dans l'espace client. `sessionLabel` sert de repli tant qu'une étape ne
  // transmet pas l'heure ISO de la séance.
  const details = [
    ...ticketRows({
      filmTitle,
      sessionTime: sessionISOTime,
      screenName,
      seats:       seatKeys,
      ticketBreakdown,
      amount:      totalCents ? formatMGA(totalCents) : null,
      // Le détail par type de billet est affiché juste dessous, avec ses
      // montants : la ligne « Tarif » ne servirait qu'à le répéter.
    }, t, locale, { withTariff: !ticketBreakdown?.length })
      .map(([label, value]) => ({ label, value })),
    ...(!sessionISOTime && sessionLabel
      ? [{ label: t('confirmation.session'), value: sessionLabel }]
      : []),
    ...(booking?.payment_method ? [{ label: t('confirmation.payment'), value: paymentLabels[booking.payment_method] || booking.payment_method }] : []),
  ]

  // Une place qui n'est pas tenue au cinéma change la tête de l'écran : le
  // paiement est bien encaissé, mais l'achat n'est pas conclu tant que
  // l'accueil n'a pas attribué la place. Le sceau vert le dirait à tort.
  const manque = placeManquante(veezi.etat)

  return (
    <div className={`conf-page ${visible ? 'conf-visible' : ''}`}>
      <div className={`conf-card ${manque ? 'conf-card--manque' : ''}`}>

        {/* Success icon */}
        <div className="conf-icon-wrap">
          {manque ? (
            <svg className="conf-alert-svg" viewBox="0 0 60 60" fill="none" aria-hidden>
              <circle cx="30" cy="30" r="28" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
              <path d="M30 17.5V33" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
              <path d="M30 40.5v.6" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="conf-check-svg" viewBox="0 0 60 60" fill="none">
              <circle className="conf-check-ring" cx="30" cy="30" r="28"
                stroke="#15803d" strokeWidth="2.5" />
              <path className="conf-check-path"
                d="M18 30L26 38L42 22"
                stroke="#15803d" strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <h1 className="conf-title">{manque ? t('veezi.deskTitle') : t('confirmation.title')}</h1>
        <p className="conf-subtitle">{manque ? t('veezi.deskSub') : t('confirmation.subtitle')}</p>

        {/* Booking ref */}
        <div className="conf-ref-chip">
          <span className="conf-ref-label">{t('confirmation.reference')}</span>
          <code className="conf-ref-code">{booking?.booking_ref || '—'}</code>
        </div>

        {/* Le talon donne la vue d'ensemble — où l'on en est des trois temps ;
            la pastille qui suit donne le détail de celui qui reste, avec son
            numéro de billet. Le repère, puis la pièce. */}
        {/* Sans référence, l'enregistrement n'est jamais parti et l'étape
            resterait « en cours » sans fin : il n'y a rien à suivre. */}
        {booking?.booking_ref && (
          <EtapesAchat courante={PLACE} veeziEtat={veezi.etat} className="conf-etapes" />
        )}

        {/* Enregistrement de la place au cinéma (Veezi) */}
        {veezi.etat === ATTENTE && (
          <div className="conf-veezi">
            <span className="conf-veezi-spinner" aria-hidden />
            <span className="conf-veezi-text">{t('veezi.pending')}</span>
          </div>
        )}

        {veezi.etat === RESERVE && (
          <div className="conf-veezi conf-veezi--reserved">
            <svg className="conf-veezi-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" width="14" height="14">
              <path d="M4 10.5L8.5 15L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="conf-veezi-text">{t('veezi.reserved')}</span>
            {veezi.numero && (
              <code className="conf-veezi-num">{t('veezi.num', { n: veezi.numero })}</code>
            )}
          </div>
        )}

        {/* L'échec se dit en toutes lettres, avec la marche à suivre : le
            client a payé, il doit savoir en repartant qu'il lui reste un
            passage à l'accueil — et l'accueil, quoi lui répondre. */}
        {manque && (
          <div className="conf-manque" role="alert">
            <svg className="conf-manque-icone" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.9" width="17" height="17" aria-hidden>
              <path d="M10 2.5l7.5 13H2.5L10 2.5z" strokeLinejoin="round" />
              <path d="M10 7.4v3.4M10 13.2h.01" strokeLinecap="round" />
            </svg>
            <div className="conf-manque-corps">
              <strong className="conf-manque-titre">{t('veezi.failTitle')}</strong>
              <p className="conf-manque-texte">{texteManque(veezi.etat, veezi.sieges, t)}</p>
              <p className="conf-manque-ref">
                {t('veezi.deskRef', { ref: booking?.booking_ref || '—' })}
              </p>
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="conf-qr-wrap">
          <div className="conf-qr-frame">
            {/* Encre sombre sur blanc : c'est ce que les lecteurs de code
                attendent, et c'est ce qui sort d'une imprimante. */}
            {/* Agrandi depuis que le code porte tout le billet : plus de
                modules à lire, donc plus de pixels par module. */}
            <QRCodeSVG
              value={qrData}
              size={190}
              bgColor="#ffffff"
              fgColor="#14161a"
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="conf-qr-hint aide-titre-ligne">
            {t('confirmation.qrHint')}
            <Aide titre={t('aide.qrTitre')} ancre="apres">
              <p>{t('aide.qrTexte')}</p>
            </Aide>
          </p>
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

            {/* Le détail par type de billet, tel qu'il a été composé au plan de
                salle puis confirmé au paiement : le client retrouve sur son
                billet exactement ce qu'il a choisi, et le contrôle voit à quel
                tarif chaque place a été payée. */}
            {ticketBreakdown?.length > 0 && (
              <div className="conf-ticket-lines">
                <span className="conf-ticket-lines-label">{t('ticket.tariff')}</span>
                {ticketBreakdown.map(line => (
                  <div key={line.code} className="conf-ticket-line">
                    <span className="conf-ticket-line-qty">{line.qty}×</span>
                    <span className="conf-ticket-line-name">{line.description}</span>
                    <span className="conf-ticket-line-amount">
                      {formatMGA(line.qty * line.priceInCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Le voyant reste sur le billet imprimé : c'est là qu'on le relit. */}
        <FinalSaleNotice className="conf-final-sale" />

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
