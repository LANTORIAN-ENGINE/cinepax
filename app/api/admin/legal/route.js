import { createServiceClient } from '@/lib/supabase'
import { sanitizeLegalHtml, CONSENT_GROUPS } from '@/lib/legal'

// Rédaction des documents légaux — ADMIN uniquement.
//
//   GET    /api/admin/legal   tous les documents (brouillons compris) + réglages
//   PUT    /api/admin/legal   { document, bumpVersion }  crée ou met à jour
//   PATCH  /api/admin/legal   { settings }               bandeau, contact, durée
//   DELETE /api/admin/legal   { id }
//
// Aucune policy d'écriture n'est ouverte sur legal_documents : tout passe
// par ici, derrière la vérification is_admin, comme /api/admin/messages.
//
// Le corps des documents est nettoyé à l'écriture (liste blanche de
// balises). Un administrateur n'est pas un attaquant, mais son compte peut
// être pris : le texte rendu tel quel dans toutes les pages du site ne doit
// pas pouvoir devenir un vecteur d'injection.

export const dynamic = 'force-dynamic'

async function requireAdmin(request) {
  const supabase = createServiceClient()
  if (!supabase) return { error: Response.json({ error: 'supabase_not_configured' }, { status: 503 }) }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'no_token' }, { status: 401 }) }
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return { error: Response.json({ error: 'invalid_token' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { supabase, user }
}

const text = (v, max) => (v === undefined || v === null ? null : String(v).slice(0, max).trim() || null)
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)

export async function GET(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  const [docsRes, settingsRes, consentsRes] = await Promise.all([
    supabase.from('legal_documents').select('*').order('sort_order', { ascending: true }),
    supabase.from('legal_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('legal_consents').select('slug, version, accepted'),
  ])

  if (docsRes.error) return Response.json({ error: docsRes.error.message }, { status: 500 })

  const docs = docsRes.data || []

  // Combien de clients sont à jour sur chaque document. Le chiffre qui
  // compte n'est pas « qui a accepté un jour » mais « qui a accepté la
  // version en vigueur » : c'est lui qui dit si publier a coûté cher.
  const current = new Map(docs.map(d => [d.slug, d.version]))
  const stats = {}
  for (const c of consentsRes.data || []) {
    const s = (stats[c.slug] ||= { total: 0, current: 0, withdrawn: 0 })
    if (c.accepted === false) { s.withdrawn += 1; continue }
    s.total += 1
    if (c.version === current.get(c.slug)) s.current += 1
  }

  return Response.json({
    documents: docs,
    settings:  settingsRes.data || null,
    stats,
  })
}

export async function PUT(request) {
  const { supabase, user, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  const doc = body.document || {}
  const slug = String(doc.slug || '').trim().toLowerCase()

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return Response.json({ error: 'slug_invalide' }, { status: 400 })
  }
  if (!text(doc.title_fr, 200) || !text(doc.title_en, 200)) {
    return Response.json({ error: 'titres_requis' }, { status: 400 })
  }
  if (doc.consent_group && !CONSENT_GROUPS.includes(doc.consent_group)) {
    return Response.json({ error: 'groupe_invalide' }, { status: 400 })
  }

  const requiresConsent = bool(doc.requires_consent, false)
  const consentGroup    = doc.consent_group || null
  if (requiresConsent && !consentGroup) {
    return Response.json({ error: 'groupe_requis_si_consentement' }, { status: 400 })
  }

  const patch = {
    slug,
    title_fr:   text(doc.title_fr, 200),
    title_en:   text(doc.title_en, 200),
    summary_fr: text(doc.summary_fr, 400),
    summary_en: text(doc.summary_en, 400),
    body_fr:    sanitizeLegalHtml(doc.body_fr),
    body_en:    sanitizeLegalHtml(doc.body_en),
    requires_consent: requiresConsent,
    consent_group:    consentGroup,
    consent_label_fr: text(doc.consent_label_fr, 400),
    consent_label_en: text(doc.consent_label_en, 400),
    scroll_gate:  bool(doc.scroll_gate, true),
    is_published: bool(doc.is_published, true),
    in_footer:    bool(doc.in_footer, true),
    sort_order:   Number.isInteger(doc.sort_order) ? doc.sort_order : 100,
    updated_by:   user.id,
  }

  // Création
  if (!doc.id) {
    const { data, error: insErr } = await supabase
      .from('legal_documents')
      .insert({ ...patch, version: 1, effective_on: new Date().toISOString().slice(0, 10) })
      .select('*')
      .single()

    if (insErr) {
      const conflict = insErr.code === '23505'
      return Response.json(
        { error: conflict ? 'slug_deja_pris' : insErr.message },
        { status: conflict ? 409 : 500 }
      )
    }
    return Response.json({ ok: true, document: data, created: true })
  }

  // Mise à jour. La version ne monte que si l'administrateur le demande :
  // corriger une virgule ne doit pas redemander leur accord à tous les
  // clients. Publier une nouvelle version, si — et l'archive est figée au
  // passage par le trigger snapshot_legal_document.
  const { data: existing, error: readErr } = await supabase
    .from('legal_documents').select('version').eq('id', doc.id).maybeSingle()

  if (readErr) return Response.json({ error: readErr.message }, { status: 500 })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  if (body.bumpVersion === true) {
    patch.version = existing.version + 1
    patch.effective_on = new Date().toISOString().slice(0, 10)
  }

  const { data, error: upErr } = await supabase
    .from('legal_documents')
    .update(patch)
    .eq('id', doc.id)
    .select('*')
    .single()

  if (upErr) {
    const conflict = upErr.code === '23505'
    return Response.json(
      { error: conflict ? 'slug_deja_pris' : upErr.message },
      { status: conflict ? 409 : 500 }
    )
  }

  return Response.json({ ok: true, document: data, versionBumped: body.bumpVersion === true })
}

export async function PATCH(request) {
  const { supabase, user, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  const s = body.settings || {}
  const email = text(s.dpo_email, 200)
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: 'email_invalide' }, { status: 400 })
  }

  const patch = { id: 1, updated_by: user.id, updated_at: new Date().toISOString() }
  const assign = (key, value) => { if (value !== null && value !== undefined) patch[key] = value }

  if (typeof s.banner_enabled === 'boolean') patch.banner_enabled = s.banner_enabled
  assign('banner_title_fr', text(s.banner_title_fr, 120))
  assign('banner_title_en', text(s.banner_title_en, 120))
  assign('banner_text_fr',  text(s.banner_text_fr, 600))
  assign('banner_text_en',  text(s.banner_text_en, 600))
  assign('banner_doc_slug', text(s.banner_doc_slug, 60))
  assign('dpo_name',        text(s.dpo_name, 200))
  assign('dpo_email',       email)
  assign('dpo_address',     text(s.dpo_address, 300))
  if (Number.isInteger(s.retention_months) && s.retention_months > 0) {
    patch.retention_months = Math.min(s.retention_months, 600)
  }

  const { data, error: upErr } = await supabase
    .from('legal_settings')
    .upsert(patch, { onConflict: 'id' })
    .select('*')
    .single()

  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  return Response.json({ ok: true, settings: data })
}

export async function DELETE(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  if (!body.id) return Response.json({ error: 'id requis' }, { status: 400 })

  // Un document déjà consenti n'est pas supprimable : les traces de
  // consentement le désignent par son slug, et les effacer reviendrait à
  // détruire la preuve. Il se dépublie — il disparaît du site, le dossier
  // reste. C'est la seule option juste.
  const { data: doc } = await supabase
    .from('legal_documents').select('slug').eq('id', body.id).maybeSingle()

  if (doc) {
    const { count } = await supabase
      .from('legal_consents')
      .select('id', { count: 'exact', head: true })
      .eq('slug', doc.slug)

    if ((count || 0) > 0) {
      return Response.json(
        { error: 'document_consenti', consents: count },
        { status: 409 }
      )
    }
  }

  const { error: delErr } = await supabase
    .from('legal_documents').delete().eq('id', body.id)

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })
  return Response.json({ ok: true, deleted: true })
}
