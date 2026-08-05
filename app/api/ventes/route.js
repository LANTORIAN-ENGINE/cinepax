import { reglagesVente } from '@/lib/ventesServeur'

// Réglages de vente en ligne — lecture publique.
//
//   GET /api/ventes → { cutoffMinutes, hideInProgramme }
//
// Le tunnel d'achat et le programme de la semaine lisent ce délai pour
// savoir quelles séances montrer. C'est un nombre de minutes : rien de
// confidentiel, et la réponse se met en cache. Trente secondes de cache
// partagé — le même compromis que /api/legal : un changement fait dans
// l'administration se voit vite, sans que chaque visiteur rejoue la
// requête.
//
// La règle n'est pas appliquée ici : l'affichage la calcule seconde par
// seconde côté client (une séance se referme pendant qu'on regarde la
// page), et les routes d'écriture la revérifient sur l'horaire Veezi.

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await reglagesVente()

  return Response.json(settings, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
    },
  })
}
