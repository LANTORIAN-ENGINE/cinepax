import { createServiceClient } from '@/lib/supabase'

// ─── Paiement carte SIMULÉ (fallback de test) ─────────────────────────────────
// Utilisé quand l'API BNI Pay réelle est indisponible (401, 502, non configurée…).
// Marque la réservation comme payée avec une transaction de test, afin de pouvoir
// dérouler tout le parcours jusqu'à la confirmation pendant la phase de POC.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const { bookingRef } = body
  if (!bookingRef) {
    return Response.json({ error: 'bookingRef requis' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    // Pas de base : on considère quand même le test comme réussi côté front
    return Response.json({ ok: true, simulated: true, persisted: false })
  }

  const transactionId = `SIMUL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const { error } = await supabase
    .from('bookings')
    .update({
      payment_status:         'paid',
      payment_transaction_id: transactionId,
    })
    .eq('booking_ref', bookingRef)

  if (error) {
    // On ne bloque pas le test : le parcours doit aboutir malgré tout
    return Response.json({ ok: true, simulated: true, persisted: false, warning: error.message })
  }

  return Response.json({ ok: true, simulated: true, persisted: true, transactionId })
}
