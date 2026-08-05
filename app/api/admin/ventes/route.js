import { createServiceClient } from '@/lib/supabase'
import { normalizeCutoff, readSettings, DEFAULTS } from '@/lib/ventes'
import { oublierReglagesVente } from '@/lib/ventesServeur'

// Réglages de vente en ligne — ADMIN uniquement.
//
//   GET   /api/admin/ventes   le réglage en vigueur
//   PATCH /api/admin/ventes   { cutoffMinutes, hideInProgramme }
//
// Aucune policy d'écriture n'est ouverte sur sales_settings : tout passe
// par ici, derrière la vérification is_admin — même règle que
// /api/admin/legal et /api/admin/messages.

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

export async function GET(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  const { data, error: readErr } = await supabase
    .from('sales_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  // Migration pas encore passée : on le dit plutôt que d'afficher un
  // réglage qui ne s'enregistrera pas. L'écran d'administration en fait un
  // message clair, avec le nom du script à exécuter.
  if (readErr) {
    return Response.json(
      { error: 'table_absente', detail: readErr.message, settings: { ...DEFAULTS } },
      { status: 503 },
    )
  }

  return Response.json({
    settings:  readSettings(data),
    updatedAt: data?.updated_at || null,
  })
}

export async function PATCH(request) {
  const { supabase, user, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  // Un délai vide ou aberrant serait un piège silencieux : on le refuse
  // plutôt que de le ramener à une borne sans le dire.
  const raw = Number(body.cutoffMinutes)
  if (!Number.isFinite(raw) || raw < 0 || raw > 1440) {
    return Response.json({ error: 'delai_invalide' }, { status: 400 })
  }

  const patch = {
    id:                1,
    cutoff_minutes:    normalizeCutoff(raw),
    hide_in_programme: body.hideInProgramme === true,
    updated_at:        new Date().toISOString(),
    updated_by:        user.id,
  }

  const { data, error: upErr } = await supabase
    .from('sales_settings')
    .upsert(patch, { onConflict: 'id' })
    .select('*')
    .single()

  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  // Les vérifications serveur gardent le réglage trente secondes en
  // mémoire : on l'oublie ici pour que le nouveau délai vaille dès
  // l'enregistrement, et pas au prochain rafraîchissement du cache.
  oublierReglagesVente()

  return Response.json({
    ok:        true,
    settings:  readSettings(data),
    updatedAt: data.updated_at,
  })
}
