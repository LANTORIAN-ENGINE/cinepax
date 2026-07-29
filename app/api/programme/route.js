// Programme de la semaine, reconstitué depuis Veezi.
//
// cinepax.mg publie le programme sous forme d'une affiche JPEG déposée chaque
// semaine dans son CMS — rien qu'aucune API ne renvoie, et qui se périme dès
// la semaine suivante. Toute son information est en revanche dans /v1/session
// croisé avec /v4/film, donc on la reconstruit ici : le programme reste juste
// sans que personne ait à redéposer une image.
//
// Filtrage côté serveur : le catalogue /v4/film pèse ~5,5 Mo.

const VEEZI = 'https://api.eu.veezi.com'
const TZ = 'Etc/GMT-3'   // Madagascar, UTC+3
const DAYS = 7

export const revalidate = 600

async function veezi(path) {
  const res = await fetch(`${VEEZI}${path}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`Veezi ${path} → ${res.status}`)
  return res.json()
}

function sessionStart(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

export async function GET() {
  if (!process.env.VEEZI_TOKEN) {
    return Response.json({ error: 'VEEZI_TOKEN env var is not set' }, { status: 500 })
  }

  try {
    const [filmsRaw, sessionsRaw] = await Promise.all([
      veezi('/v4/film'),
      veezi('/v1/session'),
    ])

    const films    = Array.isArray(filmsRaw) ? filmsRaw : [filmsRaw]
    const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [sessionsRaw]
    const filmById = new Map(films.map(f => [String(f.Id), f]))

    const now   = new Date()
    const limit = new Date(now.getTime() + DAYS * 24 * 3600 * 1000)

    const upcoming = sessions
      .filter(s => {
        const start = sessionStart(s)
        if (!start) return false
        const d = new Date(start)
        return d > now && d <= limit
      })
      .sort((a, b) => new Date(sessionStart(a)) - new Date(sessionStart(b)))

    // Regroupement jour → film → séances
    const byDay = new Map()
    for (const s of upcoming) {
      const start = sessionStart(s)
      const key   = dayKey(start)
      if (!byDay.has(key)) byDay.set(key, new Map())

      const dayFilms = byDay.get(key)
      const filmId   = String(s.FilmId)
      const film     = filmById.get(filmId)

      if (!dayFilms.has(filmId)) {
        dayFilms.set(filmId, {
          filmId,
          title: film?.Title || s.Title || 'Séance',
          poster: film?.FilmPosterUrl || film?.FilmPosterThumbnailUrl || null,
          duration: film?.Duration || null,
          rating: film?.Rating || null,
          genre: film?.Genre?.trim() || null,
          sessions: [],
        })
      }

      dayFilms.get(filmId).sessions.push({
        id: s.Id,
        start,
        screenId: s.ScreenId,
        format: s.FilmFormat || null,
        audio: s.AudioLanguage || null,
        // La grille tarifaire appliquée (MARDI, WEEK_END, JEUDI…) : c'est ce
        // qui relie une séance aux tarifs affichés sur « Nos offres ».
        priceCard: s.PriceCardName || null,
        seatsAvailable: s.SeatsAvailable ?? null,
        soldOut: s.TicketsSoldOut === true,
      })
    }

    const days = [...byDay.entries()].map(([date, filmsMap]) => ({
      date,
      films: [...filmsMap.values()],
    }))

    return Response.json({
      generatedAt: new Date().toISOString(),
      days,
      totalSessions: upcoming.length,
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
