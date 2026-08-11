'use client'

import { useState, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { APROPOS } from '@/lib/contenu'

// ─── À propos de nous ─────────────────────────────────────────────────────────
// Texte et photos recopiés de cinepax.mg (aucune API ne les expose). Le nombre
// de salles et la capacité viennent en revanche de /api/site, donc de Veezi :
// si une salle est ajoutée au back-office, la page suit.
//
// La page tenait sur une colonne de texte avec deux photos posées dessous,
// à la taille d'une vignette. Or ces deux photos sont la seule chose que le
// visiteur vienne vraiment chercher : à quoi ressemble la salle. Elles ont
// donc le mur — une bande sombre pleine largeur, la salle obscure elle-même —
// et chacune éclaire son propre fond de sa couleur, l'indigo à gauche, l'ambre
// à droite. Le halo n'est pas un dégradé décoratif : c'est la photo, floutée,
// comme la lumière que l'écran jette sur les murs.
//
// Le reste de la page reste clair, et se lit dans l'ordre : qui nous sommes,
// ce que ça donne, ce qu'il y a. Les chiffres et les salles ferment la page
// parce qu'ils répondent à la dernière question, pas à la première.

// Le défilement pilote une seule variable par plaque : −1 quand elle entre
// par le bas, +1 quand elle sort par le haut. La photo dérive dans son cadre,
// son halo dérive à l'inverse — la profondeur vient de l'écart, pas de
// l'amplitude. Une passe rAF, deux écritures de variable CSS, aucun rendu
// React déclenché.
function useParallaxe() {
  const ref = useRef(null)

  useEffect(() => {
    const racine = ref.current
    if (!racine) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const plaques = Array.from(racine.querySelectorAll('[data-parallaxe]'))
    if (plaques.length === 0) return

    let image = 0

    function mesurer() {
      image = 0
      for (const plaque of plaques) {
        const r = plaque.getBoundingClientRect()
        const course = window.innerHeight + r.height
        const p = course > 0 ? 1 - 2 * ((r.top + r.height) / course) : 0
        plaque.style.setProperty('--par', Math.max(-1, Math.min(1, p)).toFixed(3))
      }
    }

    function auDefilement() {
      if (!image) image = requestAnimationFrame(mesurer)
    }

    mesurer()
    window.addEventListener('scroll', auDefilement, { passive: true })
    window.addEventListener('resize', auDefilement)
    return () => {
      if (image) cancelAnimationFrame(image)
      window.removeEventListener('scroll', auDefilement)
      window.removeEventListener('resize', auDefilement)
    }
  }, [])

  return ref
}

export default function AProposPage() {
  const { t } = useI18n()
  const [site, setSite] = useState(null)
  const galerie = useParallaxe()

  useEffect(() => {
    fetch('/api/site')
      .then(r => r.json())
      .then(d => { if (!d.error) setSite(d) })
      .catch(() => {})   // la page reste lisible sans les chiffres
  }, [])

  // Le premier paragraphe ouvre la page, le dernier la referme (« À bientôt
  // dans nos salles ! »). Découpage de mise en page seulement : le texte
  // reste celui de lib/contenu.js, dans son ordre.
  const [chapeau, ...suite] = APROPOS.paragraphs
  const salutation = suite.length > 1 ? suite[suite.length - 1] : null
  const corps = salutation ? suite.slice(0, -1) : suite

  // La barre de capacité se lit par rapport à la plus grande salle : c'est la
  // seule comparaison qui ait un sens quand on choisit où s'asseoir.
  const capaciteMax = Math.max(1, ...(site?.screens || []).map(s => s.seats || 0))

  return (
    <div className="page-container ed-page">
      <header className="ed-head">
        <p className="ed-eyebrow">{t('about.eyebrow')}</p>
        <h1 className="ed-title">{t('about.title')}</h1>
        <p className="ed-lead">{chapeau}</p>
      </header>
      <hr className="ed-rule" />

      <div className="about-body">
        {corps.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <section className="about-gallery" ref={galerie} aria-label={t('about.gallery')}>
        <div className="about-gallery-inner">
          {APROPOS.photos.map(photo => (
            <figure key={photo.src} className="salle-plate" data-parallaxe="">
              <span
                className="salle-halo"
                style={{ backgroundImage: `url("${photo.src}")` }}
                aria-hidden="true"
              />
              <span className="salle-frame">
                <img src={photo.src} alt={photo.alt} loading="lazy" />
              </span>
            </figure>
          ))}
        </div>
      </section>

      {site && (
        <dl className="about-figures">
          <div className="about-figure">
            <dt>{t('about.screens')}</dt>
            <dd>{site.totalScreens}</dd>
          </div>
          <div className="about-figure">
            <dt>{t('about.seats')}</dt>
            <dd>{site.totalSeats}</dd>
          </div>
          <div className="about-figure">
            <dt>{t('about.sound')}</dt>
            <dd>Dolby 7.1</dd>
          </div>
        </dl>
      )}

      {site?.screens?.length > 0 && (
        <section className="about-rooms">
          <h2 className="ed-subtitle">{t('about.ourScreens')}</h2>
          <ul className="room-list">
            {site.screens.map((s, i) => (
              <li
                key={s.id}
                className="room-row"
                style={{ '--fill': (s.seats || 0) / capaciteMax, '--ri': i }}
              >
                <span className="room-name">{s.name}</span>
                <span className="room-bar" aria-hidden="true"><span /></span>
                <span className="room-seats">
                  {t('about.seatCount', { n: s.seats, count: s.seats })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {salutation && <p className="about-signoff">{salutation}</p>}
    </div>
  )
}
