import { createServiceClient } from '@/lib/supabase'

async function requireAdmin(request, supabase) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin || false
}

// GET — liste tous les price cards
export async function GET() {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ cards: [] })

  const { data } = await supabase
    .from('price_cards')
    .select('*')
    .order('id')

  return Response.json({ cards: data || [] })
}

// POST — ingestion : upsert un tableau de PriceCardNames + options
// body: { cards: [{ veezi_name, display_name?, color?, price_cents? }] }
export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  if (!await requireAdmin(request, supabase))
    return Response.json({ error: 'Accès refusé' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const rows = (body.cards || []).map(c => ({
    veezi_name:   c.veezi_name,
    display_name: c.display_name || c.veezi_name,
    color:        c.color || '#e8192c',
    price_cents:  c.price_cents ?? 0,
  }))

  if (!rows.length) return Response.json({ cards: [] })

  const { data, error } = await supabase
    .from('price_cards')
    .upsert(rows, { onConflict: 'veezi_name' })
    .select()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ cards: data })
}

// PATCH — mettre à jour un price card (price, color, display_name)
export async function PATCH(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  if (!await requireAdmin(request, supabase))
    return Response.json({ error: 'Accès refusé' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const { id, ...updates } = body
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('price_cards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ card: data })
}

// DELETE — supprimer un price card
export async function DELETE(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  if (!await requireAdmin(request, supabase))
    return Response.json({ error: 'Accès refusé' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  await supabase.from('price_cards').delete().eq('id', id)
  return Response.json({ ok: true })
}
