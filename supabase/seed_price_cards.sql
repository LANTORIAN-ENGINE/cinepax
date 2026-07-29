-- Grilles tarifaires — amorçage de price_cards
--
-- ⚠ À RELIRE AVANT EXÉCUTION. Ces montants sont relevés sur l'affiche des
-- tarifs de cinepax.mg (public/content/offres-tarifs.jpg), pas sur une API :
-- personne ne les a confirmés. Ils engagent des paiements réels — faites-les
-- valider par Cinepax avant de lancer ce script.
--
-- Pourquoi ce fichier existe : la page « Nos offres » sait déduire des séances
-- Veezi quelles grilles sont en vigueur (PriceCardName) et quels jours elles
-- couvrent, mais pas leurs montants. Deux sources possibles :
--   1. Connect /RESTData.svc/{cinema}/sessions/{id}/tickets — indisponible tant
--      que le canal de vente CINEP n'est pas coché dans la grille Veezi
--      (renvoie aujourd'hui ResponseCode 50).
--   2. cette table, éditable depuis /admin/prix.
-- Dès que l'une des deux répond, la page affiche les tarifs sans intervention.
--
-- veezi_name doit correspondre exactement au PriceCardName renvoyé par
-- /v1/session. Les sept valeurs observées au 30/07/2026 sont couvertes ci-dessous.
--
-- price_cents suit la convention du projet : montant en ariary × 100.

insert into price_cards (veezi_name, display_name, price_cents, color) values
  -- Adultes, du lundi au vendredi — 30 000 Ar
  ('SEMAINE',           'Semaine (lun. – ven.)',      3000000, '#2f6fb0'),

  -- Adultes, samedi et dimanche — 35 000 Ar
  ('WEEK_END',          'Week-end (sam. – dim.)',     3500000, '#7a4fa8'),

  -- Bon plan du mardi — 20 000 Ar pour les adultes
  ('MARDI',             'Bon plan mardi',             2000000, '#e8192c'),

  -- Séances du matin le week-end — 20 000 Ar
  ('WEEK_END MATIN',    'Séance du matin',            2000000, '#e5a014'),

  -- Offre duo du jeudi : l'affiche annonce 40 000 Ar pour 2 places.
  -- price_cents étant un prix unitaire, on enregistre la moitié.
  -- À confirmer : Veezi peut aussi porter cette grille comme un tarif de groupe.
  ('JEUDI',             'Offre duo jeudi (par place)', 2000000, '#1f9d76'),

  -- Avant-première — 40 000 Ar (déduit du nom de la grille « AVP 40 »)
  ('AVP 40',            'Avant-première',             4000000, '#c2410c'),

  -- Grille ponctuelle, montant inconnu : laissée à 0 pour rester visible
  -- dans /admin/prix sans afficher de tarif faux côté public.
  ('Semaine - SPECIALE', 'Semaine — séance spéciale',       0, '#6b7280')

on conflict (veezi_name) do update set
  display_name = excluded.display_name,
  price_cents  = excluded.price_cents,
  color        = excluded.color,
  updated_at   = now();
