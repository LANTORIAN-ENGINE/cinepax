'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { OFFRES } from '@/lib/contenu'

// ─── Nos offres ───────────────────────────────────────────────────────────────
// Les visuels promotionnels sont recopiés de cinepax.mg : ce sont des créations
// graphiques, sans équivalent dans l'API.
//
// Les tarifs, eux, existent bien côté API — /api/tarifs déduit des séances les
// grilles en vigueur (MARDI, WEEK_END, JEUDI…) et les jours qu'elles couvrent.
// Tant qu'aucun montant n'est disponible, on affiche l'affiche officielle.

export default function NosOffresPage() {
  const { t, moneyLocale } = useI18n()

  const [tarifs, setTarifs]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tarifs')
      .then(r => r.json())
      .then(d => { if (!d.error) setTarifs(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const formatPrice = cents =>
    new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)

  const cards = tarifs?.cards || []

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('offers.title')}</h1>
      </div>
      <hr className="section-divider" />

      {/* ── Tarifs ─────────────────────────────────────────────────────── */}
      <section className="offer-section">
        <h2 className="offer-heading">{t('offers.rates')}</h2>

        {!loading && cards.length > 0 && (
          <>
            <p className="offer-note">{t('offers.ratesLead')}</p>
            <div className="rate-table-wrap">
              <table className="rate-table">
                <thead>
                  <tr>
                    <th>{t('offers.rateName')}</th>
                    <th>{t('offers.rateDays')}</th>
                    <th>{t('offers.rateTimes')}</th>
                    <th className="rate-col-num">{t('offers.rateSessions')}</th>
                    {tarifs.hasAmounts && <th className="rate-col-num">{t('offers.ratePrice')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {cards.map(c => (
                    <tr key={c.name}>
                      <th scope="row" className="rate-name">
                        {c.color && <span className="rate-swatch" style={{ background: c.color }} />}
                        {c.label}
                      </th>
                      <td className="rate-days">{c.weekdays.join(', ')}</td>
                      <td>{c.from && c.to ? `${c.from} – ${c.to}` : '—'}</td>
                      <td className="rate-col-num">{c.sessionCount}</td>
                      {tarifs.hasAmounts && (
                        <td className="rate-col-num">
                          {c.priceCents != null ? formatPrice(c.priceCents) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* L'affiche officielle : seule source des montants tant que le
            back-office ne les expose pas. */}
        <figure className="offer-poster">
          <img src={OFFRES.tarifsPoster} alt={t('offers.posterAlt')} loading="lazy" />
          <figcaption>{t('offers.posterCaption')}</figcaption>
        </figure>
      </section>

      {/* ── Événements et services ─────────────────────────────────────── */}
      <section className="offer-section">
        <h2 className="offer-heading">{t('offers.events')}</h2>

        <div className="offer-grid">
          {OFFRES.cards.map(card => (
            <article key={card.src} className="offer-card">
              <img src={card.src} alt="" loading="lazy" />
              <div className="offer-card-body">
                <h3 className="offer-card-title">{card.title}</h3>
                <p className="offer-card-text">{card.text}</p>
                {card.contact && (
                  <a className="offer-card-contact" href={`mailto:${card.contact}`}>{card.contact}</a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
