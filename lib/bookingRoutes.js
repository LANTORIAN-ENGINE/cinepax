// Traduction entre l'état du tunnel de réservation et l'URL.
//
// Le tunnel reste une seule application cliente : on ne navigue pas d'une route
// Next à l'autre (cela remonterait le composant et rejouerait les appels Veezi).
// On écrit l'URL nous-mêmes avec history.pushState, et ce module est la seule
// source de vérité sur la forme de ces adresses — dans les deux sens :
//
//   état  → URL   bookingPath()      (à chaque changement d'étape)
//   URL   → état  parseBookingPath() (retour navigateur, lien partagé, F5)
//
// Les routes serveur correspondantes existent sous app/film/… : sans elles,
// un rechargement ou un lien collé renverrait un 404.

export const BOOKING_STEPS = ['films', 'sessions', 'seats', 'payment', 'done']

// Segment final propre à chaque étape, sous la séance.
const STEP_SEGMENT = { payment: 'paiement', done: 'confirmation' }
const SEGMENT_STEP = { paiement: 'payment', confirmation: 'done' }

// « Dune : Deuxième partie » → « dune-deuxieme-partie »
export function slugify(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

// Identifiant d'URL d'un film : slug lisible + identifiant Veezi en suffixe.
// Le slug n'est là que pour l'humain et les moteurs ; seul l'id fait foi. Les
// identifiants Veezi ne sont pas numériques (« ST00005388 ») : on les passe en
// minuscules pour garder des adresses d'une seule casse.
export function filmParam(film) {
  const id = String(film?.Id ?? '').toLowerCase()
  const slug = slugify(film?.Title)
  return slug ? `${slug}-${id}` : id
}

// Retrouve un film à partir du segment d'URL. On tente d'abord la
// correspondance exacte (slug + id), puis l'id seul en suffixe : ainsi un lien
// partagé reste valide même si le titre du film change côté Veezi.
export function findFilmByParam(films, param) {
  if (!param || !films?.length) return null
  const raw = decodeURIComponent(String(param)).toLowerCase()
  const exact = films.find(f => filmParam(f) === raw)
  if (exact) return exact
  return films.find(f => {
    const id = String(f.Id ?? '').toLowerCase()
    return id && (raw === id || raw.endsWith(`-${id}`))
  }) ?? null
}

// Chemin canonique d'une étape. `film` et `session` sont ceux réellement
// sélectionnés : si l'un manque, on retombe sur l'étape la plus profonde
// que l'URL peut encore décrire.
export function bookingPath(step, film, session) {
  if (step === 'films' || !film) return '/'
  const base = `/film/${filmParam(film)}`
  if (step === 'sessions' || !session) return base
  const seance = `${base}/seance/${encodeURIComponent(String(session.Id))}`
  const segment = STEP_SEGMENT[step]
  return segment ? `${seance}/${segment}` : seance
}

// Lecture inverse : /film/dune-1234/seance/5678/paiement
//   → { step: 'payment', filmParam: 'dune-1234', sessionId: '5678' }
export function parseBookingPath(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean)
  if (parts[0] !== 'film' || !parts[1]) return { step: 'films' }
  const route = { step: 'sessions', filmParam: parts[1] }
  if (parts[2] !== 'seance' || !parts[3]) return route
  route.sessionId = decodeURIComponent(parts[3])
  route.step = SEGMENT_STEP[parts[4]] ?? 'seats'
  return route
}

// ─── Filtres de l'accueil ─────────────────────────────────────────────────────
// La date et les tris ne changent pas d'étape : ils vivent en query string, et
// s'écrivent en replaceState pour ne pas remplir l'historique à chaque clic.

const HOME_DEFAULTS = { groupBy: 'jour', sortBy: 'heure' }

export function homeQuery({ selectedDay, groupBy, sortBy }) {
  const params = new URLSearchParams()
  if (selectedDay) params.set('jour', selectedDay)
  if (groupBy && groupBy !== HOME_DEFAULTS.groupBy) params.set('groupe', groupBy)
  if (sortBy && sortBy !== HOME_DEFAULTS.sortBy) params.set('tri', sortBy)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function parseHomeQuery(search) {
  const params = new URLSearchParams(search || '')
  const jour = params.get('jour')
  const groupe = params.get('groupe')
  const tri = params.get('tri')
  return {
    selectedDay: /^\d{4}-\d{2}-\d{2}$/.test(jour ?? '') ? jour : null,
    groupBy: groupe === 'film' || groupe === 'jour' ? groupe : null,
    sortBy: ['heure', 'alpha', 'recent'].includes(tri) ? tri : null,
  }
}
