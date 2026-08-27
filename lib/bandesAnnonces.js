// ─── Bandes annonces — vocabulaire commun ─────────────────────────────────────
//
// Une bande annonce peut venir de deux endroits, et le site doit dire la même
// chose des deux côtés — carrousel d'accueil, fiche film, page Prochainement,
// écran d'administration :
//
//   1. un fichier déposé par le cinéma dans /admin/bandes-annonces (table
//      film_trailers + bucket film-trailers) ;
//   2. à défaut, le lien YouTube saisi par le distributeur dans Veezi
//      (FilmTrailerUrl), qui reste le comportement par défaut.
//
// Rien à renseigner pour que le site marche : sans ligne en base, la
// résolution retombe sur Veezi, exactement comme avant cette fonctionnalité.
//
// Ce module est importable client *et* serveur : aucune dépendance à Supabase,
// aucune à React.

// ─── Formats acceptés ─────────────────────────────────────────────────────────
// Ce que les navigateurs lisent nativement. Le .mkv est volontairement absent :
// il se téléverse très bien et ne se lit nulle part.
//
// Le conteneur ne fait pas tout — un .mp4 en HEVC ou un .mov en ProRes passent
// le contrôle de type et restent noirs à l'écran. D'où la vérification de
// lecture faite par le navigateur au moment du dépôt (voir l'écran
// d'administration) : c'est la seule qui dise la vérité.
export const MIMES_VIDEO = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/ogg',
  'video/mpeg',
]

export const EXTENSIONS_VIDEO = ['.mp4', '.mov', '.webm', '.m4v', '.ogv', '.ogg', '.mpg', '.mpeg']

// Doit rester aligné sur file_size_limit du bucket (migration_bandes_annonces.sql)
// et sur le plafond global du projet Supabase, qui l'emporte sur celui du bucket.
export const TAILLE_MAX = 200 * 1024 * 1024

// Attribut accept de l'input fichier : les types MIME ne suffisent pas, certains
// systèmes ne les renseignent pas pour un .mov ou un .m4v.
export const ACCEPT_VIDEO = [...MIMES_VIDEO, ...EXTENSIONS_VIDEO].join(',')

export function extensionDe(nom = '') {
  const m = String(nom).match(/\.([a-z0-9]{1,5})$/i)
  return m ? m[1].toLowerCase() : ''
}

// Un fichier est accepté sur son type MIME, ou sur son extension quand le
// système n'a pas su nommer le type (Windows sur un .m4v, notamment).
export function formatAccepte(fichier) {
  if (!fichier) return false
  const type = String(fichier.type || '').toLowerCase()
  if (MIMES_VIDEO.includes(type)) return true
  if (type.startsWith('video/') && !type.includes('matroska')) return true
  return EXTENSIONS_VIDEO.includes(`.${extensionDe(fichier.name)}`)
}

export function formaterOctets(n, lang = 'fr') {
  if (!Number.isFinite(n)) return null
  const [ko, mo] = lang === 'en' ? ['KB', 'MB'] : ['Ko', 'Mo']
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ${ko}`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} ${mo}`
}

export function formaterDuree(secondes) {
  if (!Number.isFinite(secondes) || secondes <= 0) return null
  const s = Math.round(secondes)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ─── Identité d'une œuvre ─────────────────────────────────────────────────────
// Veezi crée une fiche par version : « SPIDER-MAN VF », « SPIDER-MAN VO »,
// « SPIDER-MAN 3D VF ». Elles partagent presque toujours la même bande annonce.
// Ce titre nettoyé est la clé qui permet de la déposer une seule fois.
export function titreOeuvre(titre = '') {
  return String(titre)
    .replace(/\b(3D|2D|IMAX|VF|VO|VOST(?:FR)?|SOUS-TITR\S*)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// ─── Liens YouTube ────────────────────────────────────────────────────────────
// Extrait l'identifiant d'une URL YouTube (watch?v=, youtu.be/, /embed/,
// /shorts/). Vivait dans HeroSlider ; remonté ici, maintenant que la fiche
// film, la page Prochainement et l'administration s'en servent aussi.
export function youtubeId(url) {
  if (!url) return null
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  )
  return m ? m[1] : null
}

export function lienYoutube(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function vignetteYoutube(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
}

// ─── Lignes de film_trailers ──────────────────────────────────────────────────
// Le reste de l'application ne voit jamais les noms de colonnes.
export function lireLigne(row) {
  if (!row) return null
  return {
    filmId:     String(row.film_id),
    filmTitle:  row.film_title || null,
    titleKey:   row.title_key || '',
    videoPath:  row.video_path || null,
    videoUrl:   row.video_url || null,
    videoMime:  row.video_mime || null,
    videoSize:  row.video_size == null ? null : Number(row.video_size),
    videoName:  row.video_name || null,
    duration:   row.video_duration == null ? null : Number(row.video_duration),
    youtubeUrl: row.youtube_url || null,
    versions:   row.apply_to_versions !== false,
    enabled:    row.enabled !== false,
    updatedAt:  row.updated_at || null,
  }
}

// Index de résolution : par fiche exacte, puis par œuvre. Une ligne posée sur
// « SPIDER-MAN VF » sert la fiche VO — sauf si l'administrateur a décoché
// « toutes les versions », le cas d'une VF et d'une VO qui n'ont pas la même
// vidéo. La fiche exacte l'emporte toujours sur l'œuvre.
export function indexerBandesAnnonces(lignes) {
  const parId    = new Map()
  const parTitre = new Map()
  for (const brut of lignes || []) {
    const ligne = brut && brut.filmId ? brut : lireLigne(brut)
    if (!ligne) continue
    parId.set(ligne.filmId, ligne)
    if (ligne.enabled && ligne.versions && ligne.titleKey && !parTitre.has(ligne.titleKey)) {
      parTitre.set(ligne.titleKey, ligne)
    }
  }
  return { parId, parTitre }
}

export const INDEX_VIDE = { parId: new Map(), parTitre: new Map() }

// La ligne qui gouverne un film, sans encore décider de ce qu'on joue.
export function ligneDuFilm(film, index = INDEX_VIDE) {
  if (!film) return null
  const id = String(film.Id ?? film.id ?? '')
  const propre = index.parId?.get(id)
  if (propre) return propre
  const titre = film.Title ?? film.title ?? ''
  return index.parTitre?.get(titreOeuvre(titre)) || null
}

// ─── La résolution ────────────────────────────────────────────────────────────
// Ce que le site doit jouer pour ce film, ou null s'il n'y a rien à jouer.
//
//   { kind: 'fichier', src, mime, name, duration, importee: true }
//   { kind: 'youtube', videoId, url, importee: true|false }
//
// `importee` dit si la décision vient du cinéma (base) ou du distributeur
// (Veezi) : l'administration l'affiche, le site n'en fait rien.
export function bandeAnnonce(film, index = INDEX_VIDE) {
  const ligne = ligneDuFilm(film, index)

  if (ligne?.enabled) {
    if (ligne.videoUrl) {
      return {
        kind: 'fichier',
        src: ligne.videoUrl,
        mime: ligne.videoMime || 'video/mp4',
        name: ligne.videoName || null,
        duration: ligne.duration,
        importee: true,
      }
    }
    const idRemplacement = youtubeId(ligne.youtubeUrl)
    if (idRemplacement) {
      return { kind: 'youtube', videoId: idRemplacement, url: lienYoutube(idRemplacement), importee: true }
    }
  }

  // Repli : le lien saisi par le distributeur dans Veezi.
  const veezi = youtubeId(film?.FilmTrailerUrl ?? film?.trailerUrl)
  if (veezi) return { kind: 'youtube', videoId: veezi, url: lienYoutube(veezi), importee: false }

  return null
}

// ─── Chemin dans le bucket ────────────────────────────────────────────────────
// Un nom neuf à chaque dépôt : le fichier précédent reste lisible le temps que
// la nouvelle ligne s'enregistre, et aucun cache (navigateur, CDN Supabase) ne
// sert l'ancienne vidéo sous la nouvelle adresse. L'ancien objet est effacé par
// la route d'administration une fois la ligne écrite.
export function cheminStockage(filmId, nomFichier) {
  const ext = extensionDe(nomFichier) || 'mp4'
  const base = String(nomFichier || 'bande-annonce')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase() || 'bande-annonce'
  return `${String(filmId).replace(/[^\w-]/g, '')}/${Date.now()}-${base}.${ext}`
}
