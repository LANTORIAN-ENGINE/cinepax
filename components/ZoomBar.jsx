'use client'

import { useI18n } from '@/lib/i18n'
import { IconClose, IconZoomIn, IconZoomOut } from '@/components/icons'

// ─── La barre des visionneuses ────────────────────────────────────────────────
// Les mêmes quatre commandes, dans le même ordre, sur le même fond noir : moins,
// le niveau, plus, la taille réelle — et la fermeture à l'opposé. L'affiche du
// programme et la fiche d'offre la partagent ; deux barres qui se ressembleraient
// à 90 % finiraient par diverger sur les 10 % restants.

export default function ZoomBar({ scale, atMin, atMax, zoomed, onZoomBy, onReset, onClose, closeRef }) {
  const { t } = useI18n()

  return (
    <div className="pzoom-bar">
      <div className="pzoom-tools">
        <button
          type="button"
          className="pzoom-btn"
          onClick={() => onZoomBy(1 / 1.4)}
          disabled={atMin}
          aria-label={t('programme.zoomOut')}
        >
          <IconZoomOut size={18} />
        </button>
        {/* Pas de région vivante : le niveau change à chaque cran de molette,
            un lecteur d'écran le répéterait sans fin. */}
        <span className="pzoom-level">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="pzoom-btn"
          onClick={() => onZoomBy(1.4)}
          disabled={atMax}
          aria-label={t('programme.zoomIn')}
        >
          <IconZoomIn size={18} />
        </button>
        <button
          type="button"
          className="pzoom-reset"
          onClick={onReset}
          disabled={!zoomed}
        >
          {t('programme.zoomReset')}
        </button>
      </div>

      <button
        ref={closeRef}
        type="button"
        className="pzoom-btn pzoom-close"
        onClick={onClose}
        aria-label={t('programme.zoomClose')}
      >
        <IconClose size={18} />
      </button>
    </div>
  )
}
