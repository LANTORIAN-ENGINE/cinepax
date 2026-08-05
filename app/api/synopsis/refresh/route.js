// Préchauffage quotidien des traductions de synopsis.
//
// Déclenché par le cron Vercel déclaré dans vercel.json. Il traduit à l'avance
// ce que les visiteurs vont lire — l'affiche et les films à venir — pour que
// personne ne tombe sur un texte encore dans l'autre langue.
//
// Le rythme réel du catalogue est d'environ 14 nouvelles œuvres par mois. Le
// plafond ci-dessous — 3 traductions par langue, espacées de 7 secondes — tient
// dans les deux contraintes du passage : rester sous la limite par minute du
// palier gratuit Gemini (6 appels en ~40 s, soit 9 par minute) et sous la durée
// maximale d'une fonction. Cela fait 180 traductions par mois, largement au-delà
// du besoin ; l'essentiel se fait de toute façon à la volée, au fil des visites.

import { catalogueVeezi, sessionsVeezi, debutSeance } from '@/lib/veeziCatalogue'
import { resoudreSynopsis, traduireLot } from '@/lib/traduction'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LANGUES = ['fr', 'en']

// Veezi utilise 9999-12-31 comme « date de sortie non fixée ».
const SANS_DATE = '9999'

export async function GET(request) {
  // Vercel Cron signe ses appels avec CRON_SECRET. Sans secret configuré
  // (développement local), la route reste ouverte.
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const [catalogue, seances] = await Promise.all([catalogueVeezi(), sessionsVeezi()])
    const maintenant = new Date()

    // À l'affiche : toute fiche ayant une séance à venir.
    const aLAffiche = new Set(
      seances
        .filter(s => { const d = debutSeance(s); return d && new Date(d) > maintenant })
        .map(s => String(s.FilmId)),
    )

    const vises = catalogue.filter(f => {
      if (aLAffiche.has(String(f.Id))) return true
      if (!f.OpeningDate || f.OpeningDate.startsWith(SANS_DATE)) return false
      return new Date(f.OpeningDate) > maintenant
    })

    const bilan = {}
    for (const cible of LANGUES) {
      const { enAttente } = await resoudreSynopsis(catalogue, vises, cible)
      bilan[cible] = await traduireLot(enAttente, cible, { max: 3, delaiMs: 7000 })
    }

    return Response.json({ films: vises.length, bilan })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
