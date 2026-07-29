# CINEPAX Madagascar — Contexte projet

## Vue d'ensemble

POC de réservation de billets en ligne pour **Cinepax Madagascar** (cinepax.mg), développé pour eTech. Interface utilisateur en français. Déployé sur Vercel.

## Stack technique

- **Framework** : Next.js 16 (App Router), React 19
- **Node** : 24.x
- **Style** : CSS pur dans `app/globals.css` — pas de Tailwind, pas de CSS Modules
- **Langage** : JavaScript (pas TypeScript)
- **Tests** : aucun test automatisé
- **Déploiement** : Vercel (`vercel.json` minimal)

## Structure du projet

```
app/
  page.jsx          — Page unique (toute la logique de réservation)
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

## Flux de réservation (5 étapes — state machine `step`)

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

## Fichiers hors Next.js (legacy / archive)

- `src/` — ancien projet Vite/React (non utilisé, archive)
- `dist/` — build Vite compilé (non utilisé)
- `api/[...path].js` — handler Vercel standalone (remplacé par le App Router)
- `index.html` — entrée Vite (non utilisé)
- `email_client.html` — prototype HTML standalone d'interface email
