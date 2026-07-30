// Données du programme de la semaine, partagées entre la page HTML
// (/api/programme) et l'affiche générée (/api/programme/affiche).
//
// cinepax.mg publie son programme sous forme d'un JPEG 1080×1920 déposé à la
// main dans son CMS. Aucune API ne le renvoie, et il se périme chaque semaine —
// celui en ligne au 30/07/2026 couvre encore « du 24 au 30 juillet ».
// Toute son information est en revanche dans /v1/session croisé avec /v4/film :
// on la reconstruit, et l'affiche se régénère seule.

const VEEZI = 'https://api.eu.veezi.com'
export const TZ = 'Etc/GMT-3'   // Madagascar, UTC+3

export const WEEKDAYS_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']

async function veezi(path, revalidate) {
  const res = await fetch(`${VEEZI}${path}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`Veezi ${path} → ${res.status}`)
  return res.json()
}

export function sessionStart(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

// Titre sans les suffixes de version, pour regrouper VF / VO / 3D sous une
// seule entrée — leur affiche fait de même, les versions devenant des mentions
// à côté de l'horaire plutôt que des films distincts.
export function baseTitle(title = '') {
  return title
    .replace(/\b(3D|2D|IMAX|VF|VO|VOST(?:FR)?|SOUS-TITR\S*)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Mention de version déduite du titre : c'est là que Veezi la porte.
export function versionOf(title = '') {
  const t = title.toUpperCase()
  const is3D = /\b3D\b/.test(t)
  if (/\bVOST/.test(t) || /\bVO\b/.test(t)) return is3D ? 'VOST 3D' : 'VOST'
  if (/\bVF\b/.test(t)) return is3D ? 'VF 3D' : 'VF'
  return is3D ? '3D' : ''
}

export function localParts(iso) {
  const d = new Date(iso)
  // Jour et heure exprimés à l'heure de Madagascar, pas celle du serveur.
  const local = new Date(d.toLocaleString('en-US', { timeZone: TZ }))
  return {
    weekday: local.getDay(),
    hh: String(local.getHours()).padStart(2, '0'),
    mm: String(local.getMinutes()).padStart(2, '0'),
    dateKey: d.toLocaleDateString('en-CA', { timeZone: TZ }),
  }
}

// Séances à venir sur `days` jours, jointes à leur film.
export async function fetchProgramme({ days = 7, revalidate = 600 } = {}) {
  const [filmsRaw, sessionsRaw] = await Promise.all([
    veezi('/v4/film', revalidate),
    veezi('/v1/session', revalidate),
  ])

  const films    = Array.isArray(filmsRaw) ? filmsRaw : [filmsRaw]
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [sessionsRaw]
  const filmById = new Map(films.map(f => [String(f.Id), f]))

  const now   = new Date()
  const limit = new Date(now.getTime() + days * 24 * 3600 * 1000)

  const upcoming = sessions
    .filter(s => {
      const start = sessionStart(s)
      if (!start) return false
      const d = new Date(start)
      return d > now && d <= limit
    })
    .sort((a, b) => new Date(sessionStart(a)) - new Date(sessionStart(b)))

  return { films, filmById, sessions: upcoming, from: now, to: limit }
}

// Regroupe les séances par film, puis par (heure + version) avec la liste des
// jours concernés — la forme même de l'affiche : « Sam. Dim. · 10h45 · VF ».
export function groupForPoster({ filmById, sessions }) {
  const byFilm = new Map()

  for (const s of sessions) {
    const film = filmById.get(String(s.FilmId))
    if (!film) continue

    const key = baseTitle(film.Title).toUpperCase()
    if (!byFilm.has(key)) {
      byFilm.set(key, {
        title: baseTitle(film.Title),
        poster: film.FilmPosterUrl || film.FilmPosterThumbnailUrl || null,
        rating: film.Rating || null,
        advisory: film.Content || null,
        slots: new Map(),
        count: 0,
      })
    }

    const entry = byFilm.get(key)
    entry.count++

    const { weekday, hh, mm } = localParts(sessionStart(s))
    const version = versionOf(film.Title)
    const slotKey = `${hh}h${mm}|${version}`

    if (!entry.slots.has(slotKey)) {
      entry.slots.set(slotKey, { time: `${hh}h${mm}`, version, days: new Set() })
    }
    entry.slots.get(slotKey).days.add(weekday)
  }

  return [...byFilm.values()]
    .map(f => ({
      ...f,
      // Trié par nombre de jours couverts : l'affiche n'a la place que pour
      // quelques créneaux, autant montrer ceux qui valent pour toute la
      // semaine plutôt que les plus matinaux. À égalité, par heure.
      slots: [...f.slots.values()]
        .sort((a, b) => (b.days.size - a.days.size) || a.time.localeCompare(b.time))
        .map(s => ({
          ...s,
          // Semaine de cinéma : elle commence le vendredi, comme les sorties.
          days: [...s.days]
            .sort((a, b) => ((a + 2) % 7) - ((b + 2) % 7))
            .map(i => WEEKDAYS_SHORT[i]),
        })),
    }))
    .sort((a, b) => b.count - a.count)
}

// Bornes de la semaine couverte, pour le sous-titre de l'affiche.
export function weekRange(sessions, locale = 'fr-FR') {
  if (!sessions.length) return null
  const fmt = iso => new Date(iso).toLocaleDateString(locale, {
    timeZone: TZ, weekday: 'short', day: 'numeric',
  })
  const month = iso => new Date(iso).toLocaleDateString(locale, { timeZone: TZ, month: 'long' })
  const first = sessionStart(sessions[0])
  const last  = sessionStart(sessions[sessions.length - 1])
  return `du ${fmt(first)} au ${fmt(last)} ${month(last)}`
}
