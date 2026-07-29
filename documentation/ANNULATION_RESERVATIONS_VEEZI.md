# Annuler / rembourser des réservations Veezi (nettoyage back-office)

> Procédure et scripts pour **libérer des sièges** occupés par des bookings finalisés
> dans Veezi (ex. nettoyer les réservations de test).
> Prouvé en live le **3 juillet 2026** sur le film *TEST VENTE EN LIGNE* (4 salles).

---

## 1. Principe fondamental

Le statut **« occupé » d'un siège n'est pas un attribut indépendant** : il est **dérivé
du booking** qui tient le siège. Il n'existe aucun endpoint (ni action back-office) pour
« libérer un siège » sans relâcher son booking.

Pour libérer un siège, il faut **relâcher son booking**, et Vista n'autorise que **deux voies**
selon l'état du booking :

| État du booking | Endpoint | Effet |
|---|---|---|
| **Non payé** (aucun paiement encaissé) | `booking/cancel` | `CancelledStatus=1`, siège libéré |
| **Payé** (paiement enregistré) | `booking/refund` | valeur→0, `RefundedStatus=1`, `CancelledStatus=1`, siège libéré |

> ⚠️ **Un refund sur une résa test est inoffensif.** Nos réservations sont finalisées avec
> `PerformPayment:false` → **aucun argent réel n'a jamais bougé**. Le « refund » n'est qu'un
> renversement comptable interne qui décroche le siège. Ce n'est pas un remboursement bancaire.

---

## 2. Prérequis (API Connect)

- Base : `https://connect.eu.veezi.com`
- Headers (⚠️ **casse EXACTE obligatoire**, voir piège §5) :
  - `vista-tenant: <CONNECT_TENANT>`
  - `connectApiToken: <CONNECT_TOKEN>`
  - `Content-Type: application/json`
- `CinemaId` = `0000000309`
- Ces valeurs sont dans le `.env` du projet (`CONNECT_TENANT`, `CONNECT_TOKEN`).

---

## 3. Les 3 appels (service `RESTBooking.svc`)

### 3.1 Lire un booking

```bash
curl -s \
  -H "vista-tenant: $CONNECT_TENANT" \
  -H "connectApiToken: $CONNECT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://connect.eu.veezi.com/RESTBooking.svc/booking" \
  -d '{"CinemaId":"0000000309","BookingNumber":"27573"}'
```

Réponse (extrait) :
```jsonc
{
  "ResultCode": 0,                      // 0 = booking trouvé
  "Booking": {
    "BookingNumber": 27573,
    "BookingId": "WNZW39Q",
    "IsPaid": true,                     // ⚠️ pas fiable seul (voir §5)
    "CancelledStatus": "0",             // "1" = déjà annulé
    "CurrentValueInCents": 3000000,     // montant à rembourser
    "Tickets": [
      { "TicketSequenceNumber": 1, "RefundGroupNumber": 1,
        "SeatRowId": "C", "SeatNumber": "8", "RefundedStatus": "0" }
    ],
    "Payments": [ { "PaymentId": "OPH-1807448", "OrderPaymentAmount": 3000000 } ]
  }
}
```

### 3.2 Annuler un booking NON payé

```bash
curl -s \
  -H "vista-tenant: $CONNECT_TENANT" \
  -H "connectApiToken: $CONNECT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://connect.eu.veezi.com/RESTBooking.svc/booking/cancel" \
  -d '{"CinemaId":"0000000309","BookingNumber":"27589"}'
```

- Succès : `{"ExtendedResultCode":0,"Result":0,"ErrorDescription":null}`
- Codes d'erreur : **`47`** = booking introuvable / non identifié · **`48`** = booking trouvé
  mais non annulable car **payé** → utiliser `refund`.

### 3.3 Rembourser un booking PAYÉ

```bash
curl -s \
  -H "vista-tenant: $CONNECT_TENANT" \
  -H "connectApiToken: $CONNECT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://connect.eu.veezi.com/RESTBooking.svc/booking/refund" \
  -d '{"CinemaId":"0000000309","BookingNumber":"27578","RefundGroupNumbers":[1],"RefundAmount":3000000}'
```

- Succès : `{"ResultCode":0,"ErrorDescription":null}`
- `RefundGroupNumbers` : **la liste de tous les `RefundGroupNumber`** distincts des tickets.
- `RefundAmount` : le montant en **cents** = `CurrentValueInCents`. ⚠️ Le champ s'appelle
  bien **`RefundAmount`** (tous les autres noms — `RefundAmountInCents`, etc. — échouent avec
  *« Requested refund amount (0) ≠ total »*).

---

## 4. Script complet (annuler TOUTES les réservations d'un lot de séances)

> Énumère une plage de numéros de booking, ne touche QUE ceux dont un ticket est sur une
> séance ciblée, et relâche chacun avec la bonne méthode (cancel → fallback refund).
> Idempotent : re-jouable sans risque (les déjà-annulés sont ignorés).

Enregistrer sous `scripts/annuler_reservations_veezi.py` puis :

```bash
set -a; source .env; set +a
python3 scripts/annuler_reservations_veezi.py 33557 33559 33560 33561 33562 33563 33564 \
        33565 33566 33567 33568 33569 33570 33571 33572 33573 33574
```

```python
#!/usr/bin/env python3
"""Relâche (cancel/refund) tous les bookings Veezi finalisés sur les séances passées
en argument. Libère les sièges dans le back-office. Usage :

    set -a; source .env; set +a
    python3 annuler_reservations_veezi.py <sessionId> [<sessionId> ...]

Variables d'env requises : CONNECT_TENANT, CONNECT_TOKEN.
"""
import os, sys, json, subprocess

CB = "https://connect.eu.veezi.com"
CID = "0000000309"
TENANT = os.environ["CONNECT_TENANT"]
CTOK   = os.environ["CONNECT_TOKEN"]

# Plage de numéros de booking à balayer (élargir si besoin).
BOOKING_RANGE = range(27540, 27700)

TARGET_SESSIONS = set(sys.argv[1:])
if not TARGET_SESSIONS:
    sys.exit("Usage: annuler_reservations_veezi.py <sessionId> [<sessionId> ...]")

def post(path, body):
    """Appel Connect via curl (⚠️ préserve la CASSE des headers, urllib la casse → 403)."""
    out = subprocess.run(
        ["curl", "-s",
         "-H", f"vista-tenant: {TENANT}",
         "-H", f"connectApiToken: {CTOK}",
         "-H", "Content-Type: application/json",
         "-X", "POST", CB + path, "-d", json.dumps(body)],
        capture_output=True, text=True, timeout=40).stdout
    try:
        return json.loads(out)
    except Exception:
        return {"_raw": out[:160]}

released, skipped = [], []
for bn in BOOKING_RANGE:
    d = post("/RESTBooking.svc/booking", {"CinemaId": CID, "BookingNumber": str(bn)})
    b = d.get("Booking")
    if not b or d.get("ResultCode") != 0:
        continue
    sids = {str(t.get("SessionId")) for t in b.get("Tickets", [])}
    if not (sids & TARGET_SESSIONS):          # pas une séance ciblée → on n'y touche pas
        continue
    seats = [t["SeatRowId"] + t["SeatNumber"] for t in b.get("Tickets", [])]
    if str(b.get("CancelledStatus")) == "1":
        skipped.append((bn, seats)); continue

    # 1) tenter cancel ; 2) si booking payé (Ext 48) → refund
    r = post("/RESTBooking.svc/booking/cancel", {"CinemaId": CID, "BookingNumber": str(bn)})
    if r.get("Result") == 0 and r.get("ExtendedResultCode") == 0:
        released.append((bn, "cancel", sorted(sids), seats, True, None)); continue

    val = b.get("CurrentValueInCents", 0) or 0
    groups = sorted({t.get("RefundGroupNumber") for t in b.get("Tickets", [])
                     if t.get("RefundGroupNumber") is not None})
    r = post("/RESTBooking.svc/booking/refund",
             {"CinemaId": CID, "BookingNumber": str(bn),
              "RefundGroupNumbers": groups, "RefundAmount": val})
    ok = r.get("ResultCode") == 0
    released.append((bn, "refund", sorted(sids), seats, ok, r.get("ErrorDescription")))

print("=== RELÂCHÉS ===")
for bn, m, sids, seats, ok, err in released:
    print(f"  {bn}  {m:<7} sess={sids} {seats}  -> {'OK' if ok else 'ECHEC: ' + str(err)}")
print("=== DÉJÀ ANNULÉS ===")
for bn, seats in skipped:
    print(f"  {bn}  {seats}")
print(f"\nRelâchés OK: {sum(1 for r in released if r[4])}/{len(released)}   "
      f"déjà annulés: {len(skipped)}")
```

### Vérifier qu'une séance est bien à 0 siège occupé

```bash
curl -s \
  -H "vista-tenant: $CONNECT_TENANT" -H "connectApiToken: $CONNECT_TOKEN" \
  "https://connect.eu.veezi.com/RESTData.svc/cinemas/0000000309/sessions/33559/seat-plan" \
| python3 -c "import json,sys;d=json.load(sys.stdin);a=d['SeatLayoutData']['Areas'][0];\
print([f\"{r['PhysicalName']}{s['Id']}\" for r in a['Rows'] for s in r['Seats'] if s.get('Status')==1])"
```

Retourne `[]` quand tous les sièges sont libres.

### Retrouver les IDs de séances d'un film (API V1)

```bash
curl -s -H "VeeziAccessToken: $VEEZI_TOKEN" "https://api.eu.veezi.com/v1/session" \
| python3 -c "import json,sys;print(sorted(s['Id'] for s in json.load(sys.stdin) if s['FilmId']=='ST00005110'))"
```
(`ST00005110` = film *TEST VENTE EN LIGNE*.)

---

## 5. Pièges (⚠️ importants)

1. **Casse des headers.** `urllib`/`requests` (Python) **title-case** les en-têtes :
   `connectApiToken` → `Connectapitoken` → **403 Forbidden**. Toujours passer par `curl`
   (ou forcer la casse exacte). C'est pourquoi le script shell-out vers `curl`.

2. **`IsPaid` n'est pas fiable seul.** Certains bookings ont `IsPaid=true` mais **aucun
   paiement encaissé** (`VistaTransactionId=0`) ; `refund` renvoie alors
   *« Booking … is unpaid »*. **Stratégie robuste = tenter `cancel` d'abord ; si
   `ExtendedResultCode:48` → basculer sur `refund`.** (C'est ce que fait le script.)

3. **`order/cancel` ≠ `booking/cancel`.** `RESTTicketing.svc/order/cancel` ne cancelle que
   les **paniers EN COURS** (répond `OrderNotFound` sur un booking finalisé). Pour un booking
   finalisé, utiliser **`RESTBooking.svc/booking/cancel|refund`**.

4. **Filtrage de sécurité.** Le script ne relâche QUE les bookings dont un ticket est sur une
   `SessionId` explicitement passée en argument → aucun risque de toucher une vraie vente sur
   une autre séance. Élargir `BOOKING_RANGE` si des numéros sortent de la plage.

---

## 6. Endpoints utiles (récap)

| Endpoint | Méthode | Rôle |
|---|---|---|
| `RESTBooking.svc/booking` | POST | Lire un booking (`{CinemaId, BookingNumber}`) |
| `RESTBooking.svc/booking/cancel` | POST | Annuler un booking **non payé** |
| `RESTBooking.svc/booking/refund` | POST | Rembourser/annuler un booking **payé** |
| `RESTData.svc/cinemas/{cid}/sessions/{sid}/seat-plan` | GET | Vérifier l'occupation des sièges |
| `api.eu.veezi.com/v1/session` | GET | Lister les séances (header `VeeziAccessToken`) |

---

*Voir aussi : `documentation/RAPPORT_SEAT_PLAN_API.txt` (analyse APIs Veezi/Connect) et
`app/api/veezi/reserve/route.js` (création des réservations).*
