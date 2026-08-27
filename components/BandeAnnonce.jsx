'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

// ─── Lecture d'une bande annonce ──────────────────────────────────────────────
// Deux sources, une seule apparence. Le fichier déposé par le cinéma se lit
// dans un <video> ; le lien YouTube du distributeur reste une iframe, faute de
// pouvoir servir le flux nous-mêmes.
//
// La forme résolue vient de lib/bandesAnnonces.js — { kind: 'fichier' | … } —
// et c'est la seule chose que ces composants connaissent : ils ne savent pas
// d'où vient la décision, ni s'il a fallu retomber sur Veezi.

export function TrailerEmbed({ trailer, title, poster, autoPlay = false, className = '' }) {
  const { t } = useI18n()
  if (!trailer) return null

  const legende = `${title} — ${t('film.trailer')}`

  if (trailer.kind === 'fichier') {
    return (
      <video
        className={`ba-video ${className}`}
        src={trailer.src}
        poster={poster || undefined}
        title={legende}
        controls
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
      />
    )
  }

  const params = new URLSearchParams({
    rel: '0', modestbranding: '1', playsinline: '1',
    ...(autoPlay ? { autoplay: '1' } : {}),
  })

  return (
    <iframe
      className={`ba-iframe ${className}`}
      src={`https://www.youtube.com/embed/${trailer.videoId}?${params}`}
      title={legende}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}

// ─── Bande annonce en plein cadre ─────────────────────────────────────────────
// Ouverte depuis la fiche film. La touche Échap et le clic hors du cadre
// referment ; le défilement de la page est retenu le temps de la lecture,
// comme pour les autres modales du site (LegalDocModal, PosterZoom).
export function TrailerModal({ trailer, title, poster, onClose }) {
  const { t } = useI18n()
  const closeRef = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  if (!trailer) return null

  return (
    <div className="ba-modal-backdrop" onClick={onClose}>
      <div
        className="ba-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — ${t('film.trailer')}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="ba-modal-head">
          <p className="ba-modal-title">{title}</p>
          <button
            ref={closeRef}
            type="button"
            className="ba-modal-close"
            onClick={onClose}
            aria-label={t('comingSoon.close')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="ba-modal-stage">
          <TrailerEmbed trailer={trailer} title={title} poster={poster} autoPlay />
        </div>
      </div>
    </div>
  )
}
