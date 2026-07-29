'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { APROPOS } from '@/lib/contenu'

// ─── À propos de nous ─────────────────────────────────────────────────────────
// Texte et photos recopiés de cinepax.mg (aucune API ne les expose). Le nombre
// de salles et la capacité viennent en revanche de /api/site, donc de Veezi :
// si une salle est ajoutée au back-office, la page suit.

export default function AProposPage() {
  const { t } = useI18n()
  const [site, setSite] = useState(null)

  useEffect(() => {
    fetch('/api/site')
      .then(r => r.json())
      .then(d => { if (!d.error) setSite(d) })
      .catch(() => {})   // la page reste lisible sans les chiffres
  }, [])

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('about.title')}</h1>
      </div>
      <hr className="section-divider" />

      <div className="prose-page">
        <div className="prose-body">
          {APROPOS.paragraphs.map((p, i) => (
            <p key={i} className={i === 0 ? 'prose-lead' : undefined}>{p}</p>
          ))}
        </div>

        {site && (
          <dl className="site-stats">
            <div className="site-stat">
              <dt>{t('about.screens')}</dt>
              <dd>{site.totalScreens}</dd>
            </div>
            <div className="site-stat">
              <dt>{t('about.seats')}</dt>
              <dd>{site.totalSeats}</dd>
            </div>
            <div className="site-stat">
              <dt>{t('about.sound')}</dt>
              <dd>Dolby 7.1</dd>
            </div>
          </dl>
        )}

        <div className="prose-photos">
          {APROPOS.photos.map(photo => (
            <img key={photo.src} src={photo.src} alt={photo.alt} loading="lazy" />
          ))}
        </div>

        {site?.screens?.length > 0 && (
          <>
            <h2 className="prose-subtitle">{t('about.ourScreens')}</h2>
            <ul className="screen-list">
              {site.screens.map(s => (
                <li key={s.id} className="screen-item">
                  <span className="screen-item-name">{s.name}</span>
                  <span className="screen-item-seats">
                    {t('about.seatCount', { n: s.seats, count: s.seats })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
