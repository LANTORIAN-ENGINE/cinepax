// Fermeture de la vente en ligne avant la séance.
//
// Une séance ouverte à la vente dans Veezi le reste jusqu'à son horaire
// exact. Le cinéma veut refermer la vente en ligne un peu avant — le temps
// qu'un client arrive, retire son billet et s'installe. Le délai est un
// réglage unique, en minutes, valable pour toutes les séances
// (/admin/parametres → table sales_settings).
//
// Ce module ne contient que le vocabulaire partagé : les mêmes règles
// servent au tunnel d'achat (client), aux routes d'écriture (serveur) et à
// l'écran d'administration. Aucune dépendance — il s'importe des deux côtés.

export const CUTOFF_MIN = 0
export const CUTOFF_MAX = 1440   // 24 h : au-delà, ce n'est plus une fermeture

// Valeur de repli quand le réglage n'est pas lisible (Supabase absent ou
// injoignable). Zéro = comportement d'avant, vente jusqu'à l'horaire : une
// panne de base ne doit pas fermer la billetterie d'elle-même.
export const CUTOFF_FALLBACK = 0

export const DEFAULTS = {
  cutoffMinutes:   CUTOFF_FALLBACK,
  hideInProgramme: false,
}

// Paliers proposés dans l'administration. Un cinéma raisonne en quarts
// d'heure, pas en minutes : ces boutons couvrent l'essentiel des cas et
// évitent d'avoir à taper un nombre.
export const CUTOFF_PRESETS = [0, 15, 30, 45, 60, 90, 120]

// Ramène n'importe quelle entrée à un entier de minutes dans les bornes.
//
// Le champ vidé mérite un mot : `Number('')` vaut zéro, pas NaN. Sans ce
// premier test, effacer le champ pour retaper « 45 » ferait passer le
// réglage par « aucun délai » sous les yeux de l'administrateur. Une case
// vide n'est pas une valeur — c'est l'absence de valeur, donc le repli.
export function normalizeCutoff(value, fallback = CUTOFF_FALLBACK) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(CUTOFF_MAX, Math.max(CUTOFF_MIN, n))
}

// Instant où la vente en ligne se referme, en millisecondes epoch.
// `null` si l'horaire de séance est illisible.
//
// `new Date(null)` ne vaut pas une date invalide mais le 1er janvier 1970 :
// une séance sans horaire passerait pour vieille d'un demi-siècle, donc
// refermée. C'est exactement l'inverse de la règle qu'on veut (au doute,
// on vend). D'où le test explicite avant la conversion.
export function saleClosesAt(startIso, cutoffMinutes) {
  if (startIso === null || startIso === undefined || startIso === '') return null
  const start = new Date(startIso).getTime()
  if (!Number.isFinite(start)) return null
  return start - normalizeCutoff(cutoffMinutes) * 60_000
}

// La séance est-elle encore achetable en ligne ?
//
// L'égalité stricte est voulue : avec un délai de 60 minutes, une séance
// qui commence dans exactement 60 minutes est déjà refermée — « d'ici une
// heure » inclut l'heure pile. Un horaire illisible reste ouvert : c'est
// une donnée Veezi douteuse, pas une raison de refuser la vente.
export function isSaleOpen(startIso, cutoffMinutes, now = Date.now()) {
  const closesAt = saleClosesAt(startIso, cutoffMinutes)
  if (closesAt === null) return true
  return now < closesAt
}

// Minutes restantes avant la fermeture — négatif une fois refermée.
// Sert à l'aperçu de l'administration (« ferme dans 12 min »).
export function minutesUntilClose(startIso, cutoffMinutes, now = Date.now()) {
  const closesAt = saleClosesAt(startIso, cutoffMinutes)
  if (closesAt === null) return null
  return Math.round((closesAt - now) / 60_000)
}

// Sépare une liste de séances en deux, sans en perdre aucune.
//
// Le tunnel a besoin des deux moitiés : `open` alimente les listes
// d'horaires, `closed` reste connue pour qu'un lien partagé vers une
// séance refermée puisse l'expliquer plutôt que renvoyer une page vide.
//
// `startOf` lit l'horaire de début — les séances Veezi le portent sous
// trois noms selon la grille (voir sessionStart / debutSeance).
export function splitSessions(sessions, startOf, cutoffMinutes, now = Date.now()) {
  const open = []
  const closed = []
  for (const s of sessions || []) {
    (isSaleOpen(startOf(s), cutoffMinutes, now) ? open : closed).push(s)
  }
  return { open, closed }
}

// Projection d'une ligne sales_settings vers la forme servie au front.
// Une ligne absente vaut les valeurs par défaut : le site marche avant même
// que la migration soit passée.
export function readSettings(row) {
  if (!row) return { ...DEFAULTS }
  return {
    cutoffMinutes:   normalizeCutoff(row.cutoff_minutes),
    hideInProgramme: row.hide_in_programme === true,
  }
}
