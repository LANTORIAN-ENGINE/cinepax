-- ============================================================
--  CINEPAX MADAGASCAR — Documents légaux, consentements, RGPD
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
--  (idempotent : réexécutable sans écraser les textes édités)
-- ============================================================
--
--  Ce que ce script installe
--  -------------------------
--   1. legal_documents          le texte de chaque document, éditable
--                               depuis /admin/legal (éditeur riche TipTap).
--                               Le front-office ne lit que cette table :
--                               publier dans l'admin suffit à mettre le
--                               site à jour, sans redéploiement.
--   2. legal_document_revisions l'archive figée de chaque version publiée.
--                               Un consentement se prouve en montrant le
--                               texte tel qu'il était au moment du clic —
--                               pas le texte d'aujourd'hui.
--   3. legal_consents           qui a accepté quoi, dans quelle version,
--                               à quelle date, depuis quel écran.
--   4. legal_settings           réglages transverses : bandeau RGPD,
--                               contact du délégué à la protection des
--                               données, délai de conservation affiché.
--
--  Pourquoi la version est manuelle
--  --------------------------------
--  Corriger une faute de frappe ne doit pas redemander son consentement à
--  toute la base. La version ne monte donc que si l'administrateur coche
--  « nouvelle version » en enregistrant : c'est lui qui décide si le
--  changement est substantiel. Un consentement reste valable tant que la
--  version acceptée est la version en vigueur.
--
--  Sur le contenu livré
--  --------------------
--  Les textes semés plus bas sont un socle de travail rédigé pour Cinepax
--  Madagascar (RGPD + loi malgache n° 2014-038 sur la protection des
--  données à caractère personnel). Ils doivent être relus et validés par
--  le conseil juridique du client avant mise en production. Ils ne sont
--  insérés que si le document n'existe pas déjà (ON CONFLICT DO NOTHING) :
--  réexécuter ce script ne défait jamais une rédaction faite dans l'admin.

-- ────────────────────────────────────────────────────────────
--  SECTION 1 — DOCUMENTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identifiant d'URL : /legal/cgv. Immuable une fois publié — c'est
  -- l'adresse que les clients auront en favori et dans leurs e-mails.
  slug          TEXT        UNIQUE NOT NULL,

  title_fr      TEXT        NOT NULL,
  title_en      TEXT        NOT NULL,

  -- Une phrase, affichée sur la carte du sommaire /legal et en chapô de
  -- la page. Répond à « qu'est-ce que je vais lire ? » avant le clic.
  summary_fr    TEXT,
  summary_en    TEXT,

  -- Corps du document, HTML produit par l'éditeur TipTap. Nettoyé côté
  -- serveur avant écriture (lib/legal.js → sanitizeLegalHtml).
  body_fr       TEXT        NOT NULL DEFAULT '',
  body_en       TEXT        NOT NULL DEFAULT '',

  -- Version en vigueur. Monte à la demande de l'administrateur ; toute
  -- montée invalide les consentements donnés sur la version précédente.
  version       INTEGER     NOT NULL DEFAULT 1,
  effective_on  DATE        NOT NULL DEFAULT CURRENT_DATE,

  -- Consentement
  requires_consent  BOOLEAN NOT NULL DEFAULT FALSE,  -- case à cocher à l'inscription
  consent_group     TEXT,                            -- cases regroupées : 'terms', 'privacy'…
  consent_label_fr  TEXT,                            -- libellé de la case (porté par le 1er du groupe)
  consent_label_en  TEXT,
  scroll_gate       BOOLEAN NOT NULL DEFAULT TRUE,   -- case bloquée tant que le texte n'est pas lu

  -- Diffusion
  is_published  BOOLEAN     NOT NULL DEFAULT TRUE,
  in_footer     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INTEGER     NOT NULL DEFAULT 100,

  updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT legal_documents_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT legal_documents_version_positive
    CHECK (version >= 1),
  -- Un document qui demande un consentement doit dire au nom de quoi :
  -- une case sans groupe ne saurait pas où s'afficher.
  CONSTRAINT legal_documents_consent_needs_group
    CHECK (requires_consent = FALSE OR consent_group IS NOT NULL)
);

-- Sommaire public et pied de page : tri stable, publiés d'abord
CREATE INDEX IF NOT EXISTS legal_documents_order_idx
  ON public.legal_documents (sort_order, slug) WHERE is_published;

-- Les cases à cocher de l'inscription
CREATE INDEX IF NOT EXISTS legal_documents_consent_idx
  ON public.legal_documents (consent_group, sort_order) WHERE requires_consent;

-- ────────────────────────────────────────────────────────────
--  SECTION 2 — ARCHIVE DES VERSIONS
-- ────────────────────────────────────────────────────────────
--  Figée à la publication, jamais modifiée ensuite. C'est la pièce
--  justificative : « voici le texte que cette personne a accepté ».

CREATE TABLE IF NOT EXISTS public.legal_document_revisions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id   UUID        NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  slug          TEXT        NOT NULL,
  version       INTEGER     NOT NULL,
  title_fr      TEXT        NOT NULL,
  title_en      TEXT        NOT NULL,
  body_fr       TEXT        NOT NULL,
  body_en       TEXT        NOT NULL,
  published_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS legal_revisions_doc_idx
  ON public.legal_document_revisions (slug, version DESC);

-- Archive automatique : à la création du document, et à chaque montée de
-- version. Une simple correction (version inchangée) n'archive rien.
CREATE OR REPLACE FUNCTION public.snapshot_legal_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.version <> OLD.version THEN
    INSERT INTO public.legal_document_revisions
      (document_id, slug, version, title_fr, title_en, body_fr, body_en, published_by)
    VALUES
      (NEW.id, NEW.slug, NEW.version, NEW.title_fr, NEW.title_en,
       NEW.body_fr, NEW.body_en, NEW.updated_by)
    ON CONFLICT (document_id, version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_legal_document_versioned ON public.legal_documents;
CREATE TRIGGER on_legal_document_versioned
  AFTER INSERT OR UPDATE ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_legal_document();

-- Horodatage de la dernière retouche, quelle qu'elle soit
CREATE OR REPLACE FUNCTION public.touch_legal_document()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_legal_document_touch ON public.legal_documents;
CREATE TRIGGER on_legal_document_touch
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_legal_document();

-- ────────────────────────────────────────────────────────────
--  SECTION 3 — CONSENTEMENTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.legal_consents (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- NULL = consentement donné avant la création du compte (bandeau
  -- visiteur, achat sans compte). Rattaché au compte par trigger dès
  -- qu'une inscription arrive avec la même adresse.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_email  TEXT,

  document_id  UUID        REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  slug         TEXT        NOT NULL,
  version      INTEGER     NOT NULL,

  accepted     BOOLEAN     NOT NULL DEFAULT TRUE,   -- FALSE = retrait du consentement
  context      TEXT        NOT NULL DEFAULT 'register',  -- register | login | checkout | banner | account
  locale       TEXT,
  ip           TEXT,
  user_agent   TEXT,

  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT legal_consents_context_valid
    CHECK (context IN ('register', 'login', 'checkout', 'banner', 'account')),
  -- Une trace sans titulaire ne prouve rien
  CONSTRAINT legal_consents_has_subject
    CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL)
);

-- Un seul état courant par personne, document et version : le dernier
-- geste écrase le précédent (accepter puis retirer, ou l'inverse).
CREATE UNIQUE INDEX IF NOT EXISTS legal_consents_user_doc_uniq
  ON public.legal_consents (user_id, slug, version) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_consents_guest_doc_uniq
  ON public.legal_consents (lower(btrim(guest_email)), slug, version)
  WHERE user_id IS NULL AND guest_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS legal_consents_user_idx
  ON public.legal_consents (user_id, accepted_at DESC);

-- Normalisation de l'adresse invité, comme pour contact_messages
CREATE OR REPLACE FUNCTION public.normalize_legal_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.guest_email IS NOT NULL THEN
    NEW.guest_email := lower(btrim(NEW.guest_email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_legal_consent_write ON public.legal_consents;
CREATE TRIGGER on_legal_consent_write
  BEFORE INSERT OR UPDATE ON public.legal_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_legal_consent();

-- Rattrapage à l'inscription : les consentements donnés en visiteur avec
-- la même adresse rejoignent le compte. Même mécanique que les messages
-- de contact — voir migration_contact_messages.sql.
CREATE OR REPLACE FUNCTION public.claim_legal_consents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    -- Ne rattache que ce qui ne ferait pas doublon avec un consentement
    -- déjà porté par le compte pour le même document et la même version.
    UPDATE public.legal_consents c
    SET    user_id = NEW.id
    WHERE  c.user_id IS NULL
      AND  lower(btrim(c.guest_email)) = lower(btrim(NEW.email))
      AND  NOT EXISTS (
             SELECT 1 FROM public.legal_consents d
             WHERE d.user_id = NEW.id AND d.slug = c.slug AND d.version = c.version
           );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_claim_consents ON auth.users;
CREATE TRIGGER on_auth_user_claim_consents
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_legal_consents();

-- ────────────────────────────────────────────────────────────
--  SECTION 4 — RÉGLAGES TRANSVERSES
-- ────────────────────────────────────────────────────────────
--  Ligne unique (id = 1). Ce qui ne tient pas dans un document : le
--  bandeau d'accueil, et le contact auquel un client exerce ses droits.

CREATE TABLE IF NOT EXISTS public.legal_settings (
  id                INTEGER     PRIMARY KEY DEFAULT 1,

  banner_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  banner_title_fr   TEXT        NOT NULL DEFAULT 'Vos données, vos choix',
  banner_title_en   TEXT        NOT NULL DEFAULT 'Your data, your choice',
  banner_text_fr    TEXT        NOT NULL DEFAULT '',
  banner_text_en    TEXT        NOT NULL DEFAULT '',
  banner_doc_slug   TEXT        NOT NULL DEFAULT 'rgpd',

  -- Exercice des droits (accès, rectification, effacement, opposition)
  dpo_name          TEXT        NOT NULL DEFAULT 'Cinepax Madagascar',
  dpo_email         TEXT        NOT NULL DEFAULT 'contact@cinepax.mg',
  dpo_address       TEXT        NOT NULL DEFAULT 'Tana Water Front, Antananarivo, Madagascar',
  retention_months  INTEGER     NOT NULL DEFAULT 36,

  updated_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT legal_settings_singleton CHECK (id = 1),
  CONSTRAINT legal_settings_email_format
    CHECK (dpo_email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$')
);

INSERT INTO public.legal_settings (id, banner_text_fr, banner_text_en)
VALUES (
  1,
  'Nous conservons vos coordonnées et vos achats pour vous délivrer vos billets et retrouver votre historique. Aucune revente à des tiers, aucun traçage publicitaire.',
  'We keep your contact details and purchases to issue your tickets and retrieve your history. We never sell data to third parties and run no advertising trackers.'
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
--  SECTION 5 — ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.legal_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_consents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_settings           ENABLE ROW LEVEL SECURITY;

-- Documents : lecture publique de ce qui est publié. Un brouillon reste
-- invisible jusqu'à sa publication. L'écriture passe exclusivement par
-- /api/admin/legal (service_role, après vérification is_admin) : aucune
-- policy INSERT/UPDATE/DELETE n'est ouverte ici.
DROP POLICY IF EXISTS "legal_documents_public_select" ON public.legal_documents;
CREATE POLICY "legal_documents_public_select" ON public.legal_documents
  FOR SELECT USING (is_published = TRUE);

-- Archive : lecture publique elle aussi. Un client qui rouvre un
-- consentement doit pouvoir relire la version exacte qu'il a acceptée,
-- même si le document a changé depuis.
DROP POLICY IF EXISTS "legal_revisions_public_select" ON public.legal_document_revisions;
CREATE POLICY "legal_revisions_public_select" ON public.legal_document_revisions
  FOR SELECT USING (TRUE);

-- Réglages : lecture publique (le bandeau en dépend), écriture admin
-- via service_role uniquement.
DROP POLICY IF EXISTS "legal_settings_public_select" ON public.legal_settings;
CREATE POLICY "legal_settings_public_select" ON public.legal_settings
  FOR SELECT USING (TRUE);

-- Consentements : chacun lit les siens. L'écriture passe par
-- /api/legal/consent, qui horodate et relève l'adresse IP côté serveur —
-- une trace que le navigateur ne doit pas pouvoir fabriquer lui-même.
DROP POLICY IF EXISTS "legal_consents_own_select" ON public.legal_consents;
CREATE POLICY "legal_consents_own_select" ON public.legal_consents
  FOR SELECT USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
--  SECTION 6 — VUE ADMIN
-- ────────────────────────────────────────────────────────────
--  Qui a accepté quoi, avec le nom du compte et l'état de validité :
--  un consentement donné sur une version périmée n'est plus « à jour ».

CREATE OR REPLACE VIEW public.legal_consents_admin
WITH (security_invoker = true) AS
SELECT
  c.*,
  p.full_name              AS account_name,
  d.title_fr               AS document_title_fr,
  d.title_en               AS document_title_en,
  d.version                AS current_version,
  (c.accepted AND c.version = d.version) AS is_current
FROM public.legal_consents c
LEFT JOIN public.profiles        p ON p.id = c.user_id
LEFT JOIN public.legal_documents d ON d.slug = c.slug;

-- ────────────────────────────────────────────────────────────
--  SECTION 7 — CONTENU INITIAL
-- ────────────────────────────────────────────────────────────
--  Socle de travail, à faire valider juridiquement. N'écrase jamais un
--  texte existant : ON CONFLICT (slug) DO NOTHING.
--
--  Quatre documents, deux cases à cocher :
--    groupe « terms »   → CGU + CGV      (l'usage du site et l'achat)
--    groupe « privacy » → RGPD + PDD     (le traitement des données)
--
--  Le règlement impose que le consentement au traitement des données
--  soit distinct de l'acceptation du contrat : d'où deux cases, et non
--  une seule case fourre-tout.

INSERT INTO public.legal_documents (
  slug, title_fr, title_en, summary_fr, summary_en,
  requires_consent, consent_group, consent_label_fr, consent_label_en,
  scroll_gate, in_footer, sort_order, body_fr, body_en
) VALUES

-- ─── 1. Conditions générales d'utilisation ──────────────────
(
  'cgu',
  'Conditions générales d’utilisation',
  'Terms of use',
  'Les règles d’usage du site cinepax.mg : votre compte, ce que vous pouvez publier, ce qui nous appartient.',
  'How cinepax.mg may be used: your account, what you may post, what belongs to us.',
  TRUE, 'terms',
  'J’ai lu et j’accepte les conditions générales d’utilisation et les conditions générales de vente.',
  'I have read and accept the terms of use and the terms of sale.',
  TRUE, TRUE, 10,
  $html$<h2>1. Qui édite ce site</h2>
<p>Le site <strong>cinepax.mg</strong> est édité par Cinepax Madagascar, groupe Talys, dont le complexe se situe au centre commercial Tana Water Front, Antananarivo, Madagascar. Contact : <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> — +261 34 05 735 01.</p>
<p>L’hébergement du site est assuré par Vercel Inc. La billetterie s’appuie sur la plateforme Veezi (Vista Group). Les comptes clients et l’historique d’achat sont hébergés sur Supabase.</p>
<h2>2. Ce que couvre ce document</h2>
<p>Ces conditions régissent l’accès et l’usage du site, la création d’un compte et la consultation des séances. L’achat de billets, lui, relève des <strong>conditions générales de vente</strong>. La façon dont nous traitons vos données relève de la <strong>politique de protection des données</strong>.</p>
<p>Naviguer sur le site vaut acceptation de ces conditions. Si vous ne les acceptez pas, n’utilisez pas le site.</p>
<h2>3. Votre compte</h2>
<p>La création d’un compte demande un nom, une adresse e-mail valide et un mot de passe. L’adresse e-mail doit être la vôtre : c’est à elle que sont envoyés vos billets et vos confirmations d’achat.</p>
<p>Votre mot de passe est personnel. Vous restez responsable des achats passés depuis votre compte tant que vous ne nous avez pas signalé qu’il vous échappe. Prévenez-nous sans délai à <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> si vous suspectez un accès dont vous n’êtes pas l’auteur.</p>
<p>Vous pouvez demander la fermeture de votre compte à tout moment. Les billets déjà achetés restent valables et les écritures comptables liées à ces achats sont conservées le temps qu’impose la loi.</p>
<h2>4. Usage attendu du site</h2>
<p>Vous vous engagez à ne pas :</p>
<ul>
<li>perturber le fonctionnement ou la sécurité du site, de ses comptes ou de ses serveurs ;</li>
<li>tenter d’accéder à une partie du site qui ne vous est pas ouverte, ni aux données d’un autre client ;</li>
<li>extraire massivement le contenu du site par des moyens automatisés ;</li>
<li>déposer un contenu illicite, menaçant, diffamatoire, obscène, ou portant atteinte aux droits d’un tiers ;</li>
<li>revendre les billets achetés sur ce site en dehors du cadre prévu par les conditions de vente.</li>
</ul>
<h2>5. Ce qui nous appartient</h2>
<p>Les textes, la charte graphique, le logo Cinepax et l’agencement du site nous appartiennent. Les affiches, bandes-annonces, photographies et synopsis des films appartiennent à leurs distributeurs et sont diffusés dans le cadre de la promotion des séances.</p>
<p>Vous pouvez consulter et imprimer ces pages pour votre usage personnel. Toute reproduction, adaptation ou diffusion à d’autres fins demande notre accord écrit préalable.</p>
<h2>6. Disponibilité du site</h2>
<p>Nous faisons le nécessaire pour que le site reste accessible, sans pouvoir le garantir en continu : maintenance, panne d’un prestataire ou coupure réseau peuvent l’interrompre. Une interruption n’ouvre pas droit à indemnité, mais elle ne fait pas disparaître un billet déjà payé — il reste valable et opposable en caisse.</p>
<p>Les horaires, films et tarifs affichés proviennent de notre système de programmation et peuvent changer. Seule l’information au moment de la validation de l’achat engage Cinepax.</p>
<h2>7. Liens vers d’autres sites</h2>
<p>Le site peut renvoyer vers des sites tiers — réseaux sociaux, distributeurs, prestataires de paiement. Nous ne maîtrisons ni leur contenu ni leurs pratiques de confidentialité, et leur présence ne vaut pas approbation.</p>
<h2>8. Modification de ces conditions</h2>
<p>Nous pouvons faire évoluer ces conditions. Le numéro de version et la date d’entrée en vigueur figurent en tête de cette page. Une modification substantielle vous est signalée à votre prochaine connexion, et votre acceptation vous est redemandée.</p>
<h2>9. Droit applicable</h2>
<p>Ces conditions sont régies par le droit malgache. À défaut d’accord amiable, le litige relève des juridictions compétentes d’Antananarivo.</p>$html$,
  $html$<h2>1. Who runs this site</h2>
<p><strong>cinepax.mg</strong> is published by Cinepax Madagascar, part of the Talys group, located at the Tana Water Front shopping centre, Antananarivo, Madagascar. Contact: <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> — +261 34 05 735 01.</p>
<p>The site is hosted by Vercel Inc. Ticketing runs on the Veezi platform (Vista Group). Customer accounts and purchase history are hosted on Supabase.</p>
<h2>2. What this document covers</h2>
<p>These terms govern access to and use of the site, account creation and browsing showtimes. Ticket purchases are governed by the <strong>terms of sale</strong>. How we handle your data is covered by the <strong>data protection policy</strong>.</p>
<p>Browsing the site means accepting these terms. If you do not accept them, do not use the site.</p>
<h2>3. Your account</h2>
<p>Creating an account requires a name, a valid email address and a password. The email address must be yours: it is where your tickets and purchase confirmations are sent.</p>
<p>Your password is personal. You remain responsible for purchases made from your account until you tell us it has been compromised. Contact <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> without delay if you suspect access you did not authorise.</p>
<p>You may ask us to close your account at any time. Tickets already purchased remain valid, and the accounting records tied to those purchases are kept for as long as the law requires.</p>
<h2>4. Expected use of the site</h2>
<p>You agree not to:</p>
<ul>
<li>disrupt the operation or security of the site, its accounts or its servers;</li>
<li>attempt to reach any part of the site not open to you, or another customer’s data;</li>
<li>extract site content in bulk by automated means;</li>
<li>post unlawful, threatening, defamatory or obscene content, or content infringing a third party’s rights;</li>
<li>resell tickets bought on this site outside the framework set out in the terms of sale.</li>
</ul>
<h2>5. What belongs to us</h2>
<p>The text, visual identity, Cinepax logo and layout of the site belong to us. Film posters, trailers, photographs and synopses belong to their distributors and are shown to promote screenings.</p>
<p>You may read and print these pages for personal use. Any other reproduction, adaptation or distribution requires our prior written agreement.</p>
<h2>6. Availability</h2>
<p>We work to keep the site available without being able to guarantee it continuously: maintenance, a supplier outage or a network failure may interrupt it. An interruption gives no right to compensation, but it does not void a ticket already paid for — it remains valid at the box office.</p>
<p>Showtimes, films and prices come from our scheduling system and may change. Only the information shown when you confirm your purchase binds Cinepax.</p>
<h2>7. Links to other sites</h2>
<p>The site may link to third-party sites — social networks, distributors, payment providers. We control neither their content nor their privacy practices, and linking to them is not an endorsement.</p>
<h2>8. Changes to these terms</h2>
<p>We may update these terms. The version number and effective date appear at the top of this page. A substantial change is flagged at your next sign-in, and your acceptance is requested again.</p>
<h2>9. Governing law</h2>
<p>These terms are governed by Malagasy law. Failing an amicable settlement, disputes fall to the competent courts of Antananarivo.</p>$html$
),

-- ─── 2. Conditions générales de vente ───────────────────────
(
  'cgv',
  'Conditions générales de vente',
  'Terms of sale',
  'L’achat en ligne est ferme et définitif : ce que cela engage, comment le billet est délivré, ce qui se passe si une séance est annulée.',
  'Online purchases are final: what that commits you to, how tickets are issued, what happens if a screening is cancelled.',
  TRUE, 'terms', NULL, NULL,
  TRUE, TRUE, 20,
  $html$<h2>1. Un achat, pas une réservation</h2>
<p>La vente en ligne sur cinepax.mg est un <strong>achat ferme et définitif</strong> d’une séance, à une date, dans une salle, avec des places attribuées. Ce n’est pas une réservation à confirmer en caisse : une fois le paiement validé, les places sont à vous et sortent de la vente.</p>
<p>En conséquence, et conformément à l’usage applicable aux prestations de loisirs à date déterminée, <strong>l’achat n’ouvre droit ni à rétractation, ni à annulation, ni à remboursement</strong>, sauf dans les cas prévus à l’article 6.</p>
<h2>2. Le prix</h2>
<p>Les prix sont affichés en ariary (MGA), toutes taxes comprises. Le tarif dépend du type de billet choisi et de la séance : une séance en soirée, un week-end ou en 3D ne se paie pas au même prix qu’une séance en semaine.</p>
<p>Le montant total, détaillé place par place, vous est présenté avant le paiement. C’est ce montant qui est débité, sans frais de dossier ni supplément ajouté après coup.</p>
<h2>3. Comment se déroule l’achat</h2>
<ol>
<li>Vous choisissez un film, puis une séance.</li>
<li>Vous sélectionnez vos places sur le plan de la salle. Elles sont retenues le temps de payer.</li>
<li>Vous réglez par Orange Money, MVola ou carte bancaire (BNI).</li>
<li>Vous recevez votre billet et son code de contrôle, à l’écran et par e-mail.</li>
</ol>
<p>Tant que le paiement n’est pas confirmé, les places ne sont pas acquises. Si vous quittez la page ou si le délai expire, elles retournent à la vente.</p>
<h2>4. Le paiement</h2>
<p>Le paiement est traité par nos partenaires : Orange Money, MVola et la BNI pour les cartes. <strong>Nous ne voyons ni ne conservons vos numéros de carte ni vos codes</strong> : ils sont saisis chez le prestataire, sur son infrastructure.</p>
<p>Nous conservons uniquement la méthode utilisée, la référence de transaction et le montant — ce qu’il faut pour retrouver un achat et prouver un paiement.</p>
<p>Un paiement refusé annule l’achat et libère les places. Aucun débit n’est conservé.</p>
<h2>5. Votre billet</h2>
<p>Le billet vous est délivré au format électronique, avec un code à présenter à l’entrée. Il est valable pour la séance, la salle et les places qui y figurent, et pour elles seules.</p>
<p>Présentez-vous en salle avant l’heure de début. <strong>Les places attribuées ne sont plus garanties une fois la séance commencée</strong>, et un retard n’ouvre droit à aucun remboursement.</p>
<p>Un billet ne peut être ni dupliqué ni revendu. Un même code présenté deux fois n’est accepté qu’une fois.</p>
<h2>6. Séance annulée ou modifiée</h2>
<p>Si Cinepax annule une séance, la déplace ou change de salle sans pouvoir vous proposer une place équivalente, vous avez le choix entre :</p>
<ul>
<li>une place sur une autre séance du même film ;</li>
<li>le remboursement intégral, par le même moyen de paiement.</li>
</ul>
<p>Le remboursement est engagé sous 14 jours à compter de votre demande. Le délai de mise à disposition dépend ensuite de votre opérateur ou de votre banque.</p>
<h2>7. Accès aux salles et classification</h2>
<p>L’accès à certaines séances est restreint par la classification du film. Un justificatif d’âge peut être demandé à l’entrée. <strong>Un refus d’accès pour non-respect de la classification n’ouvre droit à aucun remboursement</strong> : la classification est indiquée avant l’achat.</p>
<p>Les tarifs réduits sont accordés sur présentation d’un justificatif en cours de validité. À défaut, le complément est dû en caisse.</p>
<h2>8. Réclamations</h2>
<p>Écrivez-nous à <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> en indiquant votre référence d’achat, ou passez par le formulaire de contact du site. Nous répondons sous 48 heures ouvrées.</p>
<h2>9. Droit applicable</h2>
<p>Ces conditions sont régies par le droit malgache. À défaut d’accord amiable, le litige relève des juridictions compétentes d’Antananarivo.</p>$html$,
  $html$<h2>1. A purchase, not a booking</h2>
<p>Selling online on cinepax.mg is a <strong>firm and final purchase</strong> of a screening, on a date, in a specific auditorium, with assigned seats. It is not a booking to confirm at the box office: once payment clears, the seats are yours and leave the pool.</p>
<p>Accordingly, and in line with the practice applying to leisure services on a fixed date, <strong>a purchase carries no right of withdrawal, cancellation or refund</strong>, except in the cases set out in article 6.</p>
<h2>2. Price</h2>
<p>Prices are shown in ariary (MGA), all taxes included. The fare depends on the ticket type and the screening: an evening, weekend or 3D screening is not priced like a weekday one.</p>
<p>The total, itemised seat by seat, is shown before payment. That is the amount charged — no booking fee, no surcharge added afterwards.</p>
<h2>3. How a purchase works</h2>
<ol>
<li>You pick a film, then a screening.</li>
<li>You choose your seats on the auditorium plan. They are held while you pay.</li>
<li>You pay by Orange Money, MVola or bank card (BNI).</li>
<li>You receive your ticket and its check code, on screen and by email.</li>
</ol>
<p>Until payment is confirmed, the seats are not yours. If you leave the page or the hold expires, they return to sale.</p>
<h2>4. Payment</h2>
<p>Payment is handled by our partners: Orange Money, MVola, and BNI for cards. <strong>We neither see nor store your card numbers or codes</strong>: they are entered with the provider, on their infrastructure.</p>
<p>We keep only the method used, the transaction reference and the amount — what it takes to find a purchase and evidence a payment.</p>
<p>A declined payment cancels the purchase and releases the seats. No charge is retained.</p>
<h2>5. Your ticket</h2>
<p>The ticket is issued electronically, with a code to show at the door. It is valid for the screening, auditorium and seats printed on it, and for those alone.</p>
<p>Please arrive before the start time. <strong>Assigned seats are no longer guaranteed once a screening has begun</strong>, and lateness gives no right to a refund.</p>
<p>A ticket may not be duplicated or resold. The same code presented twice is accepted once.</p>
<h2>6. Cancelled or changed screenings</h2>
<p>If Cinepax cancels a screening, moves it or changes auditorium without being able to offer you an equivalent seat, you may choose between:</p>
<ul>
<li>a seat at another screening of the same film;</li>
<li>a full refund, by the same payment method.</li>
</ul>
<p>Refunds are initiated within 14 days of your request. How quickly the money reaches you then depends on your operator or bank.</p>
<h2>7. Admission and film ratings</h2>
<p>Admission to some screenings is restricted by the film’s rating. Proof of age may be requested at the door. <strong>Refused admission on rating grounds gives no right to a refund</strong>: the rating is shown before purchase.</p>
<p>Concession fares require valid proof. Without it, the difference is payable at the box office.</p>
<h2>8. Complaints</h2>
<p>Write to <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> with your purchase reference, or use the contact form on the site. We reply within 48 working hours.</p>
<h2>9. Governing law</h2>
<p>These terms are governed by Malagasy law. Failing an amicable settlement, disputes fall to the competent courts of Antananarivo.</p>$html$
),

-- ─── 3. Mention RGPD ────────────────────────────────────────
(
  'rgpd',
  'Mention RGPD et consentement',
  'GDPR notice and consent',
  'En clair : ce que nous collectons, pourquoi, combien de temps, et comment reprendre la main.',
  'In plain terms: what we collect, why, for how long, and how to take back control.',
  TRUE, 'privacy',
  'J’accepte que Cinepax Madagascar traite mes données personnelles pour gérer mon compte et mes achats, dans les conditions décrites.',
  'I agree that Cinepax Madagascar may process my personal data to manage my account and purchases, as described.',
  TRUE, TRUE, 30,
  $html$<h2>En une minute</h2>
<p>Créer un compte chez Cinepax, c’est nous confier quelques informations. Voici lesquelles, et à quoi elles servent. Le détail complet figure dans la <strong>politique de protection des données</strong> ; cette page en est le résumé fidèle.</p>
<h2>Qui est responsable</h2>
<p><strong>Cinepax Madagascar</strong>, Tana Water Front, Antananarivo, décide de ce qui est collecté et pourquoi. Pour toute question ou pour exercer vos droits : <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a>.</p>
<h2>Ce que nous collectons</h2>
<ul>
<li><strong>Votre identité</strong> — nom, adresse e-mail, numéro de téléphone. Vous les saisissez à l’inscription.</li>
<li><strong>Vos achats</strong> — films, séances, places, montants, moyen de paiement et référence de transaction.</li>
<li><strong>Vos échanges avec nous</strong> — les messages envoyés depuis le formulaire de contact.</li>
<li><strong>Votre consentement</strong> — la date, la version du document accepté et l’adresse IP d’où vient l’acceptation. C’est la preuve que ce consentement a bien été donné.</li>
</ul>
<p>Nous ne collectons <strong>aucune donnée sensible</strong> et <strong>aucun numéro de carte bancaire</strong> : les coordonnées de paiement sont saisies chez Orange Money, MVola ou la BNI, jamais chez nous.</p>
<h2>Pourquoi</h2>
<ul>
<li><strong>Exécuter votre achat</strong> — vous délivrer un billet valable, vous laisser retrouver vos achats. Sans ces données, pas de billet.</li>
<li><strong>Répondre à vos demandes</strong> — traiter un message, une réclamation.</li>
<li><strong>Respecter la loi</strong> — conserver les pièces comptables des ventes.</li>
<li><strong>Sécuriser le service</strong> — détecter les usages frauduleux d’un billet ou d’un compte.</li>
</ul>
<h2>Combien de temps</h2>
<p>Votre compte et son historique restent tant que le compte existe, puis <strong>36 mois</strong> après votre dernière activité. Les pièces comptables liées à une vente sont conservées pendant la durée légale de conservation, indépendamment de votre compte. Les messages de contact sont effacés 24 mois après leur clôture.</p>
<h2>Qui y a accès</h2>
<p>L’équipe Cinepax habilitée, et nos prestataires techniques strictement pour ce qu’ils exécutent : Veezi (billetterie), Supabase (base de données), Vercel (hébergement), Orange Money, MVola et la BNI (paiement). <strong>Aucune revente de données, aucun courtier publicitaire, aucun traçage à des fins de ciblage.</strong></p>
<h2>Vos droits</h2>
<p>Vous pouvez à tout moment demander à <strong>accéder</strong> à vos données, les faire <strong>corriger</strong>, en demander l’<strong>effacement</strong>, en obtenir une <strong>copie portable</strong>, ou <strong>vous opposer</strong> à un traitement. Écrivez à <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> : nous répondons sous 30 jours.</p>
<p>Retirer votre consentement est possible à tout moment et n’a pas d’effet rétroactif. En pratique, un retrait empêche de continuer à utiliser le compte, puisque plus rien ne permet d’y rattacher un billet.</p>
<p>Si notre réponse ne vous satisfait pas, vous pouvez saisir la <strong>Commission Malagasy sur l’Informatique et des Libertés (CMIL)</strong>, autorité compétente au titre de la loi n° 2014-038, ou l’autorité de protection des données de votre pays de résidence si vous relevez du RGPD.</p>
<h2>Ce que vous acceptez en cochant</h2>
<p>En cochant la case correspondante, vous confirmez avoir lu cette mention et acceptez que Cinepax Madagascar traite vos données pour les finalités listées ci-dessus. Cette acceptation est enregistrée avec sa date et le numéro de version de ce document.</p>$html$,
  $html$<h2>In one minute</h2>
<p>Creating a Cinepax account means trusting us with a few details. Here is what they are and what they are for. The full detail is in the <strong>data protection policy</strong>; this page is a faithful summary of it.</p>
<h2>Who is responsible</h2>
<p><strong>Cinepax Madagascar</strong>, Tana Water Front, Antananarivo, decides what is collected and why. For any question, or to exercise your rights: <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a>.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Your identity</strong> — name, email address, phone number. You enter these when signing up.</li>
<li><strong>Your purchases</strong> — films, screenings, seats, amounts, payment method and transaction reference.</li>
<li><strong>Your messages to us</strong> — anything sent through the contact form.</li>
<li><strong>Your consent</strong> — the date, the version of the document accepted, and the IP address it came from. This is the evidence that consent was given.</li>
</ul>
<p>We collect <strong>no sensitive data</strong> and <strong>no card numbers</strong>: payment details are entered with Orange Money, MVola or BNI, never with us.</p>
<h2>Why</h2>
<ul>
<li><strong>To fulfil your purchase</strong> — issue a valid ticket, let you find your purchases again. Without this data, there is no ticket.</li>
<li><strong>To answer you</strong> — handle a message or a complaint.</li>
<li><strong>To comply with the law</strong> — keep the accounting records of sales.</li>
<li><strong>To keep the service safe</strong> — detect fraudulent use of a ticket or an account.</li>
</ul>
<h2>For how long</h2>
<p>Your account and its history stay for as long as the account exists, then <strong>36 months</strong> after your last activity. Accounting records tied to a sale are kept for the statutory retention period, independently of your account. Contact messages are deleted 24 months after they are closed.</p>
<h2>Who has access</h2>
<p>Authorised Cinepax staff, and our technical providers strictly for what they carry out: Veezi (ticketing), Supabase (database), Vercel (hosting), Orange Money, MVola and BNI (payment). <strong>No data is sold, no ad broker is involved, no tracking for targeting purposes.</strong></p>
<h2>Your rights</h2>
<p>At any time you may ask to <strong>access</strong> your data, have it <strong>corrected</strong>, request its <strong>erasure</strong>, obtain a <strong>portable copy</strong>, or <strong>object</strong> to a processing operation. Write to <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a>: we reply within 30 days.</p>
<p>You may withdraw your consent at any time, without retroactive effect. In practice, withdrawal ends use of the account, since nothing remains to attach a ticket to.</p>
<p>If our answer does not satisfy you, you may refer the matter to the <strong>Commission Malagasy sur l’Informatique et des Libertés (CMIL)</strong>, the authority competent under law no. 2014-038, or to the data protection authority of your country of residence if you fall under the GDPR.</p>
<h2>What you accept by ticking</h2>
<p>By ticking the matching box, you confirm you have read this notice and agree that Cinepax Madagascar may process your data for the purposes listed above. That acceptance is recorded with its date and the version number of this document.</p>$html$
),

-- ─── 4. Politique de protection des données ─────────────────
(
  'pdd',
  'Politique de protection des données',
  'Data protection policy',
  'Le document détaillé : chaque traitement, sa base légale, sa durée, ses destinataires.',
  'The detailed document: every processing operation, its legal basis, retention and recipients.',
  FALSE, NULL, NULL, NULL,
  TRUE, TRUE, 40,
  $html$<h2>1. Objet</h2>
<p>Cette politique décrit comment Cinepax Madagascar collecte, utilise, conserve et protège les données personnelles des visiteurs et clients de cinepax.mg. Elle applique le règlement (UE) 2016/679 (RGPD) et la loi malgache n° 2014-038 sur la protection des données à caractère personnel.</p>
<h2>2. Responsable du traitement</h2>
<p><strong>Cinepax Madagascar</strong> — groupe Talys<br>Tana Water Front, Antananarivo, Madagascar<br>Contact : <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> — +261 34 05 735 01</p>
<h2>3. Les traitements, un par un</h2>
<h3>3.1 Gestion du compte client</h3>
<p><strong>Données</strong> : nom, adresse e-mail, téléphone, mot de passe (stocké sous forme de condensat, jamais en clair), date de création.<br><strong>Base légale</strong> : exécution du contrat.<br><strong>Conservation</strong> : durée de vie du compte, puis 36 mois après la dernière activité.</p>
<h3>3.2 Achat de billets</h3>
<p><strong>Données</strong> : film, séance, salle, places attribuées, montants, moyen de paiement, référence de transaction, code du billet, statut d’utilisation.<br><strong>Base légale</strong> : exécution du contrat, et obligation légale pour le volet comptable.<br><strong>Conservation</strong> : 36 mois dans l’espace client ; la durée légale applicable pour les pièces comptables.</p>
<h3>3.3 Paiement</h3>
<p><strong>Données</strong> : méthode retenue, montant, référence de transaction, statut.<br><strong>Ce que nous ne détenons pas</strong> : numéro de carte, cryptogramme, code PIN, identifiants de portefeuille mobile. Ces éléments sont saisis directement chez Orange Money, MVola ou la BNI et ne transitent jamais par nos serveurs.<br><strong>Base légale</strong> : exécution du contrat.</p>
<h3>3.4 Formulaire de contact</h3>
<p><strong>Données</strong> : nom, e-mail, téléphone, objet, message, langue.<br><strong>Base légale</strong> : intérêt légitime à répondre aux demandes qui nous sont adressées.<br><strong>Conservation</strong> : 24 mois après clôture de la demande.</p>
<h3>3.5 Preuve du consentement</h3>
<p><strong>Données</strong> : document accepté, numéro de version, date et heure, écran d’origine, adresse IP, agent utilisateur.<br><strong>Base légale</strong> : obligation légale de démontrer le consentement.<br><strong>Conservation</strong> : 5 ans à compter du retrait ou de l’expiration du consentement.</p>
<h3>3.6 Sécurité et journaux techniques</h3>
<p><strong>Données</strong> : journaux d’accès de l’hébergeur, tentatives d’authentification, erreurs applicatives.<br><strong>Base légale</strong> : intérêt légitime à protéger le service.<br><strong>Conservation</strong> : 12 mois au plus.</p>
<h2>4. Sous-traitants et transferts</h2>
<ul>
<li><strong>Supabase</strong> — base de données et authentification.</li>
<li><strong>Vercel Inc.</strong> — hébergement et diffusion du site.</li>
<li><strong>Veezi / Vista Group</strong> — billetterie, plan de salle, émission des billets.</li>
<li><strong>Orange Money, MVola, BNI</strong> — encaissement des paiements.</li>
</ul>
<p>Certains de ces prestataires opèrent des infrastructures hors de Madagascar, notamment dans l’Union européenne. Ces transferts s’appuient sur les garanties contractuelles prévues par le RGPD. Aucun sous-traitant n’est autorisé à utiliser vos données pour son propre compte.</p>
<h2>5. Cookies et traceurs</h2>
<p>Le site n’utilise <strong>ni cookie publicitaire, ni traceur de mesure d’audience tiers</strong>. Seuls sont déposés les éléments nécessaires à son fonctionnement : maintien de votre session une fois connecté, mémorisation de la langue choisie, mémorisation de votre passage sur le bandeau d’information. Ces éléments ne demandent pas de consentement préalable, et vous pouvez les effacer depuis votre navigateur — au prix d’une reconnexion.</p>
<h2>6. Sécurité</h2>
<p>Les échanges avec le site sont chiffrés en transit (HTTPS). L’accès aux données est cloisonné par des règles au niveau de la base : un client ne peut lire que ses propres achats et ses propres messages. Les opérations d’administration exigent une authentification et un profil habilité. Les mots de passe sont stockés sous forme de condensat salé, irréversible.</p>
<h2>7. Vos droits et comment les exercer</h2>
<p>Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition, ainsi que du droit de retirer votre consentement à tout moment.</p>
<p>Adressez votre demande à <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a>, depuis l’adresse e-mail associée à votre compte. Nous répondons dans un délai de 30 jours. Une pièce d’identité peut vous être demandée si un doute subsiste sur l’identité du demandeur.</p>
<p>Certaines demandes se heurtent à une obligation légale : nous ne pouvons pas effacer les pièces comptables d’une vente avant la fin du délai de conservation imposé. Dans ce cas, les données sont isolées et ne servent plus qu’à cette obligation.</p>
<h2>8. Réclamation</h2>
<p>Vous pouvez saisir la <strong>Commission Malagasy sur l’Informatique et des Libertés (CMIL)</strong>, ou l’autorité de protection des données de votre pays de résidence si vous relevez du RGPD.</p>
<h2>9. Évolution de cette politique</h2>
<p>Toute évolution est publiée sur cette page, avec un nouveau numéro de version et une nouvelle date d’entrée en vigueur. Un changement substantiel donne lieu à une nouvelle demande de consentement lors de votre prochaine connexion.</p>$html$,
  $html$<h2>1. Purpose</h2>
<p>This policy describes how Cinepax Madagascar collects, uses, retains and protects the personal data of cinepax.mg visitors and customers. It applies Regulation (EU) 2016/679 (GDPR) and Malagasy law no. 2014-038 on the protection of personal data.</p>
<h2>2. Data controller</h2>
<p><strong>Cinepax Madagascar</strong> — Talys group<br>Tana Water Front, Antananarivo, Madagascar<br>Contact: <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a> — +261 34 05 735 01</p>
<h2>3. Processing operations, one by one</h2>
<h3>3.1 Customer account</h3>
<p><strong>Data</strong>: name, email address, phone, password (stored as a hash, never in clear text), creation date.<br><strong>Legal basis</strong>: performance of the contract.<br><strong>Retention</strong>: lifetime of the account, then 36 months after last activity.</p>
<h3>3.2 Ticket purchases</h3>
<p><strong>Data</strong>: film, screening, auditorium, assigned seats, amounts, payment method, transaction reference, ticket code, usage status.<br><strong>Legal basis</strong>: performance of the contract, and legal obligation for the accounting side.<br><strong>Retention</strong>: 36 months in the customer area; the applicable statutory period for accounting records.</p>
<h3>3.3 Payment</h3>
<p><strong>Data</strong>: method chosen, amount, transaction reference, status.<br><strong>What we do not hold</strong>: card number, security code, PIN, mobile wallet credentials. These are entered directly with Orange Money, MVola or BNI and never pass through our servers.<br><strong>Legal basis</strong>: performance of the contract.</p>
<h3>3.4 Contact form</h3>
<p><strong>Data</strong>: name, email, phone, subject, message, language.<br><strong>Legal basis</strong>: legitimate interest in answering enquiries addressed to us.<br><strong>Retention</strong>: 24 months after the enquiry is closed.</p>
<h3>3.5 Proof of consent</h3>
<p><strong>Data</strong>: document accepted, version number, date and time, originating screen, IP address, user agent.<br><strong>Legal basis</strong>: legal obligation to demonstrate consent.<br><strong>Retention</strong>: 5 years from withdrawal or expiry of the consent.</p>
<h3>3.6 Security and technical logs</h3>
<p><strong>Data</strong>: host access logs, authentication attempts, application errors.<br><strong>Legal basis</strong>: legitimate interest in protecting the service.<br><strong>Retention</strong>: 12 months at most.</p>
<h2>4. Processors and transfers</h2>
<ul>
<li><strong>Supabase</strong> — database and authentication.</li>
<li><strong>Vercel Inc.</strong> — hosting and delivery of the site.</li>
<li><strong>Veezi / Vista Group</strong> — ticketing, seat plans, ticket issuance.</li>
<li><strong>Orange Money, MVola, BNI</strong> — payment collection.</li>
</ul>
<p>Some of these providers run infrastructure outside Madagascar, notably in the European Union. Those transfers rely on the contractual safeguards provided for by the GDPR. No processor is permitted to use your data on its own account.</p>
<h2>5. Cookies and trackers</h2>
<p>The site uses <strong>no advertising cookies and no third-party analytics trackers</strong>. Only what the site needs to work is stored: keeping you signed in, remembering your chosen language, remembering that you have seen the information banner. These require no prior consent, and you can clear them from your browser — at the cost of signing in again.</p>
<h2>6. Security</h2>
<p>Traffic to the site is encrypted in transit (HTTPS). Access to data is partitioned by rules at database level: a customer can read only their own purchases and messages. Administrative operations require authentication and an authorised profile. Passwords are stored as salted, irreversible hashes.</p>
<h2>7. Your rights and how to exercise them</h2>
<p>You have rights of access, rectification, erasure, restriction, portability and objection, as well as the right to withdraw consent at any time.</p>
<p>Send your request to <a href="mailto:contact@cinepax.mg">contact@cinepax.mg</a>, from the email address linked to your account. We reply within 30 days. Proof of identity may be requested if doubt remains as to who is asking.</p>
<p>Some requests meet a legal obligation: we cannot erase the accounting records of a sale before the imposed retention period ends. In that case the data is isolated and serves that obligation alone.</p>
<h2>8. Complaints</h2>
<p>You may refer a matter to the <strong>Commission Malagasy sur l’Informatique et des Libertés (CMIL)</strong>, or to the data protection authority of your country of residence if you fall under the GDPR.</p>
<h2>9. Changes to this policy</h2>
<p>Any change is published on this page, with a new version number and a new effective date. A substantial change triggers a fresh consent request at your next sign-in.</p>$html$
)

ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────
--  SECTION 8 — VÉRIFICATION
-- ────────────────────────────────────────────────────────────
--  À exécuter après coup pour contrôler l'installation :
--
--    SELECT slug, version, requires_consent, consent_group,
--           is_published, in_footer, sort_order
--    FROM   public.legal_documents
--    ORDER  BY sort_order;
--
--    SELECT slug, version, count(*) FROM public.legal_document_revisions
--    GROUP BY slug, version ORDER BY slug;
