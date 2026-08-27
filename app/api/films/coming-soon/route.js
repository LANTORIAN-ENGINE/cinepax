// Films à venir, dérivés du catalogue Veezi.
//
// Veezi n'expose pas d'endpoint « coming soon » : on le reconstitue à partir de
// /v4/film (champ OpeningDate) croisé avec /v1/session. Le catalogue complet
// pèse ~4 Mo, d'où ce filtrage côté serveur — le client ne reçoit que la
// vingtaine de films concernés.

import { after } from 'next/server'
import { resoudreSynopsis, traduireLot } from '@/lib/traduction'

const VEEZI = 'https://api.eu.veezi.com'

// Veezi utilise 9999-12-31 comme « date de sortie non fixée ».
const NO_DATE_SENTINEL = '9999'

export const revalidate = 3600

// Titre sans les suffixes de version (VF / VO / 3D…), pour regrouper les
// déclinaisons d'une même œuvre.
function baseTitle(title = '') {
  return title
    .replace(/\b(3D|2D|IMAX|VF|VO|VOST(?:FR)?|SOUS-TITR\S*)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function person(people, role) {
  return (people || [])
    .filter(p => p.Role === role)
    .map(p => [p.FirstName, p.LastName].filter(Boolean).join(' '))
    .filter(Boolean)
}

async function veezi(path) {
  const res = await fetch(`${VEEZI}${path}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`Veezi ${path} → ${res.status}`)
  return res.json()
}

export async function GET(request) {
  if (!process.env.VEEZI_TOKEN) {
    return Response.json({ error: 'VEEZI_TOKEN env var is not set' }, { status: 500 })
  }

  const cible = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'fr'

  try {
    const [filmsRaw, sessionsRaw] = await Promise.all([
      veezi('/v4/film'),
      veezi('/v1/session'),
    ])

    const films    = Array.isArray(filmsRaw) ? filmsRaw : [filmsRaw]
    const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [sessionsRaw]

    const now = new Date()

    // Titres dont des séances sont déjà programmées : leurs billets sont en
    // vente, même si la sortie officielle n'a pas encore eu lieu (avant-première).
    const onSaleTitles = new Set()
    const filmById = new Map(films.map(f => [String(f.Id), f]))
    for (const s of sessions) {
      const start = s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
      if (!start || new Date(start) <= now) continue
      const film = filmById.get(String(s.FilmId))
      if (film) onSaleTitles.add(baseTitle(film.Title))
    }

    const upcoming = films.filter(f => {
      if (!f.OpeningDate || f.OpeningDate.startsWith(NO_DATE_SENTINEL)) return false
      return new Date(f.OpeningDate) > now
    })

    // Une seule carte par œuvre : on garde la déclinaison la mieux renseignée.
    const byTitle = new Map()
    for (const f of upcoming) {
      const key = baseTitle(f.Title)
      const score = (f.FilmPosterUrl ? 4 : 0) + (f.BackdropImageUrl ? 2 : 0) + (f.Synopsis ? 1 : 0)
      const current = byTitle.get(key)
      if (!current || score > current.score) byTitle.set(key, { film: f, score })
    }

    // Synopsis dans la langue demandée : texte de la fiche sœur VF/VO quand il
    // existe, traduction en cache sinon. Ce qui manque part en tâche de fond.
    const retenus = [...byTitle.values()].map(({ film }) => film)
    const { synopsis, enAttente } = await resoudreSynopsis(films, retenus, cible)
    if (enAttente.length) {
      after(() => traduireLot(enAttente, cible, { max: 5, delaiMs: 3000 }))
    }

    const result = [...byTitle.values()]
      .map(({ film }) => ({
        id: film.Id,
        title: film.Title,
        openingDate: film.OpeningDate,
        poster: film.FilmPosterUrl || film.FilmPosterThumbnailUrl || null,
        backdrop: film.BackdropImageUrl || null,
        // Lien du distributeur. La bande annonce déposée par le cinéma, elle,
        // est résolue dans le navigateur (/api/bandes-annonces) : cette
        // réponse-ci reste une heure en cache, et un dépôt fait à l'instant
        // n'attendrait pas une heure pour paraître.
        trailerUrl: film.FilmTrailerUrl || null,
        // Synopsis brut : la mise en forme est interprétée à l'affichage.
        synopsis: synopsis.get(String(film.Id))?.texte || film.Synopsis || film.ShortSynopsis || null,
        // Langue réelle du texte rendu : elle peut encore différer de `cible`
        // le temps que la traduction se fasse. L'attribut lang du bloc en dépend.
        synopsisLang: synopsis.get(String(film.Id))?.langue || null,
        genre: film.Genre?.trim() || null,
        rating: film.Rating || null,
        duration: film.Duration || null,
        distributor: film.Distributor || null,
        director: person(film.People, 'Director').join(', ') || null,
        cast: person(film.People, 'Actor').slice(0, 4).join(', ') || null,
        onSale: onSaleTitles.has(baseTitle(film.Title)),
      }))
      .sort((a, b) => new Date(a.openingDate) - new Date(b.openingDate))

    return Response.json({ films: result })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
