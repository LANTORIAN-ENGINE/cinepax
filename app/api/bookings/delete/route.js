import { createServiceClient } from '@/lib/supabase'

// Supprime définitivement une réservation (et ses sièges).
//
// POST /api/bookings/delete  { bookingRef }  — Authorization: Bearer <jwt>
//
// ADMIN uniquement. Destiné au nettoyage des réservations dont la séance est
// passée (l'annulation avec libération de place n'a plus de sens). Irréversible.
export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'supabase_not_configured' }, { status: 503 })

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'no_token' }, { status: 401 })
  }
  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return Response.json({ error: 'invalid_token' }, { status: 401 })

  // Réservé aux admins
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return Response.json({ error: 'forbidden' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const { bookingRef } = body
  if (!bookingRef) return Response.json({ error: 'bookingRef requis' }, { status: 400 })

  const { data: booking } = await supabase
    .from('bookings').select('id').eq('booking_ref', bookingRef).single()
  if (!booking) return Response.json({ error: 'not_found' }, { status: 404 })

  // Les sièges d'abord (au cas où la contrainte n'est pas ON DELETE CASCADE)
  await supabase.from('booking_seats').delete().eq('booking_id', booking.id)
  const { error } = await supabase.from('bookings').delete().eq('id', booking.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, deleted: true })
}
