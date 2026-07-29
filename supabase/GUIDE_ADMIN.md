# CINEPAX — Guide : migration Supabase + compte admin

Ce guide couvre deux choses, **dans cet ordre** :

1. Exécuter les migrations SQL (obligatoire avant toute inscription — le trigger de création de profil doit exister)
2. (Re)créer le compte administrateur `admin@cinepax.mg`

---

## Étape 1 — Exécuter les migrations

Dans **Supabase Dashboard → SQL Editor → New query**, exécuter les 2 fichiers **dans l'ordre** :

| Ordre | Fichier | Contenu |
|-------|---------|---------|
| 1 | `supabase/migration.sql` | 6 tables, trigger profil, RLS, catégories de sièges |
| 2 | `supabase/migration_veezi_reservation.sql` | Colonnes Veezi sur `bookings` (`ticket_breakdown`, `veezi_booking_number`, …) |

Pour chaque fichier : coller tout le contenu → **Run**. Les deux scripts sont idempotents (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — sans risque à ré-exécuter.

**Vérification** : dans **Table Editor**, les 6 tables doivent apparaître :
`profiles`, `price_cards`, `seat_categories`, `session_prices`, `bookings`, `booking_seats` — et `bookings` doit avoir la colonne `veezi_status`.

---

## Étape 2 — (Re)créer le compte `admin@cinepax.mg`

### 2a. Supprimer l'ancien compte s'il existe encore

**Dashboard → Authentication → Users** : chercher `admin@cinepax.mg`.
S'il existe : menu `⋮` → **Delete user**. (Le profil lié dans `public.profiles` est supprimé automatiquement — `ON DELETE CASCADE`.)

### 2b. Créer l'utilisateur

Deux options — **l'option Dashboard est recommandée** (pas d'email de confirmation à gérer) :

**Option A — via le Dashboard (recommandé)**

1. **Authentication → Users → Add user → Create new user**
2. Renseigner :
   - Email : `admin@cinepax.mg`
   - Password : `Admin@2026!`
3. Cocher **Auto Confirm User** ✅ (sinon le compte restera en attente de confirmation email)
4. **Create user**

Le trigger `on_auth_user_created` crée automatiquement la ligne dans `public.profiles`.

**Option B — via l'application**

1. Lancer l'app (`npm run dev`) et aller sur `/auth/register`
2. S'inscrire avec `admin@cinepax.mg` / `Admin@2026!`
3. Si la confirmation email est activée dans le projet Supabase (**Authentication → Sign In / Up → Email → Confirm email**), soit la désactiver, soit confirmer manuellement l'utilisateur dans le Dashboard.

### 2c. Promouvoir en admin + nommer le profil

Dans **SQL Editor**, exécuter :

```sql
UPDATE public.profiles
SET is_admin  = TRUE,
    full_name = 'Administrateur Cinepax',
    updated_at = NOW()
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@cinepax.mg' LIMIT 1
);
```

**Vérification** :

```sql
SELECT u.email, p.full_name, p.is_admin
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin@cinepax.mg';
```

Résultat attendu : `is_admin = true`.

---

## Étape 3 — Tester la connexion

1. Vérifier que `.env` contient bien les clés Supabase (**Dashboard → Settings → API**) :

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
   SUPABASE_SERVICE_ROLE_KEY=eyJxxxx
   ```

2. `npm run dev` puis se connecter sur `/auth/login` avec `admin@cinepax.mg` / `Admin@2026!`
3. La page `/admin` doit être accessible (le layout admin vérifie `profiles.is_admin`).

---

## Dépannage

| Symptôme | Cause probable | Correctif |
|----------|----------------|-----------|
| « Invalid login credentials » | Compte non confirmé (Option B sans Auto Confirm) | Dashboard → Users → `⋮` → **Confirm user** |
| `/admin` redirige vers l'accueil | `is_admin` pas à `TRUE` | Ré-exécuter le SQL de l'étape 2c |
| Profil absent dans `profiles` | Migration exécutée **après** la création du compte (trigger inexistant à ce moment) | `INSERT INTO public.profiles (id) SELECT id FROM auth.users WHERE email = 'admin@cinepax.mg' ON CONFLICT (id) DO NOTHING;` puis étape 2c |
| Erreur « Supabase non configuré » | `.env` incomplet | Compléter les 3 clés puis relancer `npm run dev` |
