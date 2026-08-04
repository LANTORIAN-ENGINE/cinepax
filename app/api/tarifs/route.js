// Grilles tarifaires en vigueur, reconstituées depuis Veezi.
//
// L'affiche des tarifs de cinepax.mg est une image déposée dans leur CMS, que
// rien ne nous permet de récupérer. Mais sa structure existe bel et bien dans
// l'API : chaque séance porte un PriceCardName (MARDI, WEEK_END, JEUDI…) qui
// désigne la grille appliquée. On en déduit donc, en direct, quelles grilles
// sont actives, quels jours elles couvrent et à quelles heures — c'est ce que
// la page « Nos offres » présente en semainier.
//
// Les montants, eux, viennent de trois sources dans cet ordre :
//   1. Connect /RESTData.svc/…/tickets — la grille du back-office, avec ses
//      vrais types de billets. Indisponible tant que le canal de vente CINEP
//      n'est pas ouvert (ResponseCode 50), mais 77 séances sur 137 le portent
//      déjà : le jour où il s'ouvre, la page bascule dessus sans redéploiement.
//   2. La table price_cards de Supabase, alimentable depuis /admin/prix.
//   3. La grille de référence de lib/tarifs.js, transcrite de l'affiche.
// Chaque grille indique par quelle source elle a été servie.

import { createServiceClient } from '@/lib/supabase'
import { CINEMA_ID, WEEK_ORDER, referenceTickets, referenceKey, referenceOffer } from '@/lib/tarifs'

const VEEZI      = 'https://api.eu.veezi.com'
const CONNECT    = 'https://connect.eu.veezi.com'
const TZ         = 'Etc/GMT-3'
const DAYS_AHEAD = 14

export const revalidate = 600

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function sessionStart(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

const hhmm = m => m == null ? null
  : `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`

// Heure de Madagascar, pas celle du serveur.
function localTime(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: TZ }))
}

// Types de billets réels d'une séance. Renvoie null dès que Connect se dérobe —
// l'appelant enchaîne alors sur la source suivante.
async function connectTickets(sessionId) {
  const { CONNECT_TENANT, CONNECT_TOKEN } = process.env
  if (!CONNECT_TENANT || !CONNECT_TOKEN) return null

  try {
    const res = await fetch(
      `${CONNECT}/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${sessionId}/tickets`,
      {
        headers: { 'vista-tenant': CONNECT_TENANT, connectApiToken: CONNECT_TOKEN },
        next: { revalidate },
      },
    )
    if (!res.ok) return null

    const data = await res.json()
    if (data?.ResponseCode !== 0 || !Array.isArray(data.Tickets)) return null

    const tickets = data.Tickets
      .filter(t => t.PriceInCents > 0 && (t.SalesChannels || []).includes('CINEP'))
      .sort((a, b) => (a.DisplaySequence ?? 999) - (b.DisplaySequence ?? 999))
      .map(t => ({ id: t.TicketTypeCode, label: t.Description, priceCents: t.PriceInCents }))

    return tickets.length ? tickets : null
  } catch {
    return null
  }
}

// Montants enregistrés depuis /admin/prix. Isolé dans son propre try : une base
// injoignable ne doit pas emporter le semainier, qui ne dépend que de Veezi.
async function storedAmounts() {
  const out = new Map()
  try {
    const supabase = createServiceClient()
    if (!supabase) return out
    const { data } = await supabase
      .from('price_cards')
      .select('veezi_name, display_name, price_cents')
    for (const row of data || []) out.set(row.veezi_name, row)
  } catch { /* base indisponible — on descend d'un cran */ }
  return out
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

    // Une passe : la grille vue dans son ensemble, et jour par jour.
    const cards = new Map()   // PriceCardName → couverture globale
    const days  = new Map()   // jour de la semaine → PriceCardName → couverture

    for (const s of sessions) {
      const name  = s.PriceCardName
      const start = sessionStart(s)
      if (!name || !start) continue
      const d = new Date(start)
      if (d <= now || d > limit) continue

      const local   = localTime(d)
      const day     = local.getDay()
      const minutes = local.getHours() * 60 + local.getMinutes()

      if (!cards.has(name)) {
        cards.set(name, {
          name, sessionCount: 0, weekdays: new Set(),
          earliest: null, latest: null,
          // Une séance ouverte à CINEP suffit à interroger Connect : les
          // billets d'une grille sont les mêmes pour toutes ses séances.
          cinepSessionId: null,
        })
      }
      const card = cards.get(name)
      card.sessionCount++
      card.weekdays.add(day)
      if (card.earliest == null || minutes < card.earliest) card.earliest = minutes
      if (card.latest   == null || minutes > card.latest)   card.latest   = minutes
      if (!card.cinepSessionId && (s.SalesVia || []).includes('CINEP')) {
        card.cinepSessionId = s.Id
      }

      if (!days.has(day)) days.set(day, new Map())
      const perDay = days.get(day)
      if (!perDay.has(name)) perDay.set(name, { sessionCount: 0, earliest: null, latest: null })
      const slot = perDay.get(name)
      slot.sessionCount++
      if (slot.earliest == null || minutes < slot.earliest) slot.earliest = minutes
      if (slot.latest   == null || minutes > slot.latest)   slot.latest   = minutes
    }

    const list = [...cards.values()]

    const [live, stored] = await Promise.all([
      Promise.all(list.map(c => c.cinepSessionId ? connectTickets(c.cinepSessionId) : null)),
      storedAmounts(),
    ])

    // Une seule source pour toute la grille, jamais un panachage.
    //
    // Les trois sources ne nomment pas les billets de la même façon : Connect
    // renvoie les types du back-office (« Adulte », code 0001), price_cards un
    // montant unique sans tranche, l'affiche des tranches d'âge. Servir une
    // grille par Connect et sa voisine par l'affiche donnerait des colonnes de
    // prix qui ne veulent pas dire la même chose d'un jour à l'autre — et rien
    // ne dit que « 25 ans et plus » sur l'affiche soit le « Adulte » de Veezi.
    //
    // Le cas n'a rien de théorique : au 04/08/2026, MARDI et JEUDI n'ont aucune
    // séance ouverte à CINEP alors que SEMAINE et WEEK_END en ont. Dès que
    // Connect répondra, ces deux grilles-là resteront donc sans montant — « en
    // caisse » — le temps que le canal soit ouvert sur toute la programmation.
    const mode = live.some(Boolean) ? 'veezi'
      : [...stored.values()].some(r => r.price_cents) ? 'stored'
      : 'reference'

    const result = list.map((c, i) => {
      const saved = stored.get(c.name)

      let tickets = null
      if (mode === 'veezi') {
        tickets = live[i]
      } else if (mode === 'stored') {
        // price_cards ne porte qu'un montant par grille : une seule ligne,
        // sans tranche d'âge.
        tickets = saved?.price_cents
          ? [{ id: 'tarif', label: saved.display_name || null, priceCents: saved.price_cents }]
          : null
      } else {
        tickets = referenceTickets(c.name)
      }
      const source = tickets ? mode : null

      return {
        name:         c.name,
        labelKey:     referenceKey(c.name),
        label:        saved?.display_name || null,
        offer:        referenceOffer(c.name),
        weekdays:     [...c.weekdays].sort().map(i => WEEKDAYS[i]),
        from:         hhmm(c.earliest),
        to:           hhmm(c.latest),
        sessionCount: c.sessionCount,
        tickets,
        source,
      }
    }).sort((a, b) => b.sessionCount - a.sessionCount)

    // Le semainier : pour chaque jour, les grilles qui s'y appliquent, la plus
    // fournie en tête. C'est elle qui donne le prix du jour ; les autres sont
    // des créneaux à part (séance du matin, avant-première).
    const week = WEEK_ORDER.map(dayIndex => ({
      dayIndex,
      key: WEEKDAYS[dayIndex],
      slots: [...(days.get(dayIndex) || new Map()).entries()]
        .map(([name, slot]) => ({
          card:         name,
          sessionCount: slot.sessionCount,
          from:         hhmm(slot.earliest),
          to:           hhmm(slot.latest),
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount),
    }))

    // Les colonnes de prix, dans l'ordre où les grilles les présentent.
    const brackets = []
    for (const card of result) {
      for (const ticket of card.tickets || []) {
        if (!brackets.some(b => b.id === ticket.id)) {
          brackets.push({ id: ticket.id, label: ticket.label })
        }
      }
    }

    return Response.json({
      week,
      cards: result,
      brackets,
      todayIndex: localTime(now).getDay(),
      // La source citée en provenance par la page.
      source: result.some(c => c.source) ? mode : null,
      hasAmounts: brackets.length > 0,
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
