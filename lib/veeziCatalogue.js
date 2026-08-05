// ─── Accès au catalogue Veezi côté serveur ────────────────────────────────────
// La résolution d'un synopsis a besoin du catalogue entier, pas seulement des
// fiches demandées : c'est en parcourant les fiches sœurs (VF, VO, 3D d'une
// même œuvre) qu'on trouve le texte déjà rédigé dans la langue voulue.
//
// Or /v4/film pèse 5,7 Mo, au-delà des 2 Mo que le cache de données de Next.js
// accepte de garder — il refuse l'entrée en le disant dans les logs :
//
//   Failed to set Next.js data cache … items over 2MB can not be cached
//
// Sans mémo, chaque affichage retéléchargerait donc les 5,7 Mo. On garde plutôt
// en mémoire du processus une projection des seuls champs utiles à la
// traduction — 1,4 Mo, et surtout une seule fois par instance et par fenêtre de
// dix minutes. Les séances (84 Ko) passent, elles, par le cache de Next.

const VEEZI = 'https://api.eu.veezi.com'

export const revalidate = 600

const TTL_MS = revalidate * 1000

async function veezi(chemin, init) {
  if (!process.env.VEEZI_TOKEN) throw new Error('VEEZI_TOKEN env var is not set')
  const res = await fetch(`${VEEZI}${chemin}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    ...init,
  })
  if (!res.ok) throw new Error(`Veezi ${chemin} → ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

// Seuls champs nécessaires : identifier la fiche, la rattacher à son œuvre
// (titre, mais aussi date et durée, qui départagent deux films homonymes),
// lire son synopsis, et savoir si elle est à venir (pour le préchauffage).
function projeter(film) {
  return {
    Id:            film.Id,
    Title:         film.Title,
    Synopsis:      film.Synopsis,
    ShortSynopsis: film.ShortSynopsis,
    OpeningDate:   film.OpeningDate,
    Duration:      film.Duration,
  }
}

let memo    = null   // { at, films }
let enCours = null   // téléchargement partagé : deux requêtes simultanées n'en font qu'un

export async function catalogueVeezi() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.films
  if (enCours) return enCours

  enCours = (async () => {
    try {
      // `no-store` : inutile de proposer 5,7 Mo à un cache qui les refusera.
      const brut  = await veezi('/v4/film', { cache: 'no-store' })
      const films = brut.map(projeter)
      memo = { at: Date.now(), films }
      return films
    } catch (err) {
      // Un catalogue périmé vaut mieux que pas de catalogue : le synopsis
      // affiché reste juste, il ignore seulement les toutes dernières fiches.
      if (memo) return memo.films
      throw err
    } finally {
      enCours = null
    }
  })()

  return enCours
}

export function sessionsVeezi() {
  return veezi('/v1/session', { next: { revalidate } })
}

export function debutSeance(s) {
  return s?.PreShowStartTime || s?.FeatureStartTime || s?.ShowTime
}
