import { createServiceClient } from '@/lib/supabase'

// Rattache les réservations faites en mode visiteur (user_id null) au compte
// de l'utilisateur connecté, en associant sur l'email.
//
// POST /api/bookings/claim  — Authorization: Bearer <jwt>
//
// Sécurité : l'email de rapprochement provient TOUJOURS du JWT validé
// (jamais du corps de requête). Un utilisateur ne peut donc récupérer que
// les réservations invité portant sa propre adresse email vérifiée.
export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'no_token', claimed: 0 }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured', claimed: 0 }, { status: 503 })
  }

  // Valider le JWT → utilisateur + email vérifié
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (userErr || !user?.email) {
    return Response.json({ error: 'invalid_token', claimed: 0 }, { status: 401 })
  }

  const email = user.email.trim().toLowerCase()

  // Candidats : réservations invité (non rattachées) portant un email.
  // Le filtre exact (insensible à la casse) est fait en JS pour éviter les
  // faux positifs liés aux caractères joker (_ %) de LIKE/ILIKE.
  const { data: guestBookings, error: selErr } = await supabase
    .from('bookings')
    .select('id, guest_email')
    .is('user_id', null)
    .not('guest_email', 'is', null)

  if (selErr) {
    return Response.json({ error: selErr.message, claimed: 0 }, { status: 500 })
  }

  const ids = (guestBookings || [])
    .filter(b => (b.guest_email || '').trim().toLowerCase() === email)
    .map(b => b.id)

  if (!ids.length) {
    return Response.json({ claimed: 0 })
  }

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ user_id: user.id })
    .in('id', ids)

  if (updErr) {
    return Response.json({ error: updErr.message, claimed: 0 }, { status: 500 })
  }

  return Response.json({ claimed: ids.length })
}
