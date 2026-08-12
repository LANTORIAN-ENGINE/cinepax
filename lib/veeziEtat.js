// ─────────────────────────────────────────────────────────────────────────────
//  Ce que /api/veezi/reserve répond, traduit en un seul mot d'état.
//
//  Les deux écrans de fin de parcours — la confirmation du tunnel
//  (Orange / MVola) et le retour de la banque (carte BNI) — lisent la même
//  réponse et doivent en dire la même chose. Le vocabulaire vit donc ici.
//
//  Règle : tout ce qui n'est pas une place enregistrée au cinéma est un ÉCHEC,
//  jamais un « en cours ». Rien ne reprend l'appel derrière — ni relance, ni
//  tâche planifiée — donc une attente affichée serait une attente sans fin, et
//  le client repartirait en croyant sa place tenue.
// ─────────────────────────────────────────────────────────────────────────────

export const ATTENTE      = 'attente'       // l'appel est parti, on attend
export const RESERVE      = 'reserve'       // place tenue au cinéma
export const HORS_LIGNE   = 'horsLigne'     // séance non ouverte à la vente en ligne côté Veezi
export const SIEGES_PRIS  = 'siegesPris'    // les places sont parties en salle entre-temps
export const ECHEC        = 'echec'         // refus Veezi, réseau, configuration…

// Les trois états où le client repart sans place enregistrée : il lui reste une
// démarche à faire à l'accueil, et l'écran doit le dire au lieu de le féliciter.
const MANQUES = new Set([HORS_LIGNE, SIEGES_PRIS, ECHEC])

export function placeManquante(etat) {
  return MANQUES.has(etat)
}

// `reponse` : le JSON de /api/veezi/reserve, quel que soit son code HTTP —
// la route répond toujours en JSON, y compris sur 409, 502 et 503.
export function lireReponseReservation(reponse) {
  if (!reponse || typeof reponse !== 'object') return { etat: ECHEC }

  if (reponse.veeziBookingNumber) {
    return { etat: RESERVE, numero: String(reponse.veeziBookingNumber) }
  }
  // Réservée sans numéro renvoyé : la place est prise, il n'y a rien à afficher
  // à côté. Cas de figure rare mais réussi — surtout ne pas le compter en échec.
  if (reponse.ok === true) return { etat: RESERVE, numero: null }

  if (reponse.skipped) return { etat: HORS_LIGNE }
  if (reponse.step === 'availability') {
    return { etat: SIEGES_PRIS, sieges: reponse.unavailableSeats ?? [] }
  }
  return { etat: ECHEC }
}

// Le texte à afficher sous le titre, selon l'état. Les libellés vivent dans
// le dictionnaire partagé `veezi.*` — mêmes mots sur les deux écrans.
export function texteManque(etat, sieges, t) {
  if (etat === SIEGES_PRIS) {
    return t('veezi.seatsText', { seats: (sieges || []).join(', ') })
  }
  if (etat === HORS_LIGNE) return t('veezi.offText')
  return t('veezi.failText')
}
