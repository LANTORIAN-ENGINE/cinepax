import { createServiceClient } from '@/lib/supabase'

function generateBookingRef() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `CPX-${date}-${rand}`
}

export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'Supabase non configuré. Voir SETUP.md.' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  // Get auth user from Authorization header if provided
  let userId = null
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const { data: { user } } = await supabase.auth.getUser(token)
    userId = user?.id ?? null
  }

  const bookingRef = generateBookingRef()
  const qrData = JSON.stringify({
    ref: bookingRef,
    film: body.filmTitle,
    session: body.sessionId,
    seats: (body.seats ?? []).map(s => s.displayKey),
    ts: Date.now(),
  })

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      booking_ref:         bookingRef,
      user_id:             userId,
      guest_name:          body.guestName ?? null,
      guest_email:         body.guestEmail ?? null,
      guest_phone:         body.guestPhone ?? null,
      session_id:          String(body.sessionId),
      film_id:             String(body.filmId),
      film_title:          body.filmTitle,
      screen_id:           body.screenId,
      screen_name:         body.screenName ?? null,
      session_time:        body.sessionTime,
      total_amount_cents:  body.totalAmountCents ?? 0,
      payment_method:      body.paymentMethod ?? null,
      payment_status:      'pending',
      ticket_breakdown:    body.ticketBreakdown ?? null,
      qr_code_data:        qrData,
      status:              'confirmed',
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Insert individual seats
  if (body.seats?.length > 0) {
    const seatRows = body.seats.map(s => ({
      booking_id:          booking.id,
      row_name:            s.rowName,
      seat_number:         parseInt(s.seatNumber) || 0,
      display_key:         s.displayKey,
      price_cents:         body.pricePerSeat ?? 0,
      area_category_code:  s.areaCategoryCode ?? null,
      area_number:         s.areaNumber ?? null,
      row_index:           s.rowIndex ?? null,
      column_index:        s.columnIndex ?? null,
    }))
    await supabase.from('booking_seats').insert(seatRows)
  }

  return Response.json({ booking })
}
