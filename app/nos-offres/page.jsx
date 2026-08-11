'use client'

import { useState, useEffect, useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import { OFFRES } from '@/lib/contenu'
import { weekdayName } from '@/lib/tarifs'
import { TarifWeekSkeleton } from '@/components/skeletons'
import OfferView from '@/components/OfferView'
import { IconExpand } from '@/components/icons'

// ─── Nos offres ───────────────────────────────────────────────────────────────
// Les visuels promotionnels sont recopiés de cinepax.mg : ce sont des créations
// graphiques, sans équivalent dans l'API.
//
// Les tarifs, eux, se lisent en semainier. L'affiche officielle range les prix
// par tranche d'âge et laisse le lecteur deviner quel jour tombe dans quelle
// grille ; /api/tarifs sait exactement l'inverse, puisque chaque séance Veezi
// porte sa grille. On présente donc la semaine telle qu'elle est programmée —
// un jour, son prix, ses séances — et la tranche d'âge devient le seul réglage.
// C'est la question qu'on se pose vraiment devant une grille tarifaire :
// combien je paie si j'y vais jeudi.

const AGE_KEYS = ['enfant', 'jeune', 'adulte', 'tarif']

export default function NosOffresPage() {
  const { t } = useI18n()

  const [tarifs, setTarifs]   = useState(null)
  const [loading, setLoading] = useState(true)
  // L'offre dont la fiche est ouverte, ou null. La vignette est un recadrage
  // de l'affiche : ce qu'elle coupe se lit ici.
  const [opened, setOpened]   = useState(null)

  useEffect(() => {
    fetch('/api/tarifs')
      .then(r => r.json())
      .then(d => { if (!d.error) setTarifs(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('offers.title')}</h1>
      </div>
      <hr className="section-divider" />

      <Tarifs data={tarifs} loading={loading} />

      {/* ── Événements et services ─────────────────────────────────────── */}
      <section className="offer-section">
        <h2 className="offer-heading">{t('offers.events')}</h2>

        <div className="offer-grid">
          {OFFRES.cards.map(card => (
            <article key={card.src} className="offer-card">
              {/* La vignette est le bouton, et rien d'autre : l'adresse en
                  dessous reste un lien, ce qu'elle ne pourrait pas être à
                  l'intérieur d'un bouton. */}
              <button
                type="button"
                className="offer-card-media"
                onClick={() => setOpened(card)}
                aria-label={t('offers.cardOpen', { title: card.title })}
              >
                <img src={card.src} alt="" loading="lazy" />
                <span className="offer-card-zoom" aria-hidden="true">
                  <IconExpand size={15} />
                  {t('offers.enlarge')}
                </span>
              </button>

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

      {opened && <OfferView offer={opened} onClose={() => setOpened(null)} />}
    </div>
  )
}

/* ── Le semainier ──────────────────────────────────────────────────────────── */
function Tarifs({ data, loading }) {
  const { t, locale, moneyLocale } = useI18n()
  const [picked, setPicked] = useState(null)

  const money = cents => cents == null ? null
    : new Intl.NumberFormat(moneyLocale, {
        style: 'currency', currency: 'MGA', maximumFractionDigits: 0,
      }).format(cents / 100)

  // Le grand nombre du semainier se compose à la main : « 30 000 » en chiffres
  // de titrage, « Ar » en petit à côté. C'est le lockup de l'affiche officielle.
  const amount = cents => new Intl.NumberFormat(moneyLocale, { maximumFractionDigits: 0 })
    .format(cents / 100)

  const brackets = useMemo(() => data?.brackets || [], [data])

  const priceIn = useMemo(() => {
    const byName = Object.fromEntries((data?.cards || []).map(c => [c.name, c]))
    return (cardName, bracketId) =>
      byName[cardName]?.tickets?.find(x => x.id === bracketId)?.priceCents ?? null
  }, [data])

  // Tranche affichée par défaut : la plus chère. Une grille tarifaire ne doit
  // jamais s'ouvrir sur un prix inférieur à celui que paiera la plupart des gens.
  const fallbackBracket = useMemo(() => {
    let best = null, bestMax = -1
    for (const b of brackets) {
      for (const card of data?.cards || []) {
        const p = priceIn(card.name, b.id)
        if (p != null && p > bestMax) { bestMax = p; best = b.id }
      }
    }
    return best ?? brackets[0]?.id ?? null
  }, [brackets, data, priceIn])

  const active = brackets.some(b => b.id === picked) ? picked : fallbackBracket

  const cardsByName = useMemo(
    () => Object.fromEntries((data?.cards || []).map(c => [c.name, c])),
    [data],
  )

  // La semaine, prix compris. Le créneau le plus fourni donne le prix du jour ;
  // les autres (séance du matin, avant-première) restent des mentions à part.
  const week = useMemo(() => (data?.week || []).map(day => {
    const [main, ...extra] = day.slots
    return {
      ...day,
      main,
      extra,
      offer: main ? cardsByName[main.card]?.offer ?? null : null,
      price: main ? priceIn(main.card, active) : null,
    }
  }), [data, active, priceIn, cardsByName])

  // Le tarif ordinaire de la tranche, c'est le plus élevé de la semaine.
  const standard = week.reduce((max, d) => d.price != null && d.price > max ? d.price : max, 0)

  const bracketLabel = b =>
    b.label || (AGE_KEYS.includes(b.id) ? t(`offers.age.${b.id}`) : b.id)

  const gridLabel = card =>
    card?.label || (card?.labelKey ? t(`offers.grid.${card.labelKey}`) : card?.name)

  // Mentions particulières de l'affiche. Le montant vient de la grille elle-même
  // plutôt que du texte, pour qu'aucun prix ne soit écrit à deux endroits.
  const offerLines = (data?.cards || []).flatMap(card => {
    const top = Math.max(-1, ...(card.tickets || []).map(x => x.priceCents))
    if (card.offer && top > 0) {
      const key = { mardi: 'offerMardi', jeudi: 'offerJeudi', matin: 'offerMatin' }[card.offer]
      const price = money(card.offer === 'jeudi' ? top * 2 : top)
      if (key) return [{ id: card.name, text: t(`offers.${key}`, { price }) }]
    }
    if (card.labelKey === 'avantPremiere' && !card.tickets) {
      return [{ id: card.name, text: t('offers.offerAvp') }]
    }
    return []
  })

  return (
    <section className="offer-section">
      <div className="tarif-head">
        <div className="tarif-head-text">
          <h2 className="offer-heading">{t('offers.rates')}</h2>
          <p className="tarif-lead">{t('offers.ratesLead')}</p>
        </div>

        {brackets.length > 1 && (
          <fieldset className="tarif-ages">
            <legend className="tarif-sr">{t('offers.ageLegend')}</legend>
            {brackets.map(b => (
              <label key={b.id} className={`tarif-age ${active === b.id ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="tarif-age"
                  value={b.id}
                  checked={active === b.id}
                  onChange={() => setPicked(b.id)}
                />
                <span>{bracketLabel(b)}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {loading ? (
        <TarifWeekSkeleton />
      ) : !week.length ? (
        <p className="tarif-lead">{t('offers.ratesUnavailable')}</p>
      ) : (
        <ol className="tarif-week">
          {week.map((day, i) => {
            const isToday = day.dayIndex === data.todayIndex
            // Un bon plan, c'est une grille promotionnelle qui coûte
            // effectivement moins cher que le tarif ordinaire. Un mercredi au
            // prix de la semaine n'en est pas un ; et pour une tranche à prix
            // constant, l'enfant par exemple, même le mardi n'en est pas un.
            const isDeal = day.offer != null && day.price != null && day.price < standard

            return (
              <li
                key={day.dayIndex}
                className={`tarif-day${isToday ? ' is-today' : ''}${day.main ? '' : ' is-empty'}`}
                style={{ '--i': i }}
              >
                <div className="tarif-day-head">
                  <span className="tarif-day-name">{weekdayName(day.dayIndex, locale)}</span>
                  {isToday && <span className="tarif-day-mark">{t('offers.today')}</span>}
                </div>

                {/* Rangée réservée sur toutes les colonnes : sans elle, le seul
                    jour porteur d'une étiquette décalerait son prix vers le bas. */}
                <div className="tarif-day-flags">
                  {isDeal && <span className="tarif-tag">{t('offers.deal')}</span>}
                </div>

                <p className="tarif-price" key={active}>
                  {day.price != null ? (
                    <><b>{amount(day.price)}</b><i>Ar</i></>
                  ) : (
                    <em>{day.main ? t('offers.inPerson') : t('offers.noSession')}</em>
                  )}
                </p>

                {day.main && (
                  <p className="tarif-meta">
                    {t('offers.sessionCount', { n: day.main.sessionCount })}
                    <span className="tarif-hours">{day.main.from} – {day.main.to}</span>
                  </p>
                )}

                {day.extra.map(slot => {
                  const price = priceIn(slot.card, active)
                  return (
                    <p key={slot.card} className="tarif-extra">
                      <span className="tarif-extra-name">{gridLabel(cardsByName[slot.card])}</span>
                      <span className="tarif-extra-detail">
                        {slot.from}
                        {price != null ? ` · ${money(price)}` : ''}
                      </span>
                    </p>
                  )
                })}
              </li>
            )
          })}
        </ol>
      )}

      {offerLines.length > 0 && (
        <ul className="tarif-offers">
          {offerLines.map(line => <li key={line.id}>{line.text}</li>)}
        </ul>
      )}

      {/* L'affiche officielle reste l'autorité sur les montants : elle est à
          portée d'un clic, sans occuper la place de la grille vivante. */}
      <details className="tarif-source">
        <summary>
          {data?.source ? t(`offers.source${data.source[0].toUpperCase()}${data.source.slice(1)}`) : ''}
          <span className="tarif-source-cta">{t('offers.posterToggle')}</span>
        </summary>
        <figure className="offer-poster">
          <img src={OFFRES.tarifsPoster} alt={t('offers.posterAlt')} loading="lazy" />
          <figcaption>{t('offers.posterCaption')}</figcaption>
        </figure>
      </details>
    </section>
  )
}
