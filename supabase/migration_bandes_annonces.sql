-- ============================================================
--  CINEPAX MADAGASCAR — Bandes annonces importées
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
--  (idempotent : réexécutable sans perdre les bandes annonces posées)
-- ============================================================
--
--  Le problème
--  -----------
--  La bande annonce d'un film ne vient aujourd'hui que d'un seul endroit :
--  le champ FilmTrailerUrl de la fiche Veezi, que le distributeur remplit
--  avec un lien YouTube. Trois choses coincent :
--
--    • le champ est souvent vide, et la fiche n'a alors aucune vidéo ;
--    • le lien pointe parfois la bande annonce d'un autre pays, dans une
--      autre langue, ou une vidéo devenue privée — le cinéma ne peut pas
--      la corriger, seul le distributeur écrit dans Veezi ;
--    • une bande annonce montée par le cinéma (VF locale, avant-première,
--      spot de la salle) n'a nulle part où vivre.
--
--  Cette migration ouvre la seconde source : un fichier vidéo déposé
--  depuis /admin/bandes-annonces. Quand il existe, le site le joue ; sinon
--  il retombe sur le lien YouTube de Veezi, exactement comme avant. Aucune
--  fiche n'a besoin d'être renseignée pour que le site continue de marcher.
--
--  Deux objets sont créés
--  ----------------------
--    1. la table public.film_trailers — ce que l'administration a décidé
--       pour un film (fichier déposé, lien de remplacement, actif ou non) ;
--    2. le bucket de stockage « film-trailers » — les fichiers eux-mêmes.
--
--  Pourquoi le fichier ne passe pas par le serveur Next
--  ----------------------------------------------------
--  Une fonction Vercel refuse un corps de requête au-delà de 4,5 Mo : une
--  bande annonce de 80 Mo ne peut pas transiter par /api. Le navigateur de
--  l'administrateur écrit donc directement dans le bucket, avec son propre
--  jeton de session — d'où les policies sur storage.objects plus bas, qui
--  sont la seule chose qui garde l'écriture fermée. La ligne de la table,
--  elle, passe bien par /api/admin/bandes-annonces (service role).

-- ────────────────────────────────────────────────────────────
--  1 — QUI EST ADMINISTRATEUR
-- ────────────────────────────────────────────────────────────
--  Déjà posée par migration_admin_visibilite_achats.sql ; reprise ici pour
--  que ce script se suffise à lui-même. SECURITY DEFINER : la fonction lit
--  profiles en s'affranchissant de RLS. search_path figé — une fonction
--  DEFINER ne doit jamais résoudre ses tables par le chemin de l'appelant.

CREATE OR REPLACE FUNCTION public.est_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    FALSE
  );
$$;

REVOKE ALL   ON FUNCTION public.est_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_admin() TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
--  2 — LA TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.film_trailers (
  -- Identifiant de la fiche film dans Veezi (champ Id de /v4/film). C'est
  -- la clé : une ligne par fiche, et la fiche est ce que l'administrateur
  -- voit dans la liste.
  film_id            TEXT        PRIMARY KEY,

  -- Titre au moment du dépôt. Traçabilité seulement — l'affichage prend
  -- toujours le titre courant de Veezi, qui peut être corrigé après coup.
  film_title         TEXT,

  -- Titre de l'œuvre, suffixes de version retirés (« SPIDER-MAN VF »,
  -- « … VO », « … 3D » → « SPIDER-MAN »). Veezi crée une fiche par version
  -- et elles partagent presque toujours la même bande annonce : ce champ
  -- permet de déposer le fichier une fois pour toutes les versions.
  title_key          TEXT        NOT NULL,

  -- Le fichier déposé, dans le bucket film-trailers.
  video_path         TEXT,       -- chemin dans le bucket
  video_url          TEXT,       -- URL publique, calculée au dépôt
  video_mime         TEXT,       -- video/mp4, video/quicktime, video/webm…
  video_size         BIGINT,     -- octets
  video_name         TEXT,       -- nom d'origine, tel que déposé
  video_duration     NUMERIC,    -- secondes, relevées par le navigateur

  -- Lien de remplacement, utilisé quand aucun fichier n'est déposé. Sert à
  -- corriger un lien Veezi faux ou absent sans rien téléverser.
  youtube_url        TEXT,

  -- Appliquer aussi aux autres versions de la même œuvre (VF/VO/3D), par
  -- title_key. Décoché, la bande annonce ne vaut que pour cette fiche —
  -- le cas d'une VF et d'une VO qui n'ont pas la même vidéo.
  apply_to_versions  BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Décoché, la ligne est ignorée : le site retombe sur le lien Veezi.
  -- Retirer une bande annonce du site sans effacer le fichier déposé.
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Une ligne qui ne porte ni fichier ni lien ne décide de rien : elle
  -- ferait croire à un réglage là où il n'y en a pas.
  CONSTRAINT film_trailers_source_presente
    CHECK (video_path IS NOT NULL OR NULLIF(BTRIM(COALESCE(youtube_url, '')), '') IS NOT NULL)
);

COMMENT ON TABLE  public.film_trailers IS
  'Bandes annonces posées par le cinéma (fichier déposé ou lien de remplacement). À défaut, le site utilise FilmTrailerUrl de Veezi.';
COMMENT ON COLUMN public.film_trailers.title_key IS
  'Titre de l''œuvre sans les suffixes de version (VF/VO/3D), pour partager une bande annonce entre les fiches d''un même film.';
COMMENT ON COLUMN public.film_trailers.enabled IS
  'Faux : la ligne est ignorée et le site retombe sur le lien YouTube de Veezi.';

-- Résolution par œuvre quand la fiche exacte n'a pas de ligne : l'index ne
-- couvre que les lignes qui acceptent d'être partagées.
CREATE INDEX IF NOT EXISTS film_trailers_title_key_idx
  ON public.film_trailers (title_key)
  WHERE apply_to_versions AND enabled;

-- ────────────────────────────────────────────────────────────
--  3 — HORODATAGE
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_film_trailers()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_trailers_touch ON public.film_trailers;
CREATE TRIGGER film_trailers_touch
  BEFORE UPDATE ON public.film_trailers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_film_trailers();

-- ────────────────────────────────────────────────────────────
--  4 — SÉCURITÉ DE LA TABLE
-- ────────────────────────────────────────────────────────────
--  Lecture publique : une URL de bande annonce est faite pour être lue par
--  tous les visiteurs, et le carrousel d'accueil la demande au premier
--  rendu. Aucune policy d'écriture — les modifications passent par
--  /api/admin/bandes-annonces (service role, après vérification is_admin),
--  comme sales_settings et legal_settings.

ALTER TABLE public.film_trailers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "film_trailers_public_select" ON public.film_trailers;
CREATE POLICY "film_trailers_public_select" ON public.film_trailers
  FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────────────────
--  5 — LE BUCKET
-- ────────────────────────────────────────────────────────────
--  Public : le <video> du site lit le fichier sans jeton, et le serveur de
--  stockage répond aux requêtes par plage (Range) — c'est ce qui permet au
--  visiteur de se déplacer dans la vidéo sans la télécharger entière.
--
--  file_size_limit = 200 Mo. ATTENTION : le plafond global du projet
--  (Dashboard → Storage → Settings → Upload file size limit, 50 Mo par
--  défaut) l'emporte sur celui du bucket. Le relever aussi, sinon un
--  fichier de 80 Mo est refusé avec « Payload too large » alors que le
--  bucket l'accepterait.
--
--  allowed_mime_types : ce que les navigateurs savent lire nativement. Le
--  .mkv en est absent volontairement — il se téléverse très bien et ne se
--  lit nulle part.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'film-trailers',
  'film-trailers',
  TRUE,
  209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/ogg', 'video/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ────────────────────────────────────────────────────────────
--  6 — SÉCURITÉ DU BUCKET
-- ────────────────────────────────────────────────────────────
--  Le fichier est déposé par le navigateur de l'administrateur, pas par le
--  serveur Next : ces quatre policies sont donc le seul verrou. Sans
--  elles, la clé anon — publique, présente dans le JavaScript du site —
--  suffirait à écrire dans le bucket.
--
--  La lecture reste ouverte à tous : le bucket est public, et une bande
--  annonce n'a rien à cacher.

DROP POLICY IF EXISTS "film_trailers_objects_read"   ON storage.objects;
DROP POLICY IF EXISTS "film_trailers_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "film_trailers_objects_update" ON storage.objects;
DROP POLICY IF EXISTS "film_trailers_objects_delete" ON storage.objects;

CREATE POLICY "film_trailers_objects_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'film-trailers');

CREATE POLICY "film_trailers_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'film-trailers' AND public.est_admin());

CREATE POLICY "film_trailers_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'film-trailers' AND public.est_admin())
  WITH CHECK (bucket_id = 'film-trailers' AND public.est_admin());

CREATE POLICY "film_trailers_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'film-trailers' AND public.est_admin());

-- ────────────────────────────────────────────────────────────
--  VÉRIFICATION
-- ────────────────────────────────────────────────────────────
-- SELECT film_id, film_title, title_key, enabled, apply_to_versions,
--        video_name, ROUND(video_size / 1048576.0, 1) AS mo, youtube_url
--   FROM public.film_trailers
--  ORDER BY updated_at DESC;
--
-- SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'film-trailers';
--
-- SELECT policyname FROM pg_policies
--  WHERE schemaname = 'storage' AND tablename = 'objects'
--    AND policyname LIKE 'film_trailers%';
