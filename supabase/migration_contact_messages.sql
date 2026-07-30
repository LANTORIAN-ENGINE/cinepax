-- ============================================================
--  CINEPAX MADAGASCAR — Messages du formulaire de contact
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
--  (idempotent : réexécutable sans risque)
-- ============================================================
--
--  Rapprochement e-mail ↔ compte client
--  ------------------------------------
--  L'e-mail est le seul champ vraiment obligatoire du formulaire, parce
--  qu'il sert de clé de rapprochement : si l'adresse saisie correspond à
--  celle d'un compte existant, le message est rattaché à ce compte et
--  apparaît dans l'espace client (« vous nous aviez déjà écrit à ce
--  sujet »). Le rattachement se fait à deux moments, par trigger, donc
--  quelle que soit la voie d'écriture :
--
--    1. à l'insertion du message → on cherche le compte (link_contact_message)
--    2. à la création d'un compte → on rattrape les messages antérieurs
--       envoyés avec la même adresse (claim_contact_messages)
--
--  L'admin, lui, voit tout : rattaché ou non.

-- ────────────────────────────────────────────────────────────
--  SECTION 1 — TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  message_ref  TEXT        UNIQUE NOT NULL,          -- ex: MSG-20260730-A3F2K

  -- Rattachement au compte client. NULL = visiteur non identifié.
  -- Rempli automatiquement par trigger dès que l'e-mail correspond.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Coordonnées saisies dans le formulaire
  full_name    TEXT        NOT NULL,
  email        TEXT        NOT NULL,                 -- obligatoire : clé de rapprochement
  phone        TEXT,

  subject      TEXT        NOT NULL DEFAULT 'other', -- booking | rates | event | advertising | complaint | other
  message      TEXT        NOT NULL,

  -- Suivi côté administration
  status       TEXT        NOT NULL DEFAULT 'new',   -- new | in_progress | answered | closed
  admin_note   TEXT,
  answered_at  TIMESTAMPTZ,

  -- Contexte de l'envoi (diagnostic, langue de réponse)
  locale       TEXT,                                 -- fr | en
  source       TEXT        NOT NULL DEFAULT 'contact_page',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT contact_messages_email_format
    CHECK (email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  CONSTRAINT contact_messages_status_valid
    CHECK (status IN ('new', 'in_progress', 'answered', 'closed')),
  CONSTRAINT contact_messages_subject_valid
    CHECK (subject IN ('booking', 'rates', 'event', 'advertising', 'complaint', 'other')),
  CONSTRAINT contact_messages_message_length
    CHECK (char_length(btrim(message)) BETWEEN 10 AND 4000),
  CONSTRAINT contact_messages_name_length
    CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120)
);

-- Boîte de réception admin : tri antéchronologique, filtre par état
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON public.contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_status_idx
  ON public.contact_messages (status, created_at DESC);

-- Rapprochement par e-mail : toujours comparé en minuscules
CREATE INDEX IF NOT EXISTS contact_messages_email_idx
  ON public.contact_messages (lower(btrim(email)));

-- Historique d'un client
CREATE INDEX IF NOT EXISTS contact_messages_user_idx
  ON public.contact_messages (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
--  SECTION 2 — NORMALISATION + RAPPROCHEMENT À L'INSERTION
-- ────────────────────────────────────────────────────────────

-- Normalise l'e-mail et cherche le compte correspondant.
-- SECURITY DEFINER : la lecture de auth.users est nécessaire et reste
-- confinée à ce seul test d'égalité (aucune donnée de auth.users n'est
-- renvoyée à l'appelant).
CREATE OR REPLACE FUNCTION public.link_contact_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email     := lower(btrim(NEW.email));
  NEW.full_name := btrim(NEW.full_name);
  NEW.updated_at := NOW();

  -- À l'insertion, user_id est TOUJOURS recalculé depuis l'e-mail : la
  -- valeur éventuellement fournie par l'appelant est ignorée. Sans cela,
  -- une insertion directe avec la clé anon pourrait déposer un message
  -- dans l'espace client de quelqu'un d'autre.
  -- À la mise à jour, la valeur explicite est respectée : c'est ainsi que
  -- le rattrapage (/api/contact/mine) rattache les messages orphelins.
  IF TG_OP = 'INSERT' THEN
    SELECT u.id INTO NEW.user_id
    FROM auth.users u
    WHERE lower(btrim(u.email)) = NEW.email
    ORDER BY u.created_at ASC
    LIMIT 1;
  END IF;

  -- Horodate le passage à « répondu »
  IF NEW.status = 'answered' AND NEW.answered_at IS NULL THEN
    NEW.answered_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_contact_message_write ON public.contact_messages;

CREATE TRIGGER on_contact_message_write
  BEFORE INSERT OR UPDATE ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.link_contact_message();

-- ────────────────────────────────────────────────────────────
--  SECTION 3 — RATTRAPAGE À LA CRÉATION D'UN COMPTE
-- ────────────────────────────────────────────────────────────
-- Quelqu'un écrit en visiteur, puis s'inscrit avec la même adresse :
-- ses anciens messages rejoignent son espace client.

CREATE OR REPLACE FUNCTION public.claim_contact_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.contact_messages
    SET    user_id = NEW.id
    WHERE  user_id IS NULL
      AND  lower(btrim(email)) = lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_claim_messages ON auth.users;

CREATE TRIGGER on_auth_user_claim_messages
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_contact_messages();

-- ────────────────────────────────────────────────────────────
--  SECTION 4 — ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Écriture : tout le monde peut nous écrire, y compris sans compte.
--
-- Un message déposé publiquement doit être « neuf » : ni déjà traité, ni
-- annoté. Sans cette contrainte, une insertion directe avec la clé anon
-- pourrait arriver en 'closed' et passer inaperçue dans la boîte admin.
-- Le rattachement au compte (user_id) est, lui, imposé par le trigger.
-- La service_role de l'API contourne la RLS et n'est donc pas concernée.
DROP POLICY IF EXISTS "contact_messages_insert_public" ON public.contact_messages;
CREATE POLICY "contact_messages_insert_public" ON public.contact_messages
  FOR INSERT
  WITH CHECK (
    status = 'new'
    AND admin_note IS NULL
    AND answered_at IS NULL
  );

-- Lecture : un client ne voit que les messages rattachés à son compte.
-- L'administration lit via la service_role key (bypass RLS).
DROP POLICY IF EXISTS "contact_messages_own_select" ON public.contact_messages;
CREATE POLICY "contact_messages_own_select" ON public.contact_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy UPDATE / DELETE : le suivi est réservé à l'admin
-- (service_role). Un client ne peut ni modifier ni supprimer un message
-- déjà envoyé — c'est une trace, pas un brouillon.

-- ────────────────────────────────────────────────────────────
--  SECTION 5 — VUE ADMIN
-- ────────────────────────────────────────────────────────────
-- Jointure prête à l'emploi pour /admin/messages : le message, plus le
-- nom du compte rattaché quand il y en a un.
-- security_invoker : la vue s'exécute avec les droits de l'appelant,
-- donc la RLS ci-dessus continue de s'appliquer aux clients.

CREATE OR REPLACE VIEW public.contact_messages_admin
WITH (security_invoker = true) AS
SELECT
  m.*,
  p.full_name AS account_name,
  p.phone     AS account_phone,
  (m.user_id IS NOT NULL) AS is_linked
FROM public.contact_messages m
LEFT JOIN public.profiles p ON p.id = m.user_id;
