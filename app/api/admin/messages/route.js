import { createServiceClient } from '@/lib/supabase'

// Boîte de réception du formulaire de contact — ADMIN uniquement.
//
//   GET    /api/admin/messages?status=&q=      liste + compteurs
//   PATCH  /api/admin/messages  { id, status?, adminNote? }
//   DELETE /api/admin/messages  { id }
//
// Les messages contiennent des données personnelles : ils ne transitent
// jamais par la clé anon. Tout passe par la service_role, derrière une
// vérification is_admin, comme /api/bookings/delete.

const STATUSES = ['new', 'in_progress', 'answered', 'closed']

async function requireAdmin(request) {
  const supabase = createServiceClient()
  if (!supabase) return { error: Response.json({ error: 'supabase_not_configured' }, { status: 503 }) }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'no_token' }, { status: 401 }) }
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return { error: Response.json({ error: 'invalid_token' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { supabase, user }
}

export async function GET(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  const url    = new URL(request.url)
  const status = url.searchParams.get('status')
  const q      = (url.searchParams.get('q') || '').trim()
  const email  = (url.searchParams.get('email') || '').trim().toLowerCase()

  // ?email= : tout l'historique d'une adresse, filtres ignorés. Le panneau
  // de détail s'en sert pour « autres demandes de cette adresse » — une
  // liste tronquée par le filtre courant y serait trompeuse.
  if (email) {
    const { data, error: hErr } = await supabase
      .from('contact_messages_admin')
      .select('id, message_ref, subject, status, created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(50)

    if (hErr) return Response.json({ error: hErr.message }, { status: 500 })
    return Response.json({ messages: data || [] })
  }

  let query = supabase
    .from('contact_messages_admin')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && STATUSES.includes(status)) query = query.eq('status', status)

  // Les jokers de PostgREST (% , _ , virgule) sont neutralisés : une
  // recherche « 50% » ne doit pas se transformer en filtre fourre-tout.
  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ').trim()
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,message.ilike.%${safe}%,message_ref.ilike.%${safe}%`
      )
    }
  }

  const { data, error: qErr } = await query
  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  // Compteurs par état, indépendants du filtre courant : les onglets
  // affichent le total réel, pas le total de ce qu'on regarde.
  const { data: all } = await supabase.from('contact_messages').select('status')
  const counts = { all: all?.length || 0, new: 0, in_progress: 0, answered: 0, closed: 0 }
  for (const row of all || []) {
    if (counts[row.status] !== undefined) counts[row.status] += 1
  }

  return Response.json({ messages: data || [], counts })
}

export async function PATCH(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  const { id, status, adminNote } = body
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const patch = { updated_at: new Date().toISOString() }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return Response.json({ error: 'status_invalide' }, { status: 400 })
    }
    patch.status = status
    // Repasser en amont d'une réponse efface l'horodatage : la date
    // affichée reste celle de la réponse réellement en vigueur.
    if (status !== 'answered') patch.answered_at = null
  }
  if (adminNote !== undefined) {
    patch.admin_note = String(adminNote).slice(0, 2000).trim() || null
  }

  const { data, error: upErr } = await supabase
    .from('contact_messages')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  return Response.json({ ok: true, message: data })
}

export async function DELETE(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  if (!body.id) return Response.json({ error: 'id requis' }, { status: 400 })

  const { error: delErr } = await supabase
    .from('contact_messages').delete().eq('id', body.id)

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })
  return Response.json({ ok: true, deleted: true })
}
