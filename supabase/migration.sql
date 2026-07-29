-- ============================================================
--  CINEPAX MADAGASCAR — Migration initiale
--  À exécuter une seule fois dans :
--  Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  SECTION 1 — TABLES
-- ────────────────────────────────────────────────────────────

-- Profils utilisateurs (étend auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name    TEXT,
  phone        TEXT,
  is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Types de billets, alimentés depuis PriceCardName de l'API Veezi
-- (ingestion via /admin/prix → "Scanner les séances")
CREATE TABLE IF NOT EXISTS public.price_cards (
  id           SERIAL      PRIMARY KEY,
  veezi_name   TEXT        UNIQUE NOT NULL,   -- valeur exacte PriceCardName Veezi
  display_name TEXT,                          -- libellé affiché clients (éditable)
  color        TEXT        NOT NULL DEFAULT '#e8192c',
  price_cents  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catégories physiques de sièges par salle (Standard, VIP, PMR…)
CREATE TABLE IF NOT EXISTS public.seat_categories (
  id               SERIAL      PRIMARY KEY,
  screen_id        INTEGER     NOT NULL,
  name             TEXT        NOT NULL,
  color            TEXT        NOT NULL DEFAULT '#4a9eff',
  description      TEXT,
  base_price_cents INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prix spécifique par séance Veezi (override sur price_cards)
CREATE TABLE IF NOT EXISTS public.session_prices (
  id           SERIAL      PRIMARY KEY,
  session_id   TEXT        UNIQUE NOT NULL,   -- ID de la session côté Veezi
  film_id      TEXT        NOT NULL,
  film_title   TEXT        NOT NULL,
  screen_id    INTEGER     NOT NULL,
  session_time TIMESTAMPTZ NOT NULL,
  price_cents  INTEGER     NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Réservations web
CREATE TABLE IF NOT EXISTS public.bookings (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_ref        TEXT        UNIQUE NOT NULL,  -- ex: CPX-20240606-AB3XY
  user_id            UUID        REFERENCES auth.users(id),  -- NULL si visiteur
  guest_name         TEXT,
  guest_email        TEXT,
  guest_phone        TEXT,
  session_id         TEXT        NOT NULL,
  film_id            TEXT        NOT NULL,
  film_title         TEXT        NOT NULL,
  screen_id          INTEGER     NOT NULL,
  screen_name        TEXT,
  session_time       TIMESTAMPTZ NOT NULL,
  total_amount_cents INTEGER     NOT NULL DEFAULT 0,
  payment_method         TEXT,                          -- orange | mvola | card
  payment_status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  payment_ref            TEXT,
  payment_transaction_id TEXT,                          -- ID transaction BNI Pay (callback IMN)
  qr_code_data       TEXT,                          -- JSON { ref, film, session, seats[] }
  status             TEXT        NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | used
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Détail des sièges par réservation
CREATE TABLE IF NOT EXISTS public.booking_seats (
  id                 SERIAL  PRIMARY KEY,
  booking_id         UUID    REFERENCES public.bookings(id) ON DELETE CASCADE,
  row_name           TEXT    NOT NULL,   -- ex: 'A', 'B'
  seat_number        INTEGER NOT NULL,   -- ex: 5
  display_key        TEXT    NOT NULL,   -- ex: 'A5'
  category_id        INTEGER REFERENCES public.seat_categories(id),
  price_cents        INTEGER NOT NULL DEFAULT 0,
  area_category_code TEXT,
  area_number        INTEGER,
  row_index          INTEGER,
  column_index       INTEGER
);

-- ────────────────────────────────────────────────────────────
--  SECTION 2 — TRIGGER : création automatique du profil
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
--  SECTION 3 — ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

-- Activer RLS
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_cards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_prices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_seats   ENABLE ROW LEVEL SECURITY;

-- profiles : chaque utilisateur lit/modifie son propre profil
-- (les admins accèdent via service_role key → bypass RLS)
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- price_cards : lecture publique (prix visibles par tous)
DROP POLICY IF EXISTS "price_cards_read" ON public.price_cards;
CREATE POLICY "price_cards_read" ON public.price_cards
  FOR SELECT USING (true);

-- seat_categories : lecture publique
DROP POLICY IF EXISTS "seat_categories_read" ON public.seat_categories;
CREATE POLICY "seat_categories_read" ON public.seat_categories
  FOR SELECT USING (true);

-- session_prices : lecture publique
DROP POLICY IF EXISTS "session_prices_read" ON public.session_prices;
CREATE POLICY "session_prices_read" ON public.session_prices
  FOR SELECT USING (true);

-- bookings : un utilisateur ne voit que ses propres réservations
-- les réservations invités (user_id IS NULL) ne sont pas accessibles côté client
DROP POLICY IF EXISTS "bookings_own_select" ON public.bookings;
CREATE POLICY "bookings_own_select" ON public.bookings
  FOR SELECT
  USING (auth.uid() = user_id);

-- booking_seats : accessibles si la réservation appartient à l'utilisateur
DROP POLICY IF EXISTS "booking_seats_own" ON public.booking_seats;
CREATE POLICY "booking_seats_own" ON public.booking_seats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_seats.booking_id
        AND b.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
--  SECTION 4 — DONNÉES INITIALES
-- ────────────────────────────────────────────────────────────

-- Catégories physiques par défaut pour les 4 salles Cinepax
-- (peuvent être enrichies / modifiées dans /admin/prix)
-- 700000 centimes = 7 000 Ar | 1200000 = 12 000 Ar
INSERT INTO public.seat_categories (screen_id, name, color, description, base_price_cents)
VALUES
  (1, 'Standard', '#4a9eff', 'Places standard',  700000),
  (1, 'VIP',      '#e8192c', 'Places VIP',       1200000),
  (2, 'Standard', '#4a9eff', 'Places standard',  700000),
  (2, 'VIP',      '#e8192c', 'Places VIP',       1200000),
  (3, 'Standard', '#4a9eff', 'Places standard',  700000),
  (3, 'VIP',      '#e8192c', 'Places VIP',       1200000),
  (4, 'Standard', '#4a9eff', 'Places standard',  700000),
  (4, 'VIP',      '#e8192c', 'Places VIP',       1200000)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
--  SECTION 5 — HELPER : promouvoir un utilisateur en admin
-- ────────────────────────────────────────────────────────────
-- Remplacer 'email@example.mg' par l'email du compte admin voulu,
-- puis décommenter et exécuter après la première inscription.

-- UPDATE public.profiles
-- SET is_admin = TRUE
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'email@example.mg' LIMIT 1
-- );
