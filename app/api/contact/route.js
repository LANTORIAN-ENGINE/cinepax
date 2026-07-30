import { createServiceClient } from '@/lib/supabase'

// Réception du formulaire de contact.
//
// POST /api/contact  { fullName, email, phone?, subject, message, locale?, company? }
//
// Ouvert aux visiteurs comme aux clients connectés : aucun jeton n'est
// demandé. Le rattachement au compte se fait uniquement sur l'e-mail, côté
// base (trigger link_contact_message) — l'application ne transmet jamais de
// user_id, ce qui interdit d'attacher un message au compte d'un tiers.

const SUBJECTS = ['booking', 'rates', 'event', 'advertising', 'complaint', 'other']
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/

// Limites alignées sur les CHECK de la table : un message refusé par
// Postgres l'est déjà ici, avec un message utilisable côté formulaire.
const LIMITS = {
  fullName: { min: 2,  max: 120  },
  message:  { min: 10, max: 4000 },
  phone:    { max: 40 },
}

// Garde-fou anti-flood, en mémoire du processus : 5 envois / 10 min / IP.
// Volontairement modeste — c'est un ralentisseur, pas une protection forte
// (le processus serverless peut être recyclé). Le vrai filet est le
// honeypot plus les contraintes de la base.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) return true
  recent.push(now)
  hits.set(ip, recent)
  // Purge opportuniste : la table ne grossit pas indéfiniment
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k)
  }
  return false
}

// MSG-20260730-A3F2K — même grammaire que les références de réservation
function makeRef() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `MSG-${date}-${rand}`
}

export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  // Honeypot : un champ invisible que seuls les robots remplissent.
  // On répond « ok » pour ne pas leur signaler le filtre.
  if (typeof body.company === 'string' && body.company.trim()) {
    return Response.json({ ok: true, ref: makeRef(), linked: false })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  if (rateLimited(ip)) {
    return Response.json({ error: 'rate_limited' }, { status: 429 })
  }

  const fullName = String(body.fullName ?? '').trim()
  const email    = String(body.email    ?? '').trim().toLowerCase()
  const phone    = String(body.phone    ?? '').trim()
  const message  = String(body.message  ?? '').trim()
  const subject  = SUBJECTS.includes(body.subject) ? body.subject : 'other'
  const locale   = body.locale === 'en' ? 'en' : 'fr'

  // Un champ = une erreur nommée : le formulaire sait quoi surligner.
  const errors = {}
  if (fullName.length < LIMITS.fullName.min || fullName.length > LIMITS.fullName.max) {
    errors.fullName = 'invalid'
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    errors.email = 'invalid'
  }
  if (phone.length > LIMITS.phone.max) {
    errors.phone = 'invalid'
  }
  if (message.length < LIMITS.message.min || message.length > LIMITS.message.max) {
    errors.message = 'invalid'
  }
  if (Object.keys(errors).length) {
    return Response.json({ error: 'validation', fields: errors }, { status: 422 })
  }

  const messageRef = makeRef()

  // status / admin_note / user_id ne sont volontairement pas transmis :
  // ils gardent leur valeur par défaut ou sont posés par le trigger.
  const { data, error } = await supabase
    .from('contact_messages')
    .insert({
      message_ref: messageRef,
      full_name:   fullName,
      email,
      phone:       phone || null,
      subject,
      message,
      locale,
      source:      'contact_page',
    })
    .select('message_ref, user_id')
    .single()

  if (error) {
    console.error('[api/contact] insert error:', error.message)
    return Response.json({ error: 'insert_failed' }, { status: 500 })
  }

  // linked : l'e-mail correspond à un compte, le message est donc déjà
  // visible dans l'espace client. La page de confirmation le dit.
  return Response.json({
    ok:     true,
    ref:    data.message_ref,
    linked: Boolean(data.user_id),
  })
}
