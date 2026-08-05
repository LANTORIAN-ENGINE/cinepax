import { createServiceClient } from '@/lib/supabase'
import { CONSENT_CONTEXTS } from '@/lib/legal'

// Enregistrement et relecture des consentements.
//
//   POST /api/legal/consent   { slugs, context, locale, email?, accepted? }
//   GET  /api/legal/consent   (Bearer) ce que ce compte a accepté, et ce qui manque
//
// La version acceptée, la date et l'adresse IP sont relevées ici, côté
// serveur, à partir de l'état réel de la base. Le navigateur dit quels
// documents ont été cochés ; il ne dicte ni la version ni l'horodatage —
// une preuve de consentement que le client pourrait rédiger lui-même ne
// prouverait rien.

export const dynamic = 'force-dynamic'

// Derrière Vercel, l'adresse d'origine arrive en tête de x-forwarded-for.
function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim().slice(0, 45)
  return request.headers.get('x-real-ip')?.slice(0, 45) || null
}

// Identité de l'appelant : le jeton fait foi quand il y en a un. À défaut,
// on retient l'adresse saisie — la trace reste orpheline jusqu'à ce que le
// compte la réclame (voir GET plus bas).
async function resolveSubject(supabase, request, bodyEmail) {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    if (user) return { userId: user.id, guestEmail: null, email: user.email }
  }

  const email = String(bodyEmail || '').trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return null

  return { userId: null, guestEmail: email, email }
}

export async function POST(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  const slugs = [...new Set(
    (Array.isArray(body.slugs) ? body.slugs : [])
      .map(s => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 20)
  )]
  if (!slugs.length) return Response.json({ error: 'slugs_requis' }, { status: 400 })

  const context = CONSENT_CONTEXTS.includes(body.context) ? body.context : 'register'
  const accepted = body.accepted !== false
  const locale   = body.locale === 'en' ? 'en' : 'fr'

  const subject = await resolveSubject(supabase, request, body.email)
  if (!subject) return Response.json({ error: 'identite_requise' }, { status: 400 })

  // La version enregistrée est celle qui est en vigueur au moment du clic,
  // relue en base. Un document non publié ne peut pas être consenti.
  const { data: docs, error: docErr } = await supabase
    .from('legal_documents')
    .select('id, slug, version')
    .in('slug', slugs)
    .eq('is_published', true)

  if (docErr) return Response.json({ error: docErr.message }, { status: 500 })
  if (!docs?.length) return Response.json({ error: 'documents_introuvables' }, { status: 404 })

  const now  = new Date().toISOString()
  const rows = docs.map(doc => ({
    user_id:     subject.userId,
    guest_email: subject.userId ? null : subject.guestEmail,
    document_id: doc.id,
    slug:        doc.slug,
    version:     doc.version,
    accepted,
    context,
    locale,
    ip:          clientIp(request),
    user_agent:  request.headers.get('user-agent')?.slice(0, 400) || null,
    accepted_at: now,
  }))

  // Revenir sur un consentement (l'accepter à nouveau, ou le retirer) met à
  // jour la ligne existante : c'est l'état courant qui compte, pas le nombre
  // de fois qu'on a cliqué. Les index uniques partiels distinguent le cas
  // « compte » du cas « adresse seule ».
  const conflict = subject.userId
    ? 'user_id, slug, version'
    : 'guest_email, slug, version'

  const { error: upErr } = await supabase
    .from('legal_consents')
    .upsert(rows, { onConflict: conflict })

  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  return Response.json({
    ok: true,
    recorded: rows.map(r => ({ slug: r.slug, version: r.version, accepted: r.accepted })),
    at: now,
  })
}

export async function GET(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'no_token' }, { status: 401 })
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return Response.json({ error: 'invalid_token' }, { status: 401 })

  // Rattrapage : un consentement donné avant la création du compte, avec
  // cette même adresse, rejoint le compte. L'adresse vient du jeton vérifié,
  // jamais du corps de la requête — sinon n'importe qui réclamerait les
  // traces de n'importe qui.
  if (user.email) {
    const { data: orphans } = await supabase
      .from('legal_consents')
      .select('id, slug, version')
      .is('user_id', null)
      .eq('guest_email', user.email.trim().toLowerCase())

    if (orphans?.length) {
      const { data: owned } = await supabase
        .from('legal_consents')
        .select('slug, version')
        .eq('user_id', user.id)

      const held = new Set((owned || []).map(c => `${c.slug}@${c.version}`))
      const claimable = orphans
        .filter(o => !held.has(`${o.slug}@${o.version}`))
        .map(o => o.id)

      if (claimable.length) {
        await supabase
          .from('legal_consents')
          .update({ user_id: user.id, guest_email: null })
          .in('id', claimable)
      }
    }
  }

  const [consentsRes, docsRes] = await Promise.all([
    supabase
      .from('legal_consents')
      .select('slug, version, accepted, context, accepted_at')
      .eq('user_id', user.id)
      .order('accepted_at', { ascending: false }),
    supabase
      .from('legal_documents')
      .select('slug, title_fr, title_en, version, requires_consent, consent_group')
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
  ])

  if (consentsRes.error) {
    return Response.json({ error: consentsRes.error.message }, { status: 500 })
  }

  const consents = consentsRes.data || []
  const docs     = docsRes.data || []

  // Ce qu'il reste à accepter : un document requis dont la version en
  // vigueur n'a pas été acceptée. C'est ce que la connexion redemande.
  const latest = new Map()
  for (const c of consents) {
    const prev = latest.get(c.slug)
    if (!prev || c.version > prev.version) latest.set(c.slug, c)
  }

  const pending = docs
    .filter(d => d.requires_consent)
    .filter(d => {
      const c = latest.get(d.slug)
      return !c || c.accepted !== true || c.version !== d.version
    })
    .map(d => d.slug)

  return Response.json({ consents, documents: docs, pending })
}
