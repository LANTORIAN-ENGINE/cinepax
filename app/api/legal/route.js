import { createServiceClient } from '@/lib/supabase'

// Documents légaux publiés — lecture publique.
//
//   GET /api/legal          titres, résumés, réglages (pied de page, sommaire)
//   GET /api/legal?body=1   + le corps des documents (cases de consentement)
//
// Le pied de page apparaît sur toutes les pages du site : il ne doit pas
// rapatrier quatre contrats à chaque navigation. Le corps n'est donc servi
// que sur demande, quand un écran a réellement besoin de faire lire.

export const dynamic = 'force-dynamic'

const META_COLUMNS = `
  id, slug, title_fr, title_en, summary_fr, summary_en,
  version, effective_on, updated_at,
  requires_consent, consent_group, consent_label_fr, consent_label_en,
  scroll_gate, in_footer, sort_order
`

export async function GET(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  const withBody = new URL(request.url).searchParams.get('body') === '1'
  const columns  = withBody ? `${META_COLUMNS}, body_fr, body_en` : META_COLUMNS

  const [docsRes, settingsRes] = await Promise.all([
    supabase
      .from('legal_documents')
      .select(columns)
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('legal_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (docsRes.error) {
    return Response.json({ error: docsRes.error.message }, { status: 500 })
  }

  return Response.json(
    { documents: docsRes.data || [], settings: settingsRes.data || null },
    {
      headers: {
        // Une modification faite dans l'admin doit se voir vite, sans que
        // chaque visiteur rejoue la requête : trente secondes de cache
        // partagé, puis service du contenu périmé le temps de rafraîchir.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    }
  )
}
