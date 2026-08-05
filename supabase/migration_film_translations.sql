-- ============================================================
--  CINEPAX MADAGASCAR — Traductions de synopsis
--  À exécuter une seule fois dans :
--  Supabase Dashboard → SQL Editor → New query
-- ============================================================
--
--  Les synopsis viennent de Veezi, qui n'en stocke qu'une seule
--  version par fiche film — dans la langue où le distributeur l'a
--  saisie. Sur le catalogue relevé, 32 % sont en anglais, y compris
--  sur des fiches VF. Cette table garde la version traduite pour
--  que chaque langue du site affiche bien sa langue.
--
--  Veezi étant en lecture seule, la traduction ne peut pas y être
--  réécrite : elle vit ici.
--
-- ────────────────────────────────────────────────────────────
--  SECTION 1 — TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.film_translations (
  id          BIGSERIAL   PRIMARY KEY,

  -- Empreinte SHA-256 du texte source. C'est la vraie clé de cache :
  -- les fiches VF, VO et 3D d'une même œuvre partagent souvent le
  -- synopsis au caractère près, et se partagent donc une traduction.
  -- Si le distributeur corrige son texte dans Veezi, l'empreinte
  -- change et la traduction se régénère d'elle-même.
  source_hash TEXT        NOT NULL,

  lang        TEXT        NOT NULL CHECK (lang IN ('fr', 'en')),  -- langue du texte traduit
  source_lang TEXT        NOT NULL CHECK (source_lang IN ('fr', 'en')),
  body        TEXT        NOT NULL,                                -- la traduction

  -- Traçabilité : dernière fiche Veezi rencontrée avec cette empreinte.
  -- Sert à retrouver une traduction depuis le back-office, pas à la clé.
  film_id     TEXT,
  film_title  TEXT,

  engine      TEXT        NOT NULL,                                -- ex. « gemini-3.6-flash »

  -- Une traduction relue à la main n'est jamais réécrite automatiquement.
  reviewed    BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source_hash, lang)
);

-- Parcours du back-office : les traductions automatiques non relues d'abord.
CREATE INDEX IF NOT EXISTS film_translations_review_idx
  ON public.film_translations (reviewed, created_at DESC);

-- Retrouver toutes les traductions d'une fiche donnée.
CREATE INDEX IF NOT EXISTS film_translations_film_idx
  ON public.film_translations (film_id);

-- ────────────────────────────────────────────────────────────
--  SECTION 2 — HORODATAGE
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_film_translations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_translations_touch ON public.film_translations;
CREATE TRIGGER film_translations_touch
  BEFORE UPDATE ON public.film_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_film_translations();

-- ────────────────────────────────────────────────────────────
--  SECTION 3 — ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
--
--  Table strictement serveur : elle n'est lue et écrite que par les
--  routes Next.js, via la clé service_role (qui contourne RLS).
--  Aucune politique n'est donc créée — RLS activé sans politique
--  ferme la table à la clé anon, donc au navigateur.

ALTER TABLE public.film_translations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
--  SECTION 4 — VÉRIFICATION
-- ────────────────────────────────────────────────────────────
--  SELECT lang, source_lang, reviewed, COUNT(*)
--    FROM public.film_translations
--   GROUP BY 1, 2, 3
--   ORDER BY 1, 2;
