# CINEPAX — Guide : migration Supabase + compte admin

Ce guide couvre deux choses, **dans cet ordre** :

1. Exécuter les migrations SQL (obligatoire avant toute inscription — le trigger de création de profil doit exister)
2. (Re)créer le compte administrateur `admin@cinepax.mg`

---

## Étape 1 — Exécuter les migrations

Dans **Supabase Dashboard → SQL Editor → New query**, exécuter les 4 fichiers **dans l'ordre** :

| Ordre | Fichier | Contenu |
|-------|---------|---------|
| 1 | `supabase/migration.sql` | 6 tables, trigger profil, RLS, catégories de sièges |
| 2 | `supabase/migration_veezi_reservation.sql` | Colonnes Veezi sur `bookings` (`ticket_breakdown`, `veezi_booking_number`, …) |
| 3 | `supabase/migration_contact_messages.sql` | Table `contact_messages` + rattachement des messages au compte client par l'e-mail |
| 4 | `supabase/migration_film_translations.sql` | Table `film_translations` : cache des synopsis traduits (voir plus bas) |

Pour chaque fichier : coller tout le contenu → **Run**. Les quatre scripts sont idempotents (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`) — sans risque à ré-exécuter.

**Vérification** : dans **Table Editor**, les 8 tables doivent apparaître :
`profiles`, `price_cards`, `seat_categories`, `session_prices`, `bookings`, `booking_seats`, `contact_messages`, `film_translations` — et `bookings` doit avoir la colonne `veezi_status`.

> Tant que la migration 3 n'est pas passée, le formulaire de la page **Contact** répond « le message n'a pas pu être enregistré » et `/admin/messages` reste vide : la table n'existe pas encore.

### Ce que fait la migration 3

La page Contact récolte les demandes dans `contact_messages`. L'**e-mail est le seul champ obligatoire** parce qu'il sert de clé de rapprochement avec les comptes clients :

- à l'envoi du message, un trigger cherche un compte portant la même adresse et rattache la demande (`user_id`) ;
- à l'inscription d'un nouveau compte, un second trigger rattrape les messages envoyés auparavant en visiteur avec cette adresse.

Résultat : le client retrouve ses demandes dans **Mon compte → Mes demandes** (« je vous avais déjà écrit à ce sujet »), et l'administration voit **tous** les messages, rattachés ou non, dans **/admin/messages**.

Les messages contiennent des données personnelles : ils ne sont jamais lus avec la clé anon. `/admin/messages` passe par `/api/admin/messages`, qui vérifie `is_admin` côté serveur avec la `service_role`.

### Ce que fait la migration 4

Veezi ne stocke qu'un synopsis par fiche film, dans la langue où le distributeur l'a saisi : sur le catalogue relevé, **32 % sont en anglais**, y compris sur des fiches VF. `film_translations` garde la version traduite pour que chaque langue du site affiche bien sa langue.

La clé de cache est l'**empreinte du texte source**, pas l'identifiant du film : les fiches VF, VO et 3D d'une même œuvre portent souvent le même synopsis au caractère près et se partagent donc une seule traduction — et si le distributeur corrige son texte dans Veezi, l'empreinte change et la traduction se régénère d'elle-même.

La table est **strictement serveur** : RLS activé sans aucune politique, ce qui la ferme à la clé anon. Seules les routes Next.js y accèdent, via la `service_role`.

> Tant que la migration 4 n'est pas passée, rien ne casse : le site affiche le synopsis Veezi d'origine, dans sa langue de saisie. C'est exactement le comportement d'avant.

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
