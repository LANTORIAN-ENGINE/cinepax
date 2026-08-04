import { createServiceClient } from '@/lib/supabase'
import { referenceTickets } from '@/lib/tarifs'

// La grille de référence mise à la forme que Connect renvoie. Le tunnel
// consomme ainsi la même structure quelle que soit la source : le jour où le
// canal CINEP s'ouvrira, il basculera sur les vrais types de billets sans
// qu'une seule ligne de l'affichage ne change.
//
// Le plein tarif passe en tête, comme le fait Connect avec son DisplaySequence :
// c'est ce premier billet que le tunnel attribue par défaut aux places choisies.
//
// À prix égal, c'est la tranche la plus âgée qui l'emporte. Le mardi, l'affiche
// ramène l'adulte au tarif du jeune : sans ce départage, un adulte repartirait
// avec un billet « 12 à 24 ans » — même montant, mais mauvais libellé, et
// contrôlable à l'entrée. `referenceTickets` rend les tranches du plus jeune au
// plus âgé : on inverse avant de trier, et le tri stable fait le reste.
function referenceTicketTypes(priceCardName) {
  const tickets = referenceTickets(priceCardName)
  if (!tickets) return null
  return [...tickets]
    .reverse()
    .sort((a, b) => b.priceCents - a.priceCents)
    .map((t, i) => ({
      TicketTypeCode:  t.id,
      Description:     null,        // libellé traduit côté client (offers.age.*)
      BracketId:       t.id,
      PriceInCents:    t.priceCents,
      SalesChannels:   ['CINEP'],
      DisplaySequence: i + 1,
    }))
}

export async function GET(request) {
  const url           = new URL(request.url)
  const sessionId     = url.searchParams.get('sessionId')
  const priceCardName = url.searchParams.get('priceCardName')

  if (!sessionId && !priceCardName) {
    return Response.json({ price: null, source: null, tickets: null })
  }

  // Les montants enregistrés priment sur l'affiche. Isolés dans leur propre
  // try : une base injoignable doit faire descendre d'un cran, pas renvoyer
  // une séance sans tarif.
  try {
    const supabase = createServiceClient()
    if (supabase) {
      // 1) Prix spécifique à la séance (priorité maximale)
      if (sessionId) {
        const { data: sp } = await supabase
          .from('session_prices')
          .select('price_cents')
          .eq('session_id', sessionId)
          .single()
        if (sp?.price_cents != null)
          return Response.json({ price: sp.price_cents, source: 'session', tickets: null })
      }

      // 2) Prix via PriceCardName
      if (priceCardName) {
        const { data: pc } = await supabase
          .from('price_cards')
          .select('price_cents, display_name')
          .eq('veezi_name', priceCardName)
          .single()
        if (pc?.price_cents != null)
          return Response.json({
            price: pc.price_cents, source: 'price_card', label: pc.display_name, tickets: null,
          })
      }
    }
  } catch { /* base indisponible — on descend sur l'affiche */ }

  // 3) Grille de l'affiche officielle, par tranche d'âge.
  const tickets = referenceTicketTypes(priceCardName)
  if (tickets) {
    return Response.json({ price: tickets[0].PriceInCents, source: 'reference', tickets })
  }

  return Response.json({ price: null, source: null, tickets: null })
}

export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  // Check admin via Authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return Response.json({ error: 'Accès refusé' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const { data, error } = await supabase
    .from('session_prices')
    .upsert({
      session_id:   String(body.sessionId),
      film_id:      String(body.filmId),
      film_title:   body.filmTitle,
      screen_id:    body.screenId,
      session_time: body.sessionTime,
      price_cents:  body.priceCents,
      notes:        body.notes ?? null,
    }, { onConflict: 'session_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ price: data })
}

export async function DELETE(request) {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) return Response.json({ error: 'sessionId requis' }, { status: 400 })

  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return Response.json({ error: 'Accès refusé' }, { status: 403 })

  await supabase.from('session_prices').delete().eq('session_id', sessionId)
  return Response.json({ ok: true })
}
