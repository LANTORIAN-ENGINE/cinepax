import { createServiceClient } from '@/lib/supabase'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const { crypted_callback } = body
  if (!crypted_callback) {
    return Response.json({ error: 'crypted_callback manquant' }, { status: 400 })
  }

  const username = process.env.BNI_PAY_USERNAME
  const password = process.env.BNI_PAY_PASSWORD

  if (!username || !password) {
    return Response.json({ error: 'BNI Pay non configuré' }, { status: 503 })
  }

  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64')

  // Décryptage du callback via BNI
  let payment
  try {
    const decryptRes = await fetch('https://mypay.bni.mg/api/decrypt_imn_data', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${basicAuth}`,
        'user-agent':    'Mozilla/5.0 (compatible; Cinepax/1.0)',
      },
      body: JSON.stringify({
        authentify: {
          id_merchant:       process.env.BNI_PAY_ID_MERCHANT,
          id_entity:         process.env.BNI_PAY_ID_ENTITY,
          id_operator:       process.env.BNI_PAY_ID_OPERATOR,
          operator_password: process.env.BNI_PAY_OPERATOR_PASSWORD,
        },
        salt:                 process.env.BNI_PAY_SALT,
        cipher_key:           process.env.BNI_PAY_CIPHER_KEY,
        received_crypted_data: crypted_callback,
      }),
    })

    const rawText = await decryptRes.text()
    try {
      payment = JSON.parse(rawText)
    } catch {
      const status = decryptRes.status
      const h1 = rawText.match(/<h1>([^<]+)<\/h1>/i)?.[1]?.trim()
      const msg = h1 ?? `HTTP ${status}`
      console.error(`[BNI callback] decrypt réponse non-JSON (${status}): ${msg}`)
      return Response.json({ ok: false, error: `BNI decrypt: ${msg}` })
    }
  } catch (e) {
    console.error('[BNI callback] decrypt error:', e.message)
    // Répondre 200 à BNI même en cas d'erreur interne pour éviter les retries infinis
    return Response.json({ ok: false, error: e.message })
  }

  const orderId       = payment.id_order
  const status        = payment.status
  const transactionId = payment.transaction_id

  if (!orderId) {
    return Response.json({ ok: false, error: 'id_order manquant dans le payload décrypté' })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ ok: false, error: 'Supabase non configuré' })
  }

  const updatePayload = {
    payment_status:         status === 'success' ? 'paid' : 'failed',
    payment_transaction_id: transactionId ?? null,
  }

  const { error } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('booking_ref', orderId)

  if (error) {
    console.error('[BNI callback] supabase update error:', error.message)
    return Response.json({ ok: false, error: error.message })
  }

  return Response.json({ ok: true })
}
