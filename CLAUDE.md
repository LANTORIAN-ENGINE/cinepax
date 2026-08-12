# CINEPAX Madagascar — Contexte projet

## Vue d'ensemble

POC d'**achat de tickets en ligne** pour **Cinepax Madagascar** (cinepax.mg), développé pour eTech. Interface utilisateur en français. Déployé sur Vercel.

### Terminologie — ACHAT, jamais « réservation »

Décision client : la vente est un **achat ferme et définitif** d'une séance avec sièges attribués, pas une réservation. Le terme retenu pour la vente est **ACHAT TICKET EN LIGNE**.

- Tout texte visible par l'utilisateur dit **achat / acheter** (EN : *purchase / buy*). Aucun « réservation », « réserver », *booking*, *book*.
- Le bandeau `components/AchatBand.jsx` porte le message aux trois points d'engagement du tunnel (séances, sièges, paiement).
- Les **identifiants techniques restent inchangés** : table Supabase `bookings`, route `/admin/reservations`, clés i18n `reservations.*` / `myBookings`, composant `BookingFlow`. Seules les *valeurs* du dictionnaire changent — renommer les routes et la base serait une migration à part entière.

## Stack technique

- **Framework** : Next.js 16 (App Router), React 19
- **Node** : 24.x
- **Style** : CSS pur dans `app/globals.css` — pas de Tailwind, pas de CSS Modules
- **Polices** : Bebas Neue (affichage) et DM Sans, chargées par `next/font/google` dans `app/layout.jsx` et exposées en `--font-display` / `--font-sans`. **Ne pas revenir à un `@import` distant dans `globals.css`** : Turbopack le retire du bundle de production, sans erreur ni avertissement, et les 48 déclarations qui nomment ces polices retombent silencieusement sur Arial
- **Langage** : JavaScript (pas TypeScript)
- **Tests** : aucun test automatisé
- **Déploiement** : Vercel (`vercel.json` minimal)

## Structure du projet

```
app/
  page.jsx          — Page unique (toute la logique d'achat)
  layout.jsx        — Navbar + Footer + métadonnées globales
  globals.css       — Tout le CSS (2000+ lignes)
  api/
    veezi/[...path]/route.js    — Proxy → api.eu.veezi.com (GET)
    connect/[...path]/route.js  — Proxy → connect.eu.veezi.com (GET + POST)
    image/route.js              — Proxy image → cinepax.mg uniquement
components/
  SeatMap.jsx       — Plan de salle interactif (layouts hardcodés)
public/
  logo.jpg, orange.png, mvola.png, visa-mastercard.jpg, favicon.svg, icons.svg
documentation/
  RAPPORT_SEAT_PLAN_API.txt     — Analyse complète des APIs Veezi/Connect
  PlanDesSallesCinepax/         — Captures écran + xlsx des 4 salles
```

## Variables d'environnement (`.env`)

```
VEEZI_TOKEN=        # Token API Veezi V1 (header: VeeziAccessToken)
CONNECT_TENANT=     # Header: vista-tenant pour l'API Connect
CONNECT_TOKEN=      # Header: connectApiToken pour l'API Connect
```

## Constantes clés (dans `page.jsx`)

```js
const CINEMA_ID = '0000000309'  // ID Cinepax dans le système Veezi
const TZ = 'Etc/GMT-3'         // Fuseau horaire Madagascar
```

- **Devise** : MGA (Ariary malgache), prix stockés en centimes
- **Langue UI** : français (dates/heures avec `fr-FR`, `fr-MG`)

## Deux APIs Veezi distinctes

| API | Base URL | Usage | Auth |
|-----|----------|-------|------|
| **V1** | `api.eu.veezi.com` | Films, sessions (lecture) | `VeeziAccessToken` |
| **Connect** | `connect.eu.veezi.com` | Seat plan, ticketing, paiement | `vista-tenant` + `connectApiToken` |

Les deux sont proxifiées côté serveur Next.js pour masquer les tokens.

## Flux d'achat (5 étapes — state machine `step`)

```
films → sessions → seats → payment → done
```

1. **films** : liste des films à l'affiche avec séances du jour sélectionné
2. **sessions** : détail film + toutes les séances (groupées par date)
3. **seats** : plan de salle interactif (`SeatMap.jsx`)
4. **payment** : overlay "Coming Soon" (paiement en attente d'activation)
5. **done** : confirmation (rarement atteint pour l'instant)

## Plan de salle (`components/SeatMap.jsx`)

Les layouts des 4 salles sont **hardcodés** (extraits des xlsx + captures POS) :

| ScreenId | Nom | Places |
|----------|-----|--------|
| 1 | CPX MADA 1 | 80 |
| 2 | CPX MADA 2 | 90 |
| 3 | CPX MADA 3 | 74 |
| 4 | CPX MADA 4 | 88 |

Statuts de siège : `available`, `taken` (status=1), `house` (priority=2 / status=2), `broken` (priority=4 / status=3), `companion` (priority=3), `selected`.

Les données en temps réel viennent de :
`GET /api/connect/RESTData.svc/cinemas/0000000309/sessions/{id}/seat-plan`

## Blocage connu — Canal CINEP non activé

**Problème** : L'API Connect ne voit aucune session car le canal de vente **"CINEP"** n'est pas coché dans la grille de programmation Veezi.

**Impact** : le seat-plan retourne `ResponseCode: 50` ("session not found"). Le composant `SeatMap` s'affiche quand même avec `noApiData = true` (tous les sièges grisés).

**Action requise** : Cyrille (accès back-office Veezi) doit cocher "CINEP" dans la grille de programmation pour chaque session.

## Intégration paiement (temporairement désactivée)

Le code des appels API paiement est **commenté** dans `page.jsx` (fonctions `goToPayment` et `confirmPayment`). L'overlay "Coming Soon" s'affiche à la place.

Partenaires paiement prévus : **Orange Money**, **MVola**, **BNI (carte)**.

Endpoints à activer quand le canal CINEP sera disponible :
- `POST /RESTTicketing.svc/order/tickets` — créer la commande avec les sièges
- `POST /RESTTicketing.svc/order/payment` — finaliser le paiement

## Zone de paiement BNI / MIPS — elle n'entre dans la page qu'une fois

`POST /api/bni-pay/load` renvoie un fragment tout fait — un `<script src="gomips.js">`
suivi d'une `<iframe src="go.mips.mu/mipsit.php?c=…">`. Cette iframe est une
**session bancaire vivante** : la reposer, c'est la rouvrir à zéro et perdre le
numéro de carte à moitié saisi.

`components/BniPaymentZone.jsx` la pose **une seule fois**, à la main, dans un
`<div ref>` sans enfant JSX. Ne pas revenir à `dangerouslySetInnerHTML` :

- React 19 ne compare plus la chaîne `__html`, il compare l'objet `{ __html }`
  **par identité** (`nextProp !== lastProp` dans `updateProperties`). Or le JSX
  en crée un neuf à chaque rendu → `domElement.innerHTML = …` réexécuté à chaque
  rendu → iframe détruite et rechargée. Avec l'horloge des ventes qui bat toutes
  les 30 s, le client perdait sa saisie deux fois par minute.
- `innerHTML` n'exécute jamais les `<script>` qu'il pose : `gomips.js` (voile
  d'attente 3-D Secure + `gomips.css`) n'avait jamais tourné. Il est recréé en
  vrai élément **après** l'iframe, qu'il cherche dès son exécution.

Corollaire général : **une fonction composant ne se déclare pas dans le corps
d'un autre composant** — son identité change à chaque rendu et React remonte
tout son sous-arbre. C'est ce que faisait `FilmHero`, qui reconstruisait le plan
de salle à chaque clic sur un siège ; il vit désormais au module.

Le garde « séance refermée » de `BookingFlow` s'efface devant un paiement engagé
(`checkoutEngage`) : la commande est déjà créée et la banque a la main, reprendre
l'écran laisserait le client sans billet. `/api/bookings/create` a déjà tranché à
l'instant qui compte.

## Images des films

`fixImageUrl()` dans `page.jsx` gère 3 cas :
1. URL CDN Veezi (`cdn.eu.veezi.com`) → utilisée directement
2. URL relative malformée (`https:///...`) → rebasée sur `cinepax.mg`
3. Autres URL cinepax.mg → proxifiée via `/api/image` (SSRF protégé : domaine `cinepax.mg` uniquement)

## Conventions CSS

- Tout le CSS est dans `app/globals.css` — aucun fichier CSS séparé par composant
- Classes BEM-like : `.film-row`, `.film-poster-wrap`, `.seat-group`, etc.
- Skeletons d'écrans de chargement : `.sk-*` avec animation `sk-shine`
- Variables CSS sur les éléments : `--row-depth`, `--sk-delay`, `--si`, `--ri`

## Dev local

```bash
npm run dev     # Next.js dev server (port 3000)
npm run build   # Build production
npm run start   # Serveur production
```

Accès réseau local autorisé depuis `192.168.1.74` (configuré dans `next.config.mjs`).

## Fermeture de la vente en ligne avant la séance

Une séance ouverte à la vente dans le back-office Veezi le reste jusqu'à son horaire exact. Le site la retire un **délai** avant — le temps qu'un client arrive et s'installe. Un seul nombre de minutes, valable pour toutes les séances, réglé dans `/admin/parametres` sans redéploiement.

- **SQL** : `supabase/migration_sales_settings.sql` (table `sales_settings`, ligne unique `id=1`). Idempotent.
- **Vocabulaire partagé** : `lib/ventes.js` — `isSaleOpen`, `splitSessions`, `normalizeCutoff`, paliers. Importable client *et* serveur.
- **Lecture serveur** : `lib/ventesServeur.js` (mémo 30 s ; `venteOuverte()` pour le contrôle à l'écriture).

### La règle

`isSaleOpen(début, délai, maintenant)` → `maintenant < début − délai`. Avec 60 minutes, une séance qui commence dans exactement 60 minutes est **déjà** refermée : « d'ici une heure » inclut l'heure pile. Un horaire illisible reste ouvert — on ne refuse jamais une vente sur un doute (`new Date(null)` vaut 1970, d'où un test explicite dans `saleClosesAt`).

### Où elle s'applique

| Endroit | Effet |
|---------|-------|
| `BookingFlow` (accueil, fiche film, séances) | Les séances refermées disparaissent des listes. L'heure courante est un état qui avance toutes les 30 s : une séance se referme sans rechargement |
| `BookingFlow` — étapes places / paiement | Lien partagé ou onglet resté ouvert : écran `.sale-closed`, qui renvoie à la caisse. L'étape `done` n'est jamais interceptée |
| État vide | `SaleClosedNote` remplace « aucune séance » quand il en reste mais qu'elles sont refermées — les deux ne se disent pas pareil |
| `/programme` | Par défaut les séances refermées **restent visibles**, grisées, mention « CAISSE » : la page est un horaire, pas une caisse. `hide_in_programme` les fait disparaître |
| `/api/bookings/create` | **Seul contrôle serveur**, sur l'horaire Veezi et non celui envoyé par le client. Répond `409 vente_close` |

`/api/veezi/reserve` ne revérifie rien volontairement : il court après l'encaissement, et refuser la place d'un client qui vient de payer le laisserait sans billet et sans argent.

### Routes

```
GET       /api/ventes         { cutoffMinutes, hideInProgramme }  — public, cache 30 s
GET|PATCH /api/admin/ventes   après is_admin, service role
```

Aucune policy d'écriture sur `sales_settings`. Si Supabase est injoignable, tout retombe sur `cutoffMinutes: 0` — comportement d'avant : une panne de base ne ferme pas la billetterie d'elle-même.

## Documents légaux, RGPD et consentements

Quatre documents (`cgu`, `cgv`, `rgpd`, `pdd`) vivent **en base**, pas dans le code : l'administrateur les rédige dans `/admin/legal` avec un éditeur TipTap, et le site s'en sert immédiatement — aucun redéploiement.

- **SQL** : `supabase/migration_legal.sql` (tables `legal_documents`, `legal_document_revisions`, `legal_consents`, `legal_settings`). Idempotent, `ON CONFLICT DO NOTHING` sur le contenu semé.
- **Vocabulaire partagé** : `lib/legal.js` — liste blanche de balises (`sanitizeLegalHtml`), sommaire (`extractHeadings` / `anchorHeadings`), regroupement des cases (`buildConsentGroups`).
- **Lecture front** : `lib/useLegal.jsx` (cache de session ; `invalidateLegalCache()` après écriture admin).

### Version et consentement

La **version ne monte que si l'administrateur le demande** (case « publier une nouvelle version ») : corriger une virgule ne doit pas redemander son accord à toute la base. Chaque montée fige un instantané dans `legal_document_revisions` — c'est la pièce qui prouve *quel texte* a été accepté. Un consentement n'est valable que si `consent.version === document.version`, sinon il est redemandé à la connexion.

**Deux cases distinctes**, jamais une seule (`consent_group`) : le contrat (`terms` → CGU + CGV) et les données (`privacy` → RGPD + PDD). Le RGPD interdit de mêler les deux.

### Où le consentement apparaît

| Écran | Forme |
|-------|-------|
| `/auth/register` | Cases obligatoires, verrouillées tant que le document n'est pas lu jusqu'au bout |
| `/auth/login` | Redemandé si une version a changé depuis la dernière acceptation |
| Pied de page | Colonne « Informations légales », alimentée par `in_footer` |
| Paiement | `LegalCheckoutNotice` — rappel des CGV, ouvert en modal |
| `/mon-compte` → Profil | `MyConsents` : ce qui a été accepté, quand, dans quelle version |
| Bandeau bas d'écran | `RgpdBanner`, réglable dans `/admin/legal` → onglet « Bandeau et contact » |

Le verrou de lecture (`components/LegalDocModal.jsx`) traite trois cas : document plus court que la fenêtre (lu d'emblée), redimensionnement en cours de lecture, et lecture acquise définitivement.

### Routes

```
GET    /api/legal[?body=1]     documents publiés + réglages
GET    /api/legal/[slug]       un document (?version=N pour une archive)
POST   /api/legal/consent      enregistre (version et IP relevées côté serveur)
GET    /api/legal/consent      consentements du compte + ce qui manque
GET|PUT|PATCH|DELETE /api/admin/legal
```

Aucune policy d'écriture n'est ouverte sur `legal_documents` : tout passe par `/api/admin/legal` (service role, après `is_admin`). Un document déjà consenti ne se supprime pas — il se dépublie, la preuve reste.

### Ancienne page de conditions

`/termes-et-conditions` **redirige vers `/legal`** (`next.config.mjs`). Le texte recopié de cinepax.mg désignait « les lois du gouvernement du Pakistan » comme droit applicable ; il est repris, corrigé et scindé en CGU/CGV. L'original reste dans `lib/contenu.js` (constante `TERMES`).

## Pages éditoriales — `/a-propos` et `/legal`

Les deux seules pages qu'on lit au lieu d'acheter. Elles partagent une ouverture
(`.ed-head` : surtitre rouge, titre au corps d'affiche, chapeau) et une
ponctuation : une **bande sombre pleine largeur**, les deux salles sur
`/a-propos`, l'encart de contact sur `/legal`.

- **Sortie pleine largeur** : `width: 100vw` + `margin-inline: calc(50% - 50vw)`
  depuis l'intérieur du conteneur centré. La coupe qui empêche la barre de
  défilement horizontale est sur **`.main-content`**, pas sur le conteneur — la
  poser sur `.page-container` rognerait la bande à sa boîte de remplissage.
  `overflow-x: clip` et non `hidden` : `clip` ne crée pas de conteneur de
  défilement, les `position: sticky` (rail d'administration, sommaire des
  documents) continuent de se caler sur la fenêtre.
- **Parallaxe des deux salles** : chaque plaque porte son propre halo — la photo
  elle-même, floutée et masquée en radial. Au défilement, un `requestAnimationFrame`
  écrit une seule variable `--par` par plaque (−1 à l'entrée, +1 à la sortie) ;
  la photo coulisse dans son cadre, le halo dérive à l'inverse. Aucun rendu React
  n'est déclenché, et le tout s'annule sous `prefers-reduced-motion`.

## Fichiers hors Next.js (legacy / archive)

- `src/` — ancien projet Vite/React (non utilisé, archive)
- `dist/` — build Vite compilé (non utilisé)
- `api/[...path].js` — handler Vercel standalone (remplacé par le App Router)
- `index.html` — entrée Vite (non utilisé)
- `email_client.html` — prototype HTML standalone d'interface email
