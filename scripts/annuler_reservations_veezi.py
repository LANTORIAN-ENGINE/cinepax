#!/usr/bin/env python3
"""Relâche (cancel/refund) tous les bookings Veezi finalisés sur les séances passées
en argument. Libère les sièges dans le back-office. Usage :

    set -a; source .env; set +a
    python3 scripts/annuler_reservations_veezi.py <sessionId> [<sessionId> ...]

Variables d'env requises : CONNECT_TENANT, CONNECT_TOKEN.
Doc complète : documentation/ANNULATION_RESERVATIONS_VEEZI.md
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
