-- ============================================================
--  CINEPAX MADAGASCAR — L'administrateur voit tous les achats,
--  et chaque achat porte enfin l'adresse de son acheteur
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
--  (idempotent : réexécutable sans rien perdre)
-- ============================================================
--
--  Le symptôme
--  -----------
--  Dans /admin/reservations, la colonne « Email » — et le téléphone du
--  panneau de détail — sont vides sur toutes les lignes, alors que des
--  achats ont bien été faits et que l'email est obligatoire au paiement.
--
--  Trois causes, empilées
--  ----------------------
--  1. L'email n'est obligatoire QUE pour un visiteur non connecté.
--     components/PaymentForm.jsx envoie `guestEmail: user ? null : …` :
--     pour un client connecté, l'adresse est réputée connue du compte, et
--     bookings.guest_email est écrit NULL. Personne, ensuite, ne va la
--     rechercher — ni l'espace d'administration, ni /api/veezi/reserve,
--     qui transmet un `CustomerEmail: ''` au cinéma.
--
--  2. auth.users est hors de portée du navigateur. Le profil public
--     (public.profiles) ne porte même pas de colonne email — seulement le
--     téléphone. Une simple jointure côté client ne pouvait donc pas
--     retrouver l'adresse, quoi qu'on fasse.
--
--  3. La seule policy de lecture sur bookings est « auth.uid() = user_id ».
--     L'espace d'administration lit avec la clé anon et la session de
--     l'admin : il ne voyait que les achats de l'admin lui-même. Les achats
--     invités — les seuls dont guest_email était rempli — n'apparaissaient
--     pas du tout. D'où une liste où *toutes* les adresses manquent.
--
--  Ce que ce script pose
--  ---------------------
--  a) est_admin() : la question « celui qui interroge est-il administrateur »
--     posée une fois, en SECURITY DEFINER, pour que les policies puissent
--     la poser sans se relire elles-mêmes (récursion RLS sur profiles).
--
--  b) Un déclencheur qui complète guest_email / guest_phone à l'insertion
--     quand l'achat vient d'un compte. La colonne cesse de vouloir dire
--     « adresse d'un invité » pour dire « adresse de contact de cet achat »
--     — ce qu'un billet doit porter de toute façon : c'est la pièce qui dit
--     à qui envoyer le QR et qui présenter à la caisse. Aucune modification
--     de code n'est nécessaire : /admin/reservations, /admin/clients et
--     l'envoi vers Veezi lisent déjà cette colonne.
--
--  c) Le rattrapage des achats déjà enregistrés.
--
--  d) Les policies d'administration : lecture de tous les achats, de leurs
--     places et de tous les profils, plus l'écriture du statut (le bouton
--     « marquer utilisé » de /admin/reservations échouait en silence, faute
--     de la moindre policy UPDATE). Les suppressions et annulations passent
--     déjà par le service role côté serveur : rien à ouvrir pour elles.

-- ────────────────────────────────────────────────────────────
--  1 — Qui est administrateur
-- ────────────────────────────────────────────────────────────
-- SECURITY DEFINER : la fonction lit profiles en s'affranchissant de RLS.
-- Sans cela, une policy sur profiles qui interroge profiles boucle sur
-- elle-même (42P17). search_path figé : une fonction DEFINER ne doit jamais
-- résoudre ses tables par le chemin de l'appelant.
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
--  2 — Chaque achat porte l'adresse de son acheteur
-- ────────────────────────────────────────────────────────────
-- Achat d'un compte : l'adresse vient de auth.users, le téléphone de
-- profiles (rempli à l'inscription depuis raw_user_meta_data). Achat
-- invité : le tunnel a déjà rempli les deux, on n'y touche pas.
-- COALESCE partout : ce déclencheur complète, il n'écrase jamais.
CREATE OR REPLACE FUNCTION public.bookings_completer_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(COALESCE(NEW.guest_email, '')), '') IS NULL THEN
    SELECT NULLIF(BTRIM(u.email), '')
      INTO NEW.guest_email
      FROM auth.users u
     WHERE u.id = NEW.user_id;
  END IF;

  IF NULLIF(BTRIM(COALESCE(NEW.guest_phone, '')), '') IS NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(p.phone), ''), NULLIF(BTRIM(u.phone), ''))
      INTO NEW.guest_phone
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
     WHERE u.id = NEW.user_id;
  END IF;

  IF NULLIF(BTRIM(COALESCE(NEW.guest_name, '')), '') IS NULL THEN
    SELECT NULLIF(BTRIM(p.full_name), '')
      INTO NEW.guest_name
      FROM public.profiles p
     WHERE p.id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_completer_contact ON public.bookings;
CREATE TRIGGER bookings_completer_contact
  BEFORE INSERT OR UPDATE OF user_id, guest_email, guest_phone, guest_name
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_completer_contact();

-- ────────────────────────────────────────────────────────────
--  3 — Rattrapage des achats déjà enregistrés
-- ────────────────────────────────────────────────────────────
-- Une écriture neutre suffit : le déclencheur ci-dessus fait le travail.
-- Ne touche que les lignes d'un compte à qui il manque quelque chose.
UPDATE public.bookings
   SET user_id = user_id
 WHERE user_id IS NOT NULL
   AND (
     NULLIF(BTRIM(COALESCE(guest_email, '')), '') IS NULL OR
     NULLIF(BTRIM(COALESCE(guest_phone, '')), '') IS NULL OR
     NULLIF(BTRIM(COALESCE(guest_name,  '')), '') IS NULL
   );

-- ────────────────────────────────────────────────────────────
--  4 — Ce que l'administrateur a le droit de voir et de faire
-- ────────────────────────────────────────────────────────────
-- Les policies existantes (bookings_own_select, booking_seats_own,
-- profiles_own) restent en place : elles disent ce que voit un client.
-- Celles-ci s'y ajoutent — PostgreSQL fait l'union des policies PERMISSIVE.

-- Tous les achats, invités compris.
DROP POLICY IF EXISTS "bookings_admin_select" ON public.bookings;
CREATE POLICY "bookings_admin_select" ON public.bookings
  FOR SELECT
  USING (public.est_admin());

-- Le statut d'un achat (confirmé / utilisé / annulé) se change depuis
-- l'écran d'administration, à la clé anon. Sans cette policy, l'ordre
-- partait, ne trouvait aucune ligne, et l'écran affichait un succès.
DROP POLICY IF EXISTS "bookings_admin_update" ON public.bookings;
CREATE POLICY "bookings_admin_update" ON public.bookings
  FOR UPDATE
  USING (public.est_admin())
  WITH CHECK (public.est_admin());

-- Les places de n'importe quel achat : sans elles, la colonne « Sièges »
-- reste à « — » même une fois les achats visibles.
DROP POLICY IF EXISTS "booking_seats_admin_select" ON public.booking_seats;
CREATE POLICY "booking_seats_admin_select" ON public.booking_seats
  FOR SELECT
  USING (public.est_admin());

-- Tous les profils : c'est la liste de /admin/clients.
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT
  USING (public.est_admin());

-- ────────────────────────────────────────────────────────────
--  Vérification (à lancer après, dans le même éditeur)
-- ────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE guest_email IS NULL) AS sans_email,
--        count(*) FILTER (WHERE user_id IS NOT NULL) AS achats_compte,
--        count(*) AS total
--   FROM public.bookings;
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE tablename IN ('bookings', 'booking_seats', 'profiles')
--  ORDER BY tablename, policyname;
--
-- Et, connecté au site avec le compte administrateur, recharger
-- /admin/reservations : les achats invités apparaissent, les achats
-- compte portent leur adresse.
