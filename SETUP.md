# CINEPAX — Guide de mise en place (Supabase + Auth)

## 1. Créer un projet Supabase

1. Aller sur [supabase.com](https://supabase.com) et créer un compte
2. Créer un nouveau projet (région : Europe ou US)
3. Copier les clés dans `.env` (voir section 3)

---

## 2. Exécuter la migration SQL

Le fichier `supabase/migration.sql` contient toute la migration en un seul bloc.

**Aller dans Supabase Dashboard → SQL Editor → New query**, coller le contenu du fichier, puis cliquer **Run**.

Le fichier crée dans l'ordre :
1. Les 6 tables (`profiles`, `price_cards`, `seat_categories`, `session_prices`, `bookings`, `booking_seats`)
2. Le trigger de création automatique du profil à l'inscription
3. Les politiques RLS
4. Les catégories de sièges par défaut (Standard + VIP × 4 salles)

> Toutes les instructions sont idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — safe à ré-exécuter.

---

## 3. Variables d'environnement

Créer ou compléter le fichier `.env` à la racine du projet :

```env
# — API Veezi (existant) —
VEEZI_TOKEN=xxxx
CONNECT_TENANT=xxxx
CONNECT_TOKEN=xxxx

# — Supabase —
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx
```

Les clés se trouvent dans **Supabase Dashboard → Settings → API**.

---

## 4. Créer le premier compte admin

1. S'inscrire via `/auth/register`
2. Dans **Supabase Dashboard → SQL Editor**, décommenter et exécuter la dernière section du fichier `supabase/migration.sql` :

```sql
UPDATE public.profiles
SET is_admin = TRUE
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'votre@email.mg' LIMIT 1
);
```

---

## 5. Lancer le projet

```bash
npm install
npm run dev
```

**Routes disponibles :**

| URL | Description |
|-----|-------------|
| `/` | Films à l'affiche + achat de tickets |
| `/auth/login` | Connexion |
| `/auth/register` | Inscription |
| `/mon-compte` | Espace client (achats, QR codes, profil) |
| `/admin` | Tableau de bord admin |
| `/admin/reservations` | Tous les achats en ligne (filtres, export CSV) |
| `/admin/clients` | Gestion des clients |
| `/admin/prix` | Tarification par séance + catégories de sièges |

---

## 6. Architecture des données

```
auth.users (Supabase Auth)
    │
    └── profiles (is_admin, full_name, phone)

bookings
    │    booking_ref: CPX-YYYYMMDD-XXXXX
    │    status: confirmed | pending | cancelled | used
    │    payment_status: pending | paid | refunded
    │    qr_code_data: JSON { ref, film, session, seats }
    │
    └── booking_seats (display_key: A1, B3…)

session_prices (prix par session Veezi)
seat_categories (catégories par salle avec prix de base)
```

---

## 7. Flux d'achat

```
films → sessions → plan de salle → paiement → confirmation
                                       │
                              [POST /api/bookings/create]
                                       │
                              → Supabase bookings table
                              → QR code généré côté client
                              → Référence: CPX-YYYYMMDD-XXXXX
```

**Note sur les prix :**
- L'API Veezi Connect retourne les prix si le canal **CINEP** est activé (`ticketUnitPrice`)
- Sinon, les prix viennent de la table `session_prices` (configurés par l'admin dans `/admin/prix`)
- Si aucun prix n'est trouvé, l'achat est enregistré à 0 Ar (à régulariser manuellement)

---

## 8. Note sur le mode visiteur vs connecté

- **Visiteur** : achat sans compte, `user_id = NULL`, coordonnées saisies dans le formulaire
- **Connecté** : `user_id` lié à l'auth Supabase, achats visibles dans `/mon-compte`
- **Admin** : `profiles.is_admin = TRUE`, accès à `/admin/*`
