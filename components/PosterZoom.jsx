'use client'

import { useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { useZoomPan, useDialogChrome } from '@/lib/visionneuse'
import ZoomBar from '@/components/ZoomBar'

// ─── Visionneuse de l'affiche ─────────────────────────────────────────────────
// L'affiche du programme fait 1080×1920 : sur la page elle tient dans la hauteur
// de la fenêtre, ce qui met les horaires autour de 10 px. Ils sont lisibles, mais
// de justesse. Cette visionneuse existe pour ça et rien d'autre — approcher un
// jour de la semaine jusqu'à pouvoir lire l'heure sans plisser les yeux.
//
// Trois gestes, tous ceux qu'on essaie spontanément sur une image :
//   molette / pincement   zoomer autour du point visé, pas du centre du cadre
//   glisser               déplacer, dès que l'image dépasse du cadre
//   double-clic           aller-retour entre l'affiche entière et ×2,5
//
// Ils vivent dans lib/visionneuse.js, avec ceux de la fiche d'offre.

export default function PosterZoom({ src, alt, onClose }) {
  const { t } = useI18n()

  const rootRef  = useRef(null)
  const closeRef = useRef(null)

  const {
    view, dragging, zoomed, atMin, atMax,
    stageRef, imgRef, stageProps, imgStyle, zoomBy, reset, isClick,
  } = useZoomPan()

  useDialogChrome({ rootRef, onClose, focusRef: closeRef })

  // Le vide autour de l'affiche referme, comme partout ailleurs sur le site,
  // sauf quand le clic n'est que la fin d'un glissement.
  function closeOnEmptyClick(e) {
    if (e.target !== e.currentTarget) return
    if (!isClick(e)) return
    onClose()
  }

  return (
    <div
      ref={rootRef}
      className="pzoom"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
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

      <div
        ref={stageRef}
        className={`pzoom-stage ${zoomed ? 'is-zoomed' : ''} ${dragging ? 'is-dragging' : ''}`}
        {...stageProps}
        onClick={closeOnEmptyClick}
      >
        <img
          ref={imgRef}
          className="pzoom-img"
          src={src}
          alt={alt}
          draggable="false"
          style={imgStyle}
        />
      </div>

      <p className="pzoom-hint">{t('programme.zoomHint')}</p>
    </div>
  )
}
