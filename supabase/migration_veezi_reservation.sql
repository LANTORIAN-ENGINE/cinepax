-- ════════════════════════════════════════════════════════════
--  Réservation Veezi (Connect) après paiement
--  Ajoute le suivi de la réservation créée côté Veezi + le détail
--  des types de billets nécessaires à order/tickets.
--  À exécuter dans l'éditeur SQL Supabase.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ticket_breakdown      JSONB,   -- [{code, description, priceInCents, qty}]
  ADD COLUMN IF NOT EXISTS veezi_booking_number  TEXT,    -- VistaBookingNumber (ex: 27571)
  ADD COLUMN IF NOT EXISTS veezi_booking_id      TEXT,    -- VistaBookingId    (ex: WK7ZFQ4)
  ADD COLUMN IF NOT EXISTS veezi_user_session_id TEXT,    -- panier Connect utilisé
  ADD COLUMN IF NOT EXISTS veezi_status          TEXT;    -- reserved | failed | skipped | NULL
