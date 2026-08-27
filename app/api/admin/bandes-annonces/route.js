import { createServiceClient } from '@/lib/supabase'
import { titreOeuvre, youtubeId, TAILLE_MAX } from '@/lib/bandesAnnonces'
import { oublierBandesAnnonces } from '@/lib/bandesAnnoncesServeur'

// Bandes annonces — ADMIN uniquement.
//
//   GET    /api/admin/bandes-annonces   les films, avec ce qui est posé sur chacun
//   PUT    /api/admin/bandes-annonces   pose ou remplace la bande annonce d'un film
//   DELETE /api/admin/bandes-annonces?filmId=…   retire la bande annonce et son fichier
//
// Le fichier vidéo, lui, ne passe pas par ici : une fonction Vercel refuse un
// corps de requête au-delà de 4,5 Mo. Le navigateur de l'administrateur écrit
// directement dans le bucket avec son jeton de session (policies de
// migration_bandes_annonces.sql), puis appelle PUT pour enregistrer le chemin
// obtenu. Cette route est donc la seule à écrire dans la table, jamais dans
// le stockage — sauf pour effacer un fichier remplacé ou retiré.

export const dynamic = 'force-dynamic'

const BUCKET = 'film-trailers'
const VEEZI  = 'https://api.eu.veezi.com'

// Veezi utilise 9999-12-31 comme « date de sortie non fixée ».
const SANS_DATE = '9999'

async function requireAdmin(request) {
  const supabase = createServiceClient()
  if (!supabase) return { error: Response.json({ error: 'supabase_not_configured' }, { status: 503 }) }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'no_token' }, { status: 401 }) }
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return { error: Response.json({ error: 'invalid_token' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { supabase, user }
}

async function veezi(chemin) {
  const res = await fetch(`${VEEZI}${chemin}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    // Le catalogue pèse 5,7 Mo : au-delà des 2 Mo que le cache de données de
    // Next accepte. C'est aussi la raison pour laquelle il est projeté ici et
    // non renvoyé tel quel — l'écran d'administration reçoit 30 Ko.
    next: { revalidate: 600 },
  })
  if (!res.ok) throw new Error(`Veezi ${chemin} → ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

// ─── GET — la liste des films à équiper ───────────────────────────────────────
// Trois populations, dans cet ordre : ce qui est à l'affiche, ce qui sort
// bientôt, et tout film qui porte déjà une bande annonce (même déprogrammé —
// sinon la ligne posée deviendrait invisible et impossible à retirer).
export async function GET(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  const { data: rows, error: readErr } = await supabase
    .from('film_trailers')
    .select('*')
    .order('updated_at', { ascending: false })

  if (readErr) {
    return Response.json(
      { error: 'table_absente', detail: readErr.message, films: [], trailers: [] },
      { status: 503 },
    )
  }

  const parId = new Map((rows || []).map(r => [String(r.film_id), r]))

  let films = []
  let veeziErreur = null
  try {
    const [catalogue, sessions] = await Promise.all([veezi('/v4/film'), veezi('/v1/session')])
    const maintenant = Date.now()

    // Films dont une séance est encore à venir.
    const aLAffiche = new Set()
    for (const s of sessions) {
      const debut = s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
      if (debut && new Date(debut).getTime() > maintenant) aLAffiche.add(String(s.FilmId))
    }

    films = catalogue
      .map(f => {
        const id = String(f.Id)
        const sortie = f.OpeningDate && !f.OpeningDate.startsWith(SANS_DATE) ? f.OpeningDate : null
        const aVenir = sortie ? new Date(sortie).getTime() > maintenant : false
        return {
          id,
          title: f.Title || id,
          titleKey: titreOeuvre(f.Title),
          poster: f.FilmPosterThumbnailUrl || f.FilmPosterUrl || null,
          backdrop: f.BackdropImageUrl || null,
          // `trailerUrl` et non « veeziTrailerUrl » : c'est le nom que lit
          // bandeAnnonce() pour son repli, et l'écran d'aperçu s'en sert.
          trailerUrl: f.FilmTrailerUrl || null,
          veeziVideoId: youtubeId(f.FilmTrailerUrl),
          openingDate: sortie,
          onScreen: aLAffiche.has(id),
          comingSoon: aVenir,
        }
      })
      .filter(f => f.onScreen || f.comingSoon || parId.has(f.id))
      .sort((a, b) => {
        if (a.onScreen !== b.onScreen) return a.onScreen ? -1 : 1
        if (a.onScreen) return String(a.title).localeCompare(String(b.title), 'fr')
        return new Date(a.openingDate || 0) - new Date(b.openingDate || 0)
      })
  } catch (err) {
    // Veezi injoignable : on rend quand même les lignes déjà posées, avec le
    // titre relevé au dépôt. L'administrateur voit ce qu'il a fait et peut le
    // retirer ; il ne peut simplement pas en ajouter tant que Veezi tousse.
    veeziErreur = err.message
    films = (rows || []).map(r => ({
      id: String(r.film_id),
      title: r.film_title || String(r.film_id),
      titleKey: r.title_key,
      poster: null,
      backdrop: null,
      trailerUrl: null,
      veeziVideoId: null,
      openingDate: null,
      onScreen: false,
      comingSoon: false,
    }))
  }

  return Response.json({ films, trailers: rows || [], veeziErreur })
}

// ─── PUT — poser une bande annonce ────────────────────────────────────────────
export async function PUT(request) {
  const { supabase, user, error } = await requireAdmin(request)
  if (error) return error

  let body
  try { body = await request.json() }
  catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }

  const filmId = String(body.filmId || '').trim()
  if (!filmId) return Response.json({ error: 'film_manquant' }, { status: 400 })

  const titre    = String(body.filmTitle || '').trim() || null
  const titleKey = titreOeuvre(body.titleKey || body.filmTitle || '')
  if (!titleKey) return Response.json({ error: 'titre_manquant' }, { status: 400 })

  // Le lien de remplacement doit être une URL YouTube lisible : accepter une
  // adresse dont on ne sait pas extraire l'identifiant reviendrait à poser un
  // réglage qui ne joue rien.
  const lienSaisi = String(body.youtubeUrl || '').trim()
  if (lienSaisi && !youtubeId(lienSaisi)) {
    return Response.json({ error: 'lien_illisible' }, { status: 400 })
  }

  const chemin = body.videoPath ? String(body.videoPath).trim() : null

  // Un chemin forgé pointant hors du dossier du film permettrait, au
  // remplacement suivant, de faire effacer par le service role le fichier
  // d'un autre film. Le dossier est imposé.
  if (chemin && !chemin.startsWith(`${filmId}/`)) {
    return Response.json({ error: 'chemin_invalide' }, { status: 400 })
  }

  if (!chemin && !lienSaisi) {
    return Response.json({ error: 'source_manquante' }, { status: 400 })
  }

  const taille = body.videoSize == null ? null : Number(body.videoSize)
  if (chemin && Number.isFinite(taille) && taille > TAILLE_MAX) {
    return Response.json({ error: 'fichier_trop_lourd' }, { status: 400 })
  }

  // Le fichier annoncé existe-t-il vraiment dans le bucket ? Le dépôt s'est
  // fait depuis le navigateur : un réseau coupé à mi-course, et la route
  // enregistrerait l'adresse d'une vidéo qui n'a jamais fini d'arriver.
  let urlPublique = null
  if (chemin) {
    const dossier = chemin.slice(0, chemin.lastIndexOf('/'))
    const nom     = chemin.slice(chemin.lastIndexOf('/') + 1)
    const { data: objets, error: listErr } = await supabase
      .storage.from(BUCKET).list(dossier, { search: nom, limit: 100 })

    if (listErr) return Response.json({ error: 'stockage_absent', detail: listErr.message }, { status: 503 })
    if (!(objets || []).some(o => o.name === nom)) {
      return Response.json({ error: 'fichier_introuvable' }, { status: 409 })
    }

    urlPublique = supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl
  }

  // Le fichier que la nouvelle ligne remplace, pour l'effacer après coup.
  const { data: avant } = await supabase
    .from('film_trailers').select('video_path').eq('film_id', filmId).maybeSingle()

  const ligne = {
    film_id:           filmId,
    film_title:        titre,
    title_key:         titleKey,
    video_path:        chemin,
    video_url:         urlPublique,
    video_mime:        chemin ? (body.videoMime || null) : null,
    video_size:        chemin && Number.isFinite(taille) ? Math.round(taille) : null,
    video_name:        chemin ? (body.videoName || null) : null,
    video_duration:    chemin && Number.isFinite(Number(body.duration)) ? Number(body.duration) : null,
    youtube_url:       lienSaisi || null,
    apply_to_versions: body.versions !== false,
    enabled:           body.enabled !== false,
    updated_at:        new Date().toISOString(),
    updated_by:        user.id,
  }

  const { data, error: upErr } = await supabase
    .from('film_trailers')
    .upsert(ligne, { onConflict: 'film_id' })
    .select('*')
    .single()

  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  // L'ancien fichier n'est effacé qu'une fois la ligne écrite : dans l'autre
  // ordre, une écriture qui échoue laisserait la ligne pointer un fichier
  // qui n'existe plus.
  if (avant?.video_path && avant.video_path !== chemin) {
    await supabase.storage.from(BUCKET).remove([avant.video_path]).catch(() => {})
  }

  oublierBandesAnnonces()
  return Response.json({ ok: true, trailer: data })
}

// ─── DELETE — retirer une bande annonce ───────────────────────────────────────
export async function DELETE(request) {
  const { supabase, error } = await requireAdmin(request)
  if (error) return error

  const filmId = new URL(request.url).searchParams.get('filmId')
  if (!filmId) return Response.json({ error: 'film_manquant' }, { status: 400 })

  const { data: avant } = await supabase
    .from('film_trailers').select('video_path').eq('film_id', filmId).maybeSingle()

  const { error: delErr } = await supabase
    .from('film_trailers').delete().eq('film_id', filmId)
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

  if (avant?.video_path) {
    await supabase.storage.from(BUCKET).remove([avant.video_path]).catch(() => {})
  }

  oublierBandesAnnonces()
  return Response.json({ ok: true })
}
