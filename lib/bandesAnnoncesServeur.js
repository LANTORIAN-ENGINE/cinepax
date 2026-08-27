import { createServiceClient } from '@/lib/supabase'
import { lireLigne, indexerBandesAnnonces, INDEX_VIDE } from '@/lib/bandesAnnonces'

// Lecture serveur de la table film_trailers.
//
// Deux routes s'en servent — la route publique que lit le tunnel d'achat, et
// la page Prochainement, qui résout ses bandes annonces côté serveur pour
// n'envoyer au navigateur que l'adresse à jouer. La table tient quelques
// dizaines de lignes et ne change qu'à la main : on la garde trente secondes
// en mémoire du processus plutôt que d'ouvrir une connexion par requête.
// Même compromis que lib/ventesServeur.js.
//
// Sans Supabase, ou si la table n'existe pas encore (migration non passée),
// on renvoie une liste vide : le site retombe sur les liens YouTube de Veezi,
// c'est-à-dire exactement le comportement d'avant.

const TTL_MS = 30_000

let memo = null   // { at, lignes }

export async function bandesAnnonces() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.lignes

  const supabase = createServiceClient()
  if (!supabase) return []

  try {
    // Les lignes désactivées font partie du lot, à dessein : une bande
    // annonce désactivée sur une fiche est une décision explicite, et elle
    // doit empêcher la fiche de récupérer celle d'une version sœur. C'est
    // bandeAnnonce() qui tranche, pas la requête.
    const { data, error } = await supabase
      .from('film_trailers')
      .select('*')

    // Table absente : pas de mémo — la migration doit prendre effet dès
    // qu'elle passe, sans attendre l'expiration d'un cache.
    if (error) return []

    const lignes = (data || []).map(lireLigne).filter(Boolean)
    memo = { at: Date.now(), lignes }
    return lignes
  } catch {
    // Supabase injoignable : une bande annonce n'est pas une raison de
    // rendre une erreur au visiteur. On sert ce qu'on avait, ou rien.
    return memo?.lignes || []
  }
}

// Index prêt à l'emploi pour bandeAnnonce().
export async function indexBandesAnnonces() {
  try {
    return indexerBandesAnnonces(await bandesAnnonces())
  } catch {
    return INDEX_VIDE
  }
}

// À appeler après une écriture dans l'administration : le site doit montrer
// la bande annonce déposée tout de suite, pas dans trente secondes.
export function oublierBandesAnnonces() {
  memo = null
}
