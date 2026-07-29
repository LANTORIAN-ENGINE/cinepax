// ─────────────────────────────────────────────────────────────────────────────
//  Helpers serveur — API Vista Connect (connect.eu.veezi.com)
//  Tokens dans .env : CONNECT_TENANT, CONNECT_TOKEN. NE JAMAIS exposer au client.
//  Doc : documentation/ANNULATION_RESERVATIONS_VEEZI.md
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECT_BASE = 'https://connect.eu.veezi.com'
export const CINEMA_ID = '0000000309'

export function connectConfigured() {
  return Boolean(process.env.CONNECT_TENANT && process.env.CONNECT_TOKEN)
}

function connectHeaders() {
  return {
    'vista-tenant':    process.env.CONNECT_TENANT,
    'connectApiToken': process.env.CONNECT_TOKEN,
    'Content-Type':    'application/json',
  }
}

export async function connectPost(path, body) {
  const res = await fetch(`${CONNECT_BASE}${path}`, {
    method:  'POST',
    headers: connectHeaders(),
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { Result: -1, ErrorDescription: text.slice(0, 200) } }
}

// Lit un booking finalisé (RESTBooking.svc). Renvoie l'objet Booking ou null.
export async function getVeeziBooking(bookingNumber) {
  const d = await connectPost('/RESTBooking.svc/booking', {
    CinemaId: CINEMA_ID, BookingNumber: String(bookingNumber),
  })
  return d?.ResultCode === 0 ? d.Booking : null
}

// Relâche un booking finalisé et libère ses sièges dans le back-office.
// Stratégie (voir doc) : tenter `cancel` (marche sur booking NON payé) ; si le
// booking est payé (ExtendedResultCode 48), basculer sur `refund` avec le montant
// exact et tous les RefundGroupNumbers. Le refund d'une résa PerformPayment:false
// est inoffensif (aucun argent réel encaissé — simple renversement comptable).
export async function releaseVeeziBooking(bookingNumber) {
  const booking = await getVeeziBooking(bookingNumber)
  if (!booking) return { ok: false, reason: 'not_found' }
  if (String(booking.CancelledStatus) === '1') {
    return { ok: true, method: 'already_cancelled' }
  }

  // 1) cancel — booking non payé
  const cancel = await connectPost('/RESTBooking.svc/booking/cancel', {
    CinemaId: CINEMA_ID, BookingNumber: String(bookingNumber),
  })
  if (cancel?.Result === 0 && cancel?.ExtendedResultCode === 0) {
    return { ok: true, method: 'cancel' }
  }

  // 2) refund — booking payé (ExtendedResultCode 48 sur cancel)
  const amount = booking.CurrentValueInCents || 0
  const groups = [...new Set(
    (booking.Tickets || []).map(tk => tk.RefundGroupNumber).filter(g => g != null),
  )].sort((a, b) => a - b)

  const refund = await connectPost('/RESTBooking.svc/booking/refund', {
    CinemaId: CINEMA_ID, BookingNumber: String(bookingNumber),
    RefundGroupNumbers: groups, RefundAmount: amount,
  })
  if (refund?.ResultCode === 0) return { ok: true, method: 'refund' }

  return {
    ok:        false,
    reason:    'release_failed',
    cancelExt: cancel?.ExtendedResultCode,
    error:     refund?.ErrorDescription || cancel?.ErrorDescription || null,
  }
}
