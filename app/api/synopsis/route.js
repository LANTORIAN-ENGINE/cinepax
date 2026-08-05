// Synopsis dans la langue affichée.
//
// Le client envoie les identifiants Veezi des films qu'il affiche et la langue
// courante ; la route rend le meilleur texte disponible immédiatement. Elle ne
// traduit jamais pendant que le visiteur attend : ce qui manque part en tâche
// de fond via `after()`, et sera en cache au prochain affichage.
//
// Réponse : { synopsis: { "<filmId>": { texte, langue, auto } } }
//   langue — celle du texte rendu, qui peut différer de la langue demandée
//            tant que la traduction n'est pas prête (repli assumé) ;
//   auto   — vrai si le texte vient d'une traduction automatique.

import { after } from 'next/server'
import { catalogueVeezi } from '@/lib/veeziCatalogue'
import { resoudreSynopsis, traduireLot } from '@/lib/traduction'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Au-delà, c'est que l'appelant demande le catalogue entier : on borne.
const MAX_IDS = 60

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const cible = searchParams.get('lang') === 'en' ? 'en' : 'fr'
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS)

  if (!ids.length) return Response.json({ synopsis: {} })

  try {
    const catalogue = await catalogueVeezi()
    const parId  = new Map(catalogue.map(f => [String(f.Id), f]))
    const vises  = ids.map(id => parId.get(id)).filter(Boolean)

    const { synopsis, enAttente } = await resoudreSynopsis(catalogue, vises, cible)

    // Hors du chemin de réponse : le visiteur ne l'attend pas.
    if (enAttente.length) {
      after(() => traduireLot(enAttente, cible, { max: 5, delaiMs: 3000 }))
    }

    return Response.json(
      { synopsis: Object.fromEntries(synopsis) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    // Le client garde les synopsis bruts reçus de Veezi : une panne ici
    // n'enlève rien à ce qui est déjà affiché.
    return Response.json({ synopsis: {}, error: err.message }, { status: 200 })
  }
}
