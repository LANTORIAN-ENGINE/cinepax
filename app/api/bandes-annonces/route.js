import { bandesAnnonces } from '@/lib/bandesAnnoncesServeur'

// Bandes annonces posées par le cinéma — lecture publique.
//
//   GET /api/bandes-annonces → { trailers: [ … ] }
//
// Le carrousel d'accueil et la fiche film en ont besoin au premier rendu :
// c'est ce qui décide si la slide joue un fichier du cinéma ou le lien
// YouTube du distributeur. Rien de confidentiel — des identifiants de films
// et des adresses de vidéos publiques — et la réponse se met en cache.
//
// Soixante secondes de cache partagé : un dépôt fait dans l'administration
// se voit sur le site dans la minute, sans que chaque visiteur rejoue la
// requête. La route d'administration vide le mémo serveur à l'écriture.
//
// Un échec ici n'empêche rien : le tunnel traite l'absence de réponse comme
// une absence de bande annonce importée et retombe sur Veezi.

export const dynamic = 'force-dynamic'

export async function GET() {
  const lignes = await bandesAnnonces()

  // Seuls les champs qui servent à jouer la vidéo. Le chemin dans le bucket,
  // le poids et le nom du fichier d'origine restent côté administration.
  const trailers = lignes.map(l => ({
    filmId:   l.filmId,
    titleKey: l.titleKey,
    videoUrl: l.videoUrl,
    videoMime: l.videoMime,
    duration: l.duration,
    youtubeUrl: l.youtubeUrl,
    versions: l.versions,
    enabled:  l.enabled,
  }))

  return Response.json({ trailers }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
