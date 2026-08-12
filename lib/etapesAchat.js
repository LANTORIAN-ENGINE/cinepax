// ─────────────────────────────────────────────────────────────────────────────
//  Les trois temps de la fin du parcours — le repère donné au client.
//
//  Une fois le bouton « Payer » cliqué, il reste trois choses à faire, dont
//  deux que le client ne voit pas venir :
//
//    1. paiement — la page de la banque : numéro de carte, code 3-D Secure,
//       puis le décompte de MIPS avant qu'elle nous rende la main ;
//    2. billet   — le retour sur le site : référence, QR code ;
//    3. place    — /api/veezi/reserve, l'enregistrement dans le système du
//       cinéma, seul moment où la place devient réellement tenue.
//
//  Rien ne reprend la 3 derrière (voir lib/veeziEtat.js) : un onglet fermé au
//  retour de la banque, et l'achat reste payé sans exister au cinéma. C'est
//  précisément pourquoi ces trois temps s'affichent — pour que personne ne
//  parte en croyant avoir fini à la fin du 1.
//
//  Ce module ne décrit que ce qui est déjà fait ailleurs. Il n'appelle rien,
//  ne décide de rien : il lit un état et le nomme.
// ─────────────────────────────────────────────────────────────────────────────

import { RESERVE, placeManquante } from './veeziEtat'

export const PAIEMENT = 'paiement'
export const BILLET   = 'billet'
export const PLACE    = 'place'

export const ETAPES = [PAIEMENT, BILLET, PLACE]

// État d'une étape, du point de vue du client.
export const A_VENIR  = 'aVenir'    // pas encore atteinte
export const EN_COURS = 'enCours'   // c'est ici que ça se passe, maintenant
export const FAITE    = 'faite'     // acquise
export const RATEE    = 'ratee'     // n'aboutira pas : il reste une démarche

// `courante` : l'étape où se trouve l'écran. `veeziEtat` : l'état renvoyé par
// lireReponseReservation(), qui seul distingue une place tenue d'une place à
// reprendre à l'accueil — les deux premières étapes, elles, sont acquises du
// seul fait qu'on affiche l'écran suivant.
export function etatsEtapes(courante, veeziEtat = null) {
  const rang = ETAPES.indexOf(courante)
  return ETAPES.map((etape, i) => {
    if (i < rang) return FAITE
    if (i > rang) return A_VENIR
    if (etape !== PLACE) return EN_COURS
    if (veeziEtat === RESERVE) return FAITE
    if (placeManquante(veeziEtat)) return RATEE
    return EN_COURS
  })
}

// Quelque chose tourne encore : c'est ce qui autorise à demander au client de
// rester. Une fois tout acquis — ou définitivement manqué — la phrase n'a plus
// lieu d'être, et une consigne qui reste affichée après coup n'est plus lue.
export function travailEnCours(etats) {
  return etats.includes(EN_COURS)
}
