import { createServiceClient } from '@/lib/supabase'

// Un document légal, corps compris — lecture publique.
//
//   GET /api/legal/cgv              la version en vigueur
//   GET /api/legal/cgv?version=2    une version archivée
//
// La lecture d'une version archivée n'est pas un luxe : un client qui
// conteste une vente a accepté un texte daté, et c'est celui-là qu'il doit
// pouvoir relire — pas celui d'aujourd'hui.

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { slug } = await params

  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  const { data: doc, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (error)  return Response.json({ error: error.message }, { status: 500 })
  if (!doc)   return Response.json({ error: 'not_found' }, { status: 404 })

  const asked = Number(new URL(request.url).searchParams.get('version'))

  // Version demandée = version en vigueur : inutile d'aller chercher
  // l'archive, la table principale porte déjà le texte.
  if (Number.isInteger(asked) && asked > 0 && asked !== doc.version) {
    const { data: revision } = await supabase
      .from('legal_document_revisions')
      .select('version, title_fr, title_en, body_fr, body_en, published_at')
      .eq('slug', slug)
      .eq('version', asked)
      .maybeSingle()

    if (!revision) return Response.json({ error: 'version_not_found' }, { status: 404 })

    return Response.json({
      document: {
        ...doc,
        ...revision,
        // Une archive n'est pas le texte en vigueur : la page doit le dire
        // au lecteur au lieu de la présenter comme la règle du jour.
        is_archived:     true,
        current_version: doc.version,
      },
    })
  }

  return Response.json(
    { document: doc },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } }
  )
}
