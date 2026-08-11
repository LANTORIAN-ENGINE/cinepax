'use client'

import { useId, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { useZoomPan, useDialogChrome } from '@/lib/visionneuse'
import ZoomBar from '@/components/ZoomBar'
import { IconMail } from '@/components/icons'

// ─── Fiche d'une offre ────────────────────────────────────────────────────────
// Les visuels de « Nos offres » sont des affiches : elles portent leur propre
// texte — les montants du bon cadeau, le numéro à appeler pour un anniversaire,
// l'adresse à écrire pour privatiser une salle. Dans la grille, la vignette les
// recadre en 16/9 à 380 px de large et cette petite typographie tombe sous le
// seuil de lecture. La grille montre donc l'offre ; elle ne la donne pas à lire.
//
// D'où cette fiche : l'affiche entière, en grand, avec les mêmes gestes que la
// visionneuse du programme, et à côté d'elle le texte du site — celui qu'on peut
// copier, et dont l'adresse est cliquable, ce que l'image ne saura jamais faire.
//
// La barre et le fond noir sont ceux de la visionneuse du programme : c'est le
// même geste sur le même site, il n'a pas à avoir deux apparences.

export default function OfferView({ offer, onClose }) {
  const { t } = useI18n()

  const rootRef  = useRef(null)
  const closeRef = useRef(null)
  const titleId  = useId()

  const {
    view, dragging, zoomed, atMin, atMax,
    stageRef, imgRef, stageProps, imgStyle, zoomBy, reset, isClick,
  } = useZoomPan()

  useDialogChrome({ rootRef, onClose, focusRef: closeRef })

  // Le vide autour de l'affiche referme, sauf quand le clic n'est que la fin
  // d'un glissement.
  function closeOnEmptyClick(e) {
    if (e.target !== e.currentTarget) return
    if (!isClick(e)) return
    onClose()
  }

  return (
    <div
      ref={rootRef}
      className="offer-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={closeOnEmptyClick}
    >
      <ZoomBar
        scale={view.scale}
        atMin={atMin}
        atMax={atMax}
        zoomed={zoomed}
        onZoomBy={zoomBy}
        onReset={reset}
        onClose={onClose}
        closeRef={closeRef}
      />

      <div className="offer-view-body">
        <div
          ref={stageRef}
          className={`offer-view-stage ${zoomed ? 'is-zoomed' : ''} ${dragging ? 'is-dragging' : ''}`}
          {...stageProps}
          onClick={closeOnEmptyClick}
        >
          <img
            ref={imgRef}
            className="offer-view-img"
            src={offer.src}
            alt={offer.title}
            draggable="false"
            style={imgStyle}
          />
        </div>

        {/* Le texte du site, pas celui de l'affiche : il la double en clair,
            pour un lecteur d'écran comme pour qui veut copier l'adresse. */}
        <aside className="offer-view-rail">
          <h2 id={titleId} className="offer-view-title">{offer.title}</h2>
          <p className="offer-view-text">{offer.text}</p>

          {offer.contact && (
            <p className="offer-view-contact">
              <span className="offer-view-label">{t('offers.contact')}</span>
              <a href={`mailto:${offer.contact}`}>
                <IconMail size={15} />
                {offer.contact}
              </a>
            </p>
          )}

          <p className="offer-view-hint">{t('programme.zoomHint')}</p>
        </aside>
      </div>
    </div>
  )
}
