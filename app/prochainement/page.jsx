'use client'

import { useState, useEffect } from 'react'
import { useI18n, formatDuration } from '@/lib/i18n'
import { fixImageUrl } from '@/lib/images'
import { TrailerEmbed } from '@/components/BandeAnnonce'
import { bandeAnnonce, indexerBandesAnnonces, INDEX_VIDE } from '@/lib/bandesAnnonces'
import RichText from '@/lib/synopsis'
import { ratingLabel, genreLabel } from '@/lib/classification'

// ─── Prochainement ────────────────────────────────────────────────────────────
// Grille des films à venir, reprise de cinepax.mg/coming-soon. Les données
// viennent de /api/films/coming-soon, qui dérive la liste du catalogue Veezi
// (OpeningDate) — voir app/api/films/coming-soon/route.js.

function formatOpening(iso, locale) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ─── Squelette ────────────────────────────────────────────────────────────────
function ComingSoonSkeleton() {
  return (
    <div className="coming-soon-grid" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="coming-soon-card" style={{ '--sk-delay': `${i * 0.05}s` }}>
          <div className="coming-soon-media sk-shine" />
          <div className="sk-shine coming-soon-sk-line" />
          <div className="sk-shine coming-soon-sk-line coming-soon-sk-line--short" />
        </div>
      ))}
    </div>
  )
}

// ─── Fiche détaillée ──────────────────────────────────────────────────────────
function FilmDialog({ film, trailers, onClose }) {
  const { t, lang, locale } = useI18n()
  const opening = formatOpening(film.openingDate, locale)
  // Fichier déposé par le cinéma si la fiche en porte un, lien du distributeur
  // sinon — la même règle que le carrousel d'accueil et la fiche film.
  const trailer = bandeAnnonce(film, trailers)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const meta = [ratingLabel(film.rating, t), film.duration && formatDuration(film.duration, lang), genreLabel(film.genre, t)]
    .filter(Boolean).join(' · ')

  return (
    <div className="cs-dialog-backdrop" onClick={onClose}>
      <div
        className="cs-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={film.title}
        onClick={e => e.stopPropagation()}
      >
        <button className="cs-dialog-close" onClick={onClose} aria-label={t('comingSoon.close')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {trailer ? (
          <div className="cs-dialog-video">
            <TrailerEmbed
              trailer={trailer}
              title={film.title}
              poster={film.backdrop ? fixImageUrl(film.backdrop) : null}
            />
          </div>
        ) : film.backdrop ? (
          <div className="cs-dialog-video">
            <img src={fixImageUrl(film.backdrop)} alt="" />
          </div>
        ) : null}

        <div className="cs-dialog-body">
          <p className="cs-dialog-eyebrow">
            {opening}
            {film.onSale && <span className="cs-dialog-onsale">{t('comingSoon.onSale')}</span>}
          </p>
          <h2 className="cs-dialog-title">{film.title}</h2>
          {meta && <p className="cs-dialog-meta">{meta}</p>}
          <RichText className="cs-dialog-synopsis" text={film.synopsis} lang={film.synopsisLang} />

          {film.director && (
            <p className="cs-dialog-row">
              <span className="cs-dialog-label">{t('film.directedBy')}</span>
              <span>{film.director}</span>
            </p>
          )}
          {film.cast && (
            <p className="cs-dialog-row">
              <span className="cs-dialog-label">{t('film.cast')}</span>
              <span>{film.cast}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ComingSoonPage() {
  const { t, lang, locale } = useI18n()

  const [films, setFilms]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [opened, setOpened]   = useState(null)
  const [trailers, setTrailers] = useState(INDEX_VIDE)

  // Bandes annonces posées dans l'administration. Indépendantes de la langue :
  // une seule requête, gardée pour toute la visite de la page.
  useEffect(() => {
    let annule = false
    fetch('/api/bandes-annonces')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!annule && data?.trailers) setTrailers(indexerBandesAnnonces(data.trailers))
      })
      .catch(() => {})
    return () => { annule = true }
  }, [])

  // La langue fait partie de la requête : le synopsis est résolu côté serveur
  // (fiche sœur VF/VO, puis traduction en cache). Changer de langue relance
  // donc la récupération.
  useEffect(() => {
    let annule = false
    fetch(`/api/films/coming-soon?lang=${lang}`)
      .then(res => res.json())
      .then(data => {
        if (annule) return
        if (data.error) throw new Error(data.error)
        setFilms(data.films || [])
      })
      .catch(e => { if (!annule) setError(e.message) })
      .finally(() => { if (!annule) setLoading(false) })
    return () => { annule = true }
  }, [lang])

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('comingSoon.title')}</h1>
      </div>
      <hr className="section-divider" />

      {error && <div className="error-banner">⚠ {error}</div>}

      {loading && <ComingSoonSkeleton />}

      {!loading && !error && films.length === 0 && (
        <p className="empty-state">{t('comingSoon.empty')}</p>
      )}

      {!loading && films.length > 0 && (
        <div className="coming-soon-grid">
          {films.map(film => {
            const poster = fixImageUrl(film.poster)
            return (
              <button
                key={film.id}
                type="button"
                className="coming-soon-card"
                onClick={() => setOpened(film)}
              >
                <div className="coming-soon-media">
                  {poster
                    ? <img src={poster} alt="" loading="lazy" />
                    : (
                      <div className="coming-soon-placeholder">
                        <span>{film.title.charAt(0)}</span>
                      </div>
                    )
                  }
                  {film.onSale && (
                    <span className="coming-soon-onsale">
                      <span className="coming-soon-onsale-inner">{t('comingSoon.onSale')}</span>
                    </span>
                  )}
                </div>

                <h2 className="coming-soon-heading">{film.title}</h2>
                <p className="coming-soon-date">{formatOpening(film.openingDate, locale)}</p>
              </button>
            )
          })}
        </div>
      )}

      {opened && (
        <FilmDialog film={opened} trailers={trailers} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}
