// Normalisation des URL d'images renvoyées par Veezi.
//
// Trois cas :
//   1. CDN Veezi (cdn.eu.veezi.com) → utilisable directement
//   2. URL relative malformée (https:///…) → rebasée sur cinepax.mg
//   3. Autres URL cinepax.mg → proxifiées via /api/image (SSRF protégé)

export function fixImageUrl(url) {
  if (!url) return null
  if (url.startsWith('https://cdn.eu.veezi.com/')) return url
  const fixed = url.replace(/^https?:\/\/\//, 'https://www.cinepax.mg/')
  return `/api/image?url=${encodeURIComponent(fixed)}`
}

export function filmPoster(film) {
  return fixImageUrl(film?.FilmPosterUrl || film?.FilmPosterThumbnailUrl)
}

export function filmBackdrop(film) {
  return fixImageUrl(film?.BackdropImageUrl || film?.FilmPosterUrl)
}
