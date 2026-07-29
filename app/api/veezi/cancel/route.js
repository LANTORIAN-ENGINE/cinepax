import { createServiceClient } from '@/lib/supabase'
import { connectConfigured, releaseVeeziBooking } from '@/lib/veeziConnect'

// Annule une réservation : libère la place au cinéma (Veezi) puis passe la
// réservation en « cancelled » dans Supabase.
//
// POST /api/veezi/cancel  { bookingRef }  — Authorization: Bearer <jwt>
//
// Autorisé pour le PROPRIÉTAIRE de la réservation (client) OU un ADMIN.
// Règle métier : on n'annule QUE si la séance n'a pas encore commencé. Une fois
// la séance passée, la place n'a plus de sens — l'admin peut alors supprimer la
// réservation via /api/bookings/delete.
export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'supabase_not_configured' }, { status: 503 })

  // 1) Authentification obligatoire
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'no_token' }, { status: 401 })
  }
  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return Response.json({ error: 'invalid_token' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const { bookingRef } = body
  if (!bookingRef) return Response.json({ error: 'bookingRef requis' }, { status: 400 })

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('booking_ref', bookingRef).single()
  if (!booking) return Response.json({ error: 'not_found' }, { status: 404 })

  // 2) Autorisation : admin OU propriétaire (compte lié, ou email invité)
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.is_admin === true
  const isOwner =
    booking.user_id === user.id ||
    (booking.guest_email && user.email &&
      booking.guest_email.trim().toLowerCase() === user.email.trim().toLowerCase())
  if (!isAdmin && !isOwner) return Response.json({ error: 'forbidden' }, { status: 403 })

  // Déjà annulée → idempotent
  if (booking.status === 'cancelled') {
    return Response.json({ ok: true, status: 'cancelled', alreadyCancelled: true })
  }

  // 3) Règle métier : séance non commencée
  const started = new Date(booking.session_time).getTime() <= Date.now()
  if (started) {
    return Response.json({
      ok: false, reason: 'session_started',
      error: 'La séance a déjà commencé — annulation impossible.',
    }, { status: 409 })
  }

  // 4) Libère la place côté Veezi (si elle y a été réservée)
  let veezi = { method: 'skipped' }
  if (booking.veezi_booking_number && connectConfigured()) {
    veezi = await releaseVeeziBooking(booking.veezi_booking_number)
    if (!veezi.ok) {
      return Response.json({
        ok: false, reason: 'veezi_release_failed',
        error: veezi.error ||
          "La place n'a pas pu être libérée au cinéma. Réessayez ou contactez l'accueil.",
      }, { status: 502 })
    }
  }

  // 5) Marque la réservation annulée dans Supabase
  await supabase.from('bookings').update({
    status:       'cancelled',
    veezi_status: booking.veezi_booking_number ? 'cancelled' : booking.veezi_status,
  }).eq('id', booking.id)

  return Response.json({ ok: true, status: 'cancelled', veezi })
}
