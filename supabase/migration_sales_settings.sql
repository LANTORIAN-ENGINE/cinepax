-- ============================================================
--  CINEPAX MADAGASCAR — Fermeture de la vente en ligne
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
--  (idempotent : réexécutable sans écraser le réglage en place)
-- ============================================================
--
--  Le problème
--  -----------
--  Une séance ouverte à la vente dans le back-office Veezi reste achetable
--  en ligne jusqu'à son horaire exact. Un client peut donc payer une place
--  pour un film qui commence dans cinq minutes, arriver après le début, et
--  se retourner vers la caisse. Le cinéma veut refermer la vente en ligne
--  un peu avant la séance, sans toucher à la programmation Veezi.
--
--  Le réglage
--  ----------
--  Un seul nombre, en minutes, valable pour toutes les séances : le délai
--  de fermeture. Avec 60, toute séance qui commence dans moins de soixante
--  minutes disparaît des écrans de vente et n'est plus achetable. Zéro
--  rétablit le comportement d'avant (vente jusqu'à l'horaire).
--
--  Il se règle dans /admin/parametres, sans redéploiement, et vaut aussi
--  bien pour l'affichage (tunnel d'achat) que pour l'écriture :
--  /api/bookings/create le revérifie sur l'horaire Veezi avant d'ouvrir un
--  achat — un onglet resté ouvert ne doit pas pouvoir en démarrer un.
--  La barrière est posée là, avant le paiement, et nulle part après : une
--  fois la somme encaissée, refuser la place ne protégerait plus personne.
--
--  Le programme de la semaine
--  --------------------------
--  hide_in_programme tranche un cas qui n'est pas une question de vente
--  mais d'information : /programme est un horaire, pas une caisse. Par
--  défaut les séances refermées y restent visibles, marquées « en vente à
--  la caisse » — le client qui habite à dix minutes doit pouvoir lire que
--  la séance de 18 h 30 existe. Coché, elles en disparaissent aussi.

CREATE TABLE IF NOT EXISTS public.sales_settings (
  -- Ligne unique : ces réglages valent pour tout le site.
  id                 INTEGER     PRIMARY KEY DEFAULT 1,

  -- Délai de fermeture de la vente en ligne, en minutes avant le début de
  -- la séance. 0 = vente ouverte jusqu'à l'horaire. Plafond à 1440 (24 h) :
  -- au-delà, ce n'est plus une fermeture, c'est un déprogrammage.
  cutoff_minutes     INTEGER     NOT NULL DEFAULT 60,

  -- Masquer aussi les séances refermées du programme de la semaine.
  -- Par défaut non : le programme informe, il ne vend pas.
  hide_in_programme  BOOLEAN     NOT NULL DEFAULT FALSE,

  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT sales_settings_singleton CHECK (id = 1),
  CONSTRAINT sales_settings_cutoff_range CHECK (cutoff_minutes BETWEEN 0 AND 1440)
);

COMMENT ON TABLE  public.sales_settings IS
  'Réglages de vente en ligne (ligne unique id=1). Édités dans /admin/parametres.';
COMMENT ON COLUMN public.sales_settings.cutoff_minutes IS
  'Minutes avant la séance où la vente en ligne se referme. 0 = jusqu''à l''horaire.';
COMMENT ON COLUMN public.sales_settings.hide_in_programme IS
  'Masquer les séances refermées du programme de la semaine (défaut : elles restent visibles).';

-- Le réglage initial. ON CONFLICT DO NOTHING : réexécuter ce script ne
-- remet jamais 60 minutes à la place de la valeur choisie dans l'admin.
INSERT INTO public.sales_settings (id, cutoff_minutes, hide_in_programme)
VALUES (1, 60, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
--  SÉCURITÉ
-- ────────────────────────────────────────────────────────────
-- Lecture publique : le tunnel d'achat a besoin du délai pour savoir quoi
-- afficher, et il n'y a rien de confidentiel dans un nombre de minutes.
-- Aucune policy d'écriture : les modifications passent par
-- /api/admin/ventes (service role, après vérification is_admin), comme
-- pour legal_settings.

ALTER TABLE public.sales_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_settings_public_select" ON public.sales_settings;
CREATE POLICY "sales_settings_public_select" ON public.sales_settings
  FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────────────────
--  VÉRIFICATION
-- ────────────────────────────────────────────────────────────
-- SELECT cutoff_minutes, hide_in_programme, updated_at FROM public.sales_settings;
