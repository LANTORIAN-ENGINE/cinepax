# CINEPAX — Guide : migration Supabase + compte admin

Ce guide couvre deux choses, **dans cet ordre** :

1. Exécuter les 8 migrations SQL (obligatoire avant toute inscription — le déclencheur de création de profil doit exister)
2. (Re)créer le compte administrateur `admin@cinepax.mg`

---

## Étape 1 — Exécuter les migrations

Dans **Supabase Dashboard → SQL Editor → New query**, exécuter les **huit** fichiers. Une seule contrainte d'ordre, mais elle est absolue : **`migration.sql` d'abord** — il pose `profiles`, `bookings` et le déclencheur de création de profil, dont tous les autres dépendent. Les sept suivants sont indépendants entre eux ; l'ordre du tableau est simplement celui qui va du socle vers les écrans.

| Ordre | Fichier | Ce qu'il pose | Sans lui |
|-------|---------|---------------|----------|
| 1 | `migration.sql` | 6 tables (`profiles`, `price_cards`, `seat_categories`, `session_prices`, `bookings`, `booking_seats`), déclencheur de profil, RLS | Rien ne marche : une inscription ne crée pas de profil |
| 2 | `migration_veezi_reservation.sql` | 5 colonnes sur `bookings` (`ticket_breakdown`, `veezi_booking_number`, `veezi_booking_id`, `veezi_user_session_id`, `veezi_status`) | La place payée n'est jamais envoyée au back-office du cinéma |
| 3 | `migration_admin_visibilite_achats.sql` | `est_admin()`, le déclencheur qui complète l'adresse de contact d'un achat, et les policies d'administration sur `bookings` / `booking_seats` / `profiles` | `/admin/reservations` reste vide et le bouton « marquer utilisé » échoue en silence |
| 4 | `migration_contact_messages.sql` | Table `contact_messages` + rattachement des messages au compte client par l'e-mail | Le formulaire Contact répond « le message n'a pas pu être enregistré » |
| 5 | `migration_film_translations.sql` | Table `film_translations` : cache des synopsis traduits | Le synopsis reste dans sa langue de saisie Veezi |
| 6 | `migration_sales_settings.sql` | Table `sales_settings` : le délai de fermeture de la vente en ligne | `/admin/parametres` le dit, et la vente reste ouverte jusqu'à l'horaire exact |
| 7 | `migration_legal.sql` | 4 tables (`legal_documents`, `legal_document_revisions`, `legal_consents`, `legal_settings`) + les textes de départ | `/admin/legal` le dit, et `/legal` reste vide |
| 8 | `migration_bandes_annonces.sql` | Table `film_trailers`, bucket de stockage `film-trailers` et ses policies | Le site n'a que le lien YouTube de Veezi — le comportement d'avant |

Pour chaque fichier : coller tout le contenu → **Run**. Les huit scripts sont idempotents (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`) — sans risque à ré-exécuter, et aucun ne réécrit un réglage déjà choisi dans l'administration.

**Vérification** : dans **Table Editor**, les **14 tables** doivent apparaître —
`profiles`, `price_cards`, `seat_categories`, `session_prices`, `bookings`, `booking_seats`, `contact_messages`, `film_translations`, `sales_settings`, `legal_documents`, `legal_document_revisions`, `legal_consents`, `legal_settings`, `film_trailers` — et `bookings` doit avoir la colonne `veezi_status`.

**Aucune migration n'est bloquante pour les autres** : chacune tient sa propre absence. Une table manquante fait dire à l'écran concerné « exécuter le script SQL » plutôt que de casser la page — c'est voulu, on peut donc les passer une par une, à son rythme.

### Un réglage manuel, en plus de la migration 8

Le bucket `film-trailers` est créé avec une limite de 200 Mo par fichier, mais le **plafond global du projet l'emporte sur celui du bucket** — il vaut 50 Mo par défaut.

**Dashboard → Storage → Settings → Upload file size limit** : le porter à 200 Mo. Sans cela, une bande annonce de 80 Mo est refusée en `413 Payload too large` alors que le bucket l'accepterait.

### Facultatif — amorcer les grilles tarifaires

`seed_price_cards.sql` n'est **pas** une migration : c'est un jeu de montants à insérer dans `price_cards`. ⚠ **À faire valider par Cinepax avant exécution** — les prix y sont relevés sur l'affiche des tarifs (`public/content/offres-tarifs.jpg`), pas sur une API, et ils engagent des paiements réels. Ils s'éditent de toute façon dans `/admin/prix` ; le script ne fait que gagner la première saisie.

### Ce que fait la migration 3

Trois choses, pour un seul symptôme : dans `/admin/reservations`, la colonne « Email » était vide sur toutes les lignes.

- `est_admin()` — la fonction que toutes les policies d'administration interrogent. `SECURITY DEFINER`, sinon une policy sur `profiles` qui lit `profiles` boucle sur elle-même.
- Un déclencheur qui complète `guest_email` / `guest_phone` à l'insertion quand l'achat vient d'un compte : la colonne cesse de vouloir dire « adresse d'un invité » pour dire **adresse de contact de cet achat** — ce qu'un billet doit porter de toute façon.
- Les policies de lecture sur tous les achats, toutes les places et tous les profils, plus l'écriture du statut (sans elle, le bouton « marquer utilisé » échouait sans rien dire).

### Ce que fait la migration 4

La page Contact récolte les demandes dans `contact_messages`. L'**e-mail est le seul champ obligatoire** parce qu'il sert de clé de rapprochement avec les comptes clients :

- à l'envoi du message, un trigger cherche un compte portant la même adresse et rattache la demande (`user_id`) ;
- à l'inscription d'un nouveau compte, un second trigger rattrape les messages envoyés auparavant en visiteur avec cette adresse.

Résultat : le client retrouve ses demandes dans **Mon compte → Mes demandes** (« je vous avais déjà écrit à ce sujet »), et l'administration voit **tous** les messages, rattachés ou non, dans **/admin/messages**.

Les messages contiennent des données personnelles : ils ne sont jamais lus avec la clé anon. `/admin/messages` passe par `/api/admin/messages`, qui vérifie `is_admin` côté serveur avec la `service_role`.

### Ce que fait la migration 5

Veezi ne stocke qu'un synopsis par fiche film, dans la langue où le distributeur l'a saisi : sur le catalogue relevé, **32 % sont en anglais**, y compris sur des fiches VF. `film_translations` garde la version traduite pour que chaque langue du site affiche bien sa langue.

La clé de cache est l'**empreinte du texte source**, pas l'identifiant du film : les fiches VF, VO et 3D d'une même œuvre portent souvent le même synopsis au caractère près et se partagent donc une seule traduction — et si le distributeur corrige son texte dans Veezi, l'empreinte change et la traduction se régénère d'elle-même.

La table est **strictement serveur** : RLS activé sans aucune politique, ce qui la ferme à la clé anon. Seules les routes Next.js y accèdent, via la `service_role`.

### Ce que fait la migration 6

Une séance ouverte à la vente dans Veezi le reste jusqu'à son horaire exact : un client peut payer une place pour un film qui commence dans cinq minutes. `sales_settings` porte **un seul nombre**, le délai de fermeture en minutes, réglé dans `/admin/parametres` sans redéploiement.

Il vaut pour l'affichage comme pour l'écriture — `/api/bookings/create` le revérifie sur l'horaire Veezi avant d'ouvrir un achat. La barrière est posée **avant** le paiement et nulle part après : une fois la somme encaissée, refuser la place ne protégerait plus personne.

Si la table manque, tout retombe sur un délai nul : une panne de base ne ferme pas la billetterie d'elle-même.

### Ce que fait la migration 7

Les quatre documents légaux (`cgu`, `cgv`, `rgpd`, `pdd`) vivent **en base**, pas dans le code : l'administrateur les rédige dans `/admin/legal` et le site s'en sert immédiatement, sans redéploiement.

La **version ne monte que si l'administrateur le demande** — corriger une virgule ne doit pas redemander son accord à toute la base. Chaque montée fige un instantané dans `legal_document_revisions` : c'est la pièce qui prouve *quel texte* a été accepté. Les consentements sont enregistrés en **deux cases distinctes**, le contrat et les données, jamais une seule — le RGPD interdit de les mêler.

Le script sème les textes de départ en `ON CONFLICT DO NOTHING` : le ré-exécuter n'écrase jamais une rédaction en place.

### Ce que fait la migration 8

La bande annonce d'un film ne venait que du lien YouTube saisi par le distributeur dans Veezi. Le cinéma n'écrit pas dans Veezi : `film_trailers` et le bucket `film-trailers` lui ouvrent la seconde source — **un fichier vidéo déposé dans `/admin/bandes-annonces`, qui l'emporte sur le lien**.

Rien n'est obligatoire : sans ligne en base, le site retombe sur le lien Veezi, exactement comme avant.

Le fichier est écrit **directement dans le bucket par le navigateur** de l'administrateur (une fonction Vercel refuse un corps au-delà de 4,5 Mo, quand une bande annonce en pèse cent). Les policies posées sur `storage.objects` par ce script sont donc **le seul verrou** : sans elles, la clé anon — publique, présente dans le JavaScript du site — suffirait à écrire dans le bucket.

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
