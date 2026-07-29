import { createServiceClient } from '@/lib/supabase'

export async function GET(request) {
  const url           = new URL(request.url)
  const sessionId     = url.searchParams.get('sessionId')
  const priceCardName = url.searchParams.get('priceCardName')

  if (!sessionId && !priceCardName) return Response.json({ price: null, source: null })

  const supabase = createServiceClient()
  if (!supabase) return Response.json({ price: null, source: null })

  // 1) Prix spécifique à la séance (priorité maximale)
  if (sessionId) {
    const { data: sp } = await supabase
      .from('session_prices')
      .select('price_cents')
      .eq('session_id', sessionId)
      .single()
    if (sp?.price_cents != null)
      return Response.json({ price: sp.price_cents, source: 'session' })
  }

  // 2) Prix via PriceCardName (fallback)
  if (priceCardName) {
    const { data: pc } = await supabase
      .from('price_cards')
      .select('price_cents, display_name')
      .eq('veezi_name', priceCardName)
      .single()
    if (pc?.price_cents != null)
      return Response.json({ price: pc.price_cents, source: 'price_card', label: pc.display_name })
  }

  return Response.json({ price: null, source: null })
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
