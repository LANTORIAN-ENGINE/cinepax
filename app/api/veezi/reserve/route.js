import { createServiceClient } from '@/lib/supabase'

// Finalise une réservation côté Veezi (API Connect) une fois le paiement encaissé.
// Flux en 2 étapes prouvé en live :
//   1. POST /RESTTicketing.svc/order/tickets  → tient les sièges (panier)
//   2. POST /RESTTicketing.svc/order/payment  → confirme (PerformPayment:false,
//      = paiement déjà encaissé en externe : Orange / MVola / BNI Pay)
// Idempotent : ne refait rien si la réservation porte déjà un n° Veezi.

const CONNECT_BASE = 'https://connect.eu.veezi.com'
const CINEMA_ID = '0000000309'

function connectHeaders() {
  return {
    'vista-tenant':    process.env.CONNECT_TENANT,
    'connectApiToken': process.env.CONNECT_TOKEN,
    'Content-Type':    'application/json',
  }
}

async function connectPost(path, body) {
  const res = await fetch(`${CONNECT_BASE}${path}`, {
    method:  'POST',
    headers: connectHeaders(),
    body:    JSON.stringify(body),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { Result: -1, ErrorDescription: text.slice(0, 200) } }
}

async function connectGet(path) {
  const res = await fetch(`${CONNECT_BASE}${path}`, { headers: connectHeaders() })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return null }
}

// Vérifie la disponibilité live de chaque siège sélectionné dans le seat-plan.
// Renvoie la liste des sièges NON disponibles (Status !== 0), avec leur libellé.
async function findUnavailableSeats(sessionId, seatRows) {
  const plan = await connectGet(
    `/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${sessionId}/seat-plan`,
  )
  const areas = plan?.SeatLayoutData?.Areas
  if (!Array.isArray(areas)) return null   // seat-plan indisponible → on ne bloque pas

  // Index live : "area|row|col" -> Status
  const status = {}
  for (const area of areas) {
    for (const row of area.Rows ?? []) {
      for (const s of row.Seats ?? []) {
        const p = s.Position ?? {}
        status[`${p.AreaNumber}|${p.RowIndex}|${p.ColumnIndex}`] = s.Status
      }
    }
  }

  const unavailable = []
  for (const s of seatRows) {
    const key = `${s.area_number}|${s.row_index}|${s.column_index}`
    const st = status[key]
    if (st !== 0) unavailable.push(s.display_key || key)  // absent ou déjà pris
  }
  return unavailable
}

export async function POST(request) {
  if (!process.env.CONNECT_TENANT || !process.env.CONNECT_TOKEN) {
    return Response.json({ error: 'Connect (Veezi) non configuré' }, { status: 503 })
  }
  const supabase = createServiceClient()
  if (!supabase) return Response.json({ error: 'Supabase non configuré' }, { status: 503 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }
  const { bookingRef } = body
  if (!bookingRef) return Response.json({ error: 'bookingRef requis' }, { status: 400 })

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('booking_ref', bookingRef).single()
  if (!booking) return Response.json({ error: 'Réservation introuvable' }, { status: 404 })

  const { data: seatRows } = await supabase
    .from('booking_seats').select('*').eq('booking_id', booking.id)

  // Résumé exposé au client (billet / QR / PDF) — sans données sensibles.
  const bookingSummary = {
    ref:           booking.booking_ref,
    filmTitle:     booking.film_title,
    sessionTime:   booking.session_time,
    screenName:    booking.screen_name,
    seats:         (seatRows || []).map(s => s.display_key).filter(Boolean),
    totalCents:    booking.total_amount_cents,
    paymentMethod: booking.payment_method,
    guestName:     booking.guest_name,
    // Détail par type de billet — l'intitulé du tarif est lu au contrôle
    // ([{ code, description, priceInCents, qty }]).
    ticketBreakdown: Array.isArray(booking.ticket_breakdown) ? booking.ticket_breakdown : null,
  }

  // Idempotent — déjà réservé côté Veezi
  if (booking.veezi_booking_number) {
    return Response.json({
      ok: true, alreadyReserved: true,
      veeziBookingNumber: booking.veezi_booking_number,
      veeziBookingId:     booking.veezi_booking_id,
      booking:            bookingSummary,
    })
  }

  // Détail des types de billets — requis par order/tickets
  const tickets = Array.isArray(booking.ticket_breakdown) ? booking.ticket_breakdown : []
  if (!tickets.length) {
    // Séance sans tarif live CINEP → pas de codes billets : on ne peut pas réserver côté Veezi
    await supabase.from('bookings').update({ veezi_status: 'skipped' }).eq('id', booking.id)
    return Response.json({ ok: false, skipped: true, reason: 'Aucun détail de billet (CINEP inactif sur la séance)', booking: bookingSummary })
  }

  const selectedSeats = (seatRows || [])
    .filter(s => s.area_category_code != null && s.row_index != null && s.column_index != null)
    .map(s => ({
      AreaCategoryCode: s.area_category_code,
      AreaNumber:       s.area_number,
      RowIndex:         s.row_index,
      ColumnIndex:      s.column_index,
    }))

  const ticketTypes = tickets.map(t => ({
    TicketTypeCode: t.code, Qty: t.qty, PriceInCents: t.priceInCents,
  }))
  const totalCents = tickets.reduce((sum, t) => sum + t.qty * t.priceInCents, 0)
  // ⚠️ Vista lève une exception opaque ("An unexpected error…") si le
  // UserSessionId dépasse 32 caractères ou contient des caractères non
  // alphanumériques. On utilise donc un GUID hex de 32 car. (format Vista).
  const userSessionId = crypto.randomUUID().replace(/-/g, '')

  // 0) Pré-contrôle : les sièges sont-ils encore libres en salle ?
  // Vista renvoie un message opaque ("An unexpected error…") si on tente
  // d'allouer un siège déjà pris ; on le transforme en erreur claire.
  if (selectedSeats.length > 0) {
    const unavailable = await findUnavailableSeats(String(booking.session_id), seatRows)
    if (unavailable && unavailable.length) {
      await supabase.from('bookings').update({ veezi_status: 'seat_unavailable' }).eq('id', booking.id)
      return Response.json({
        ok: false,
        step: 'availability',
        unavailableSeats: unavailable,
        error: `Siège(s) déjà réservé(s) en salle : ${unavailable.join(', ')}. Le paiement est encaissé mais la place n'a pas pu être bloquée côté cinéma.`,
        booking: bookingSummary,
      }, { status: 409 })
    }
  }

  // 1) order/tickets — tient les sièges
  const order = await connectPost('/RESTTicketing.svc/order/tickets', {
    UserSessionId:                userSessionId,
    CinemaId:                     CINEMA_ID,
    SessionId:                    String(booking.session_id),
    TicketTypes:                  ticketTypes,
    SelectedSeats:                selectedSeats,
    UserSelectedSeatingSupported: selectedSeats.length > 0,
    ReturnOrder:                  true,
    // BookingMode : 0 = Vente (siège « Assigné », avec transaction financière)
    //               1 = Réservation (siège « Réservé », sans transaction)
    // On veut « Réservé » côté Veezi → BookingMode 1. Vérifié en live :
    // mode 1 → order/payment OK, VistaBookingNumber renvoyé, TransNumber = 0.
    BookingMode:                  1,
  })
  if (order?.Result !== 0) {
    await supabase.from('bookings').update({ veezi_status: 'failed' }).eq('id', booking.id)
    return Response.json(
      {
        ok: false,
        step: 'tickets',
        vistaResult: order?.Result,
        vistaExtendedCode: order?.ExtendedResultCode,
        error: order?.ErrorDescription || `Result ${order?.Result}`,
        booking: bookingSummary,
      },
      { status: 502 },
    )
  }

  // 2) order/payment — confirme (paiement déjà encaissé en externe)
  const cardType = process.env.VEEZI_CINEP_CARDTYPE || 'VISA'
  const pay = await connectPost('/RESTTicketing.svc/order/payment', {
    PerformPayment: false,
    UserSessionId:  userSessionId,
    CinemaId:       CINEMA_ID,
    CustomerName:   booking.guest_name  || booking.film_title,
    CustomerEmail:  booking.guest_email || '',
    PaymentInfo:    { CardType: cardType, PaymentValueCents: totalCents },
  })
  if (pay?.Result !== 0) {
    await supabase.from('bookings')
      .update({ veezi_status: 'failed', veezi_user_session_id: userSessionId })
      .eq('id', booking.id)
    return Response.json(
      { ok: false, step: 'payment', error: pay?.ErrorDescription || `Result ${pay?.Result}`, booking: bookingSummary },
      { status: 502 },
    )
  }

  const veeziBookingNumber = pay.VistaBookingNumber != null ? String(pay.VistaBookingNumber) : null
  const veeziBookingId     = pay.VistaBookingId     != null ? String(pay.VistaBookingId)     : null

  await supabase.from('bookings').update({
    veezi_booking_number:  veeziBookingNumber,
    veezi_booking_id:      veeziBookingId,
    veezi_user_session_id: userSessionId,
    veezi_status:          'reserved',
  }).eq('id', booking.id)

  return Response.json({ ok: true, veeziBookingNumber, veeziBookingId, booking: bookingSummary })
}
