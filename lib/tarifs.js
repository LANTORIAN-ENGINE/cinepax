// ─── Grille tarifaire de référence ───────────────────────────────────────────
//
// Aucune API ne publie les montants pour l'instant : Connect répond
// ResponseCode 50 sur /tickets tant que le canal CINEP n'est pas ouvert côté
// billetterie, et price_cards n'est renseignée que si quelqu'un est passé par
// /admin/prix. Ce fichier transcrit donc l'affiche officielle
// (public/content/offres-tarifs.jpg), seule grille publiée par Cinepax, et
// sert de dernier recours derrière ces deux sources.
//
// Ce que l'affiche annonce :
//   3 à 11 ans         15 000 Ar
//   12 à 24 ans        20 000 Ar
//   25 ans et plus     30 000 Ar du lundi au vendredi, 35 000 Ar samedi et dimanche
//   Bon plan mardi     20 000 Ar pour les adultes
//   Offre duo jeudi    40 000 Ar les deux places
//   Séances du matin   20 000 Ar
//
// Les trois dernières lignes sont des plafonds, pas des tarifs uniques : une
// offre ne peut pas coûter plus cher que le tarif ordinaire. On applique donc
// min(tarif de la tranche, plafond) — un enfant paie 15 000 Ar le mardi, pas
// 20 000. Et aucune ligne n'invente de montant : une grille absente d'ici,
// une avant-première par exemple, ressort sans prix plutôt qu'avec un prix
// faux.
//
// Les montants suivent la convention du projet : ariary × 100.

export const CINEMA_ID = '0000000309'

// Le semainier se lit du lundi au dimanche, pas dans l'ordre de getDay().
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// 2024-01-07 était un dimanche : cette date sert de gabarit pour nommer les
// jours dans la langue courante, sans dictionnaire à tenir à jour.
export const weekdayName = (dayIndex, locale) =>
  new Date(Date.UTC(2024, 0, 7 + dayIndex))
    .toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' })

// Les tranches d'âge de l'affiche, dans l'ordre où elle les présente. Elles ne
// servent que tant que Connect se tait : dès qu'il répond, ce sont ses propres
// types de billets qui pilotent la page.
export const BRACKETS = [
  { id: 'enfant', semaineCents: 1500000, weekEndCents: 1500000 },
  { id: 'jeune',  semaineCents: 2000000, weekEndCents: 2000000 },
  { id: 'adulte', semaineCents: 3000000, weekEndCents: 3500000 },
]

// Clés des PriceCardName observés dans /v1/session. `key` désigne le libellé
// affiché (offers.grid.*), `offer` la mention particulière portée par l'affiche.
const REFERENCE = {
  'SEMAINE':        { key: 'semaine', regime: 'semaine' },
  'WEEK_END':       { key: 'weekEnd', regime: 'weekEnd' },
  'MARDI':          { key: 'mardi',   regime: 'semaine', capCents: 2000000, offer: 'mardi' },
  'JEUDI':          { key: 'jeudi',   regime: 'semaine', capCents: 2000000, offer: 'jeudi' },
  'WEEK_END MATIN': { key: 'matin',   regime: 'weekEnd', capCents: 2000000, offer: 'matin' },
}

// Tarifs de référence d'une grille, une ligne par tranche d'âge.
// Renvoie null pour toute grille que l'affiche ne couvre pas.
export function referenceTickets(cardName) {
  const ref = REFERENCE[cardName]
  if (!ref) return null
  const cap = ref.capCents ?? Infinity
  return BRACKETS.map(b => ({
    id: b.id,
    label: null,                                   // libellé traduit côté page
    priceCents: Math.min(b[`${ref.regime}Cents`], cap),
  }))
}

// Libellé lisible d'une grille. « AVP 40 » n'est pas dans l'affiche mais son
// nom dit ce qu'elle est ; les grilles inconnues gardent leur nom Veezi, que
// /admin/prix permet de renommer.
export function referenceKey(cardName) {
  if (REFERENCE[cardName]) return REFERENCE[cardName].key
  if (/^AVP\b/i.test(cardName)) return 'avantPremiere'
  return null
}

export function referenceOffer(cardName) {
  return REFERENCE[cardName]?.offer ?? null
}
