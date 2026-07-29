// Grilles tarifaires en vigueur, reconstituées depuis Veezi.
//
// L'affiche des tarifs de cinepax.mg est une image déposée dans leur CMS, que
// rien ne nous permet de récupérer. Mais sa structure existe bel et bien dans
// l'API : chaque séance porte un PriceCardName (MARDI, WEEK_END, JEUDI…) qui
// désigne la grille appliquée. On en déduit donc, en direct, quelles grilles
// sont actives et quels jours elles couvrent.
//
// Les montants, eux, viennent de deux sources dans cet ordre :
//   1. Connect /RESTData.svc/…/tickets — la grille du back-office. Indisponible
//      tant que le canal de vente CINEP n'est pas coché (ResponseCode 50).
//   2. La table price_cards de Supabase, alimentable depuis /admin/prix.
// Sans l'une ni l'autre, on renvoie la grille sans montant : la page bascule
// alors sur l'affiche officielle.

import { createServiceClient } from '@/lib/supabase'

const VEEZI = 'https://api.eu.veezi.com'
const TZ = 'Etc/GMT-3'
const DAYS_AHEAD = 14

export const revalidate = 600

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function sessionStart(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

export async function GET() {
  if (!process.env.VEEZI_TOKEN) {
    return Response.json({ error: 'VEEZI_TOKEN env var is not set' }, { status: 500 })
  }

  try {
    const res = await fetch(`${VEEZI}/v1/session`, {
      headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
      next: { revalidate },
    })
    if (!res.ok) throw new Error(`Veezi /v1/session → ${res.status}`)
    const sessionsRaw = await res.json()
    const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [sessionsRaw]

    const now   = new Date()
    const limit = new Date(now.getTime() + DAYS_AHEAD * 24 * 3600 * 1000)

    // Pour chaque grille : jours de la semaine couverts, plage horaire, volume.
    const cards = new Map()
    for (const s of sessions) {
      const name  = s.PriceCardName
      const start = sessionStart(s)
      if (!name || !start) continue
      const d = new Date(start)
      if (d <= now || d > limit) continue

      if (!cards.has(name)) {
        cards.set(name, { name, sessionCount: 0, weekdays: new Set(), earliest: null, latest: null })
      }
      const card = cards.get(name)
      card.sessionCount++

      // Jour et heure exprimés à l'heure de Madagascar, pas celle du serveur.
      const local = new Date(d.toLocaleString('en-US', { timeZone: TZ }))
      card.weekdays.add(local.getDay())
      const minutes = local.getHours() * 60 + local.getMinutes()
      if (card.earliest == null || minutes < card.earliest) card.earliest = minutes
      if (card.latest   == null || minutes > card.latest)   card.latest   = minutes
    }

    // Montants enregistrés (Supabase). Absents → la page montre l'affiche.
    const amounts = new Map()
    const supabase = createServiceClient()
    if (supabase) {
      const { data } = await supabase
        .from('price_cards')
        .select('veezi_name, display_name, price_cents, color')
      for (const row of data || []) amounts.set(row.veezi_name, row)
    }

    const hhmm = m => m == null ? null
      : `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`

    const result = [...cards.values()]
      .map(c => {
        const stored = amounts.get(c.name)
        return {
          name: c.name,
          label: stored?.display_name || c.name,
          priceCents: stored?.price_cents ?? null,
          color: stored?.color || null,
          sessionCount: c.sessionCount,
          weekdays: [...c.weekdays].sort().map(i => WEEKDAYS[i]),
          from: hhmm(c.earliest),
          to: hhmm(c.latest),
        }
      })
      .sort((a, b) => b.sessionCount - a.sessionCount)

    return Response.json({
      cards: result,
      // Vrai dès qu'au moins un montant est connu : la page peut afficher un
      // tableau plutôt que l'affiche.
      hasAmounts: result.some(c => c.priceCents != null),
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
