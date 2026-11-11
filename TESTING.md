# Testing notes

All checks below were run against the PayPal sandbox on 2026-11-11 with the dev server on port 3100
(`PORT=3100 NEXT_PUBLIC_BASE_URL=http://localhost:3100 npm run dev`). `B=http://localhost:3100`.

## Health

```bash
curl -s $B/api/health
# {"ok":true,"paypal":"sandbox","claude":"fallback planner","channel3":"local catalogue","storage":"json-file"}
```

## Seed the demo pot (6 invoices created and sent, each with a QR code)

```bash
curl -s -X POST $B/api/seed -H "Accept: application/json" | python3 -c "
import json,sys; p=json.load(sys.stdin)['pot']
print(p['id'], p['status'], p['total']); [print(c['name'], c['share'], c['status'], c['invoiceNumber']) for c in p['contributors']]"
# Alex 58.34 sent 0011 ... Chris 58.33 sent 0016  ($349.99 split 6 ways: 58.34 ×1, 58.33 ×5)

curl -s -o qr.png -w "%{http_code}\n" $B/api/pots/<POT>/contributors/<CID>/qr && file qr.png
# 200, PNG image data, 300 x 300
```

## Reminders and the fallback assistant

```bash
curl -s -X POST $B/api/pots/<POT>/remind                      # {"sent":6,"names":[...]}  (PayPal /remind → 204 each)
curl -s -X POST $B/api/pots/<POT>/chat -H 'Content-Type: application/json' -d '{"message":"who hasn'\''t paid?"}'
# "Still waiting on Alex ($58.34), Priya ($58.33), ... $349.99 to go."
```

## Fund the pot → PayPal order created

```bash
for cid in <CID1> ... <CID6>; do curl -s -X POST $B/api/pots/<POT>/contributors/$cid/simulate | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])"; done
# collecting ×5 then funded
curl -s $B/api/pots/<POT> | python3 -c "import json,sys;print(json.load(sys.stdin)['order'])"
# {'id': '5WL154341X760815U', 'status': 'PAYER_ACTION_REQUIRED', 'approveUrl': 'https://www.sandbox.paypal.com/checkoutnow?token=5WL154341X760815U'}
```

Each simulated payment is a real `POST /v2/invoicing/invoices/{id}/payments` (payment ids `EXTR-…` appear in the ledger and the invoice moves to `MARKED_AS_PAID`).

**Capture + tracking** happen on `GET /api/pots/<POT>/return?token=<ORDER>` after the organiser approves the order in PayPal
(browser login with a sandbox buyer). The handler calls `POST /v2/checkout/orders/{id}/capture` then
`POST /v2/checkout/orders/{id}/track` with the capture id and redirects to the pot page with `?purchased=1`.
This step requires an interactive PayPal login and was not scripted; the request shapes were verified with curl
(`/track` correctly rejects an unknown capture id with `CAPTURE_ID_NOT_FOUND`).

## Re-split when someone joins

```bash
curl -s -X POST $B/api/pots -H 'Content-Type: application/json' \
  -d '{"prompt":"Buy Priya a Sony WH-1000XM5 for her birthday, split between 4 of us, budget under $350. Deadline in 3 days."}'
# 4 × $82.25 invoices (0035–0038)
curl -s -X POST $B/api/pots/<POT2>/contributors/<CID1>/simulate   # Alex pays $82.25
curl -s -X POST $B/api/pots/<POT2>/contributors -H 'Content-Type: application/json' -d '{"name":"Taylor","email":"taylor@example.com"}'
# Remaining $246.75 re-split 4 ways: 61.69 ×3, 61.68 ×1. Old unpaid invoices cancelled, new invoices 0039–0042 sent.
curl -s -X POST $B/api/pots/<POT2>/chat -H 'Content-Type: application/json' -d '{"message":"add Morgan (morgan@example.com)"}'
# "Morgan added. The remaining $246.75 is now split 5 ways: ... $49.35 each. New invoices are out."
```

## Cancel → refunds

```bash
curl -s -X POST $B/api/pots/<POT2>/cancel -H 'Content-Type: application/json' -d '{"reason":"Test cancel"}'
# status refunded; Alex refunded (refund id EXTR-45728778SY3042849), 5 open invoices cancelled
```

Verified on PayPal afterwards:

```
INV2-9P56-8AQU-PEJY-D26Y MARKED_AS_REFUNDED
INV2-9BVX-SDCR-FZXK-V858 CANCELLED   (×5)
```

## Deadline expiry

`getPot()` settles any `collecting` pot whose deadline has passed (same refund path). To test quickly create a pot with
`{"prompt": "...", "deadlineMinutes": 1}` and reload after a minute.

## Sandbox limits found

- `INR_FOREIGN_CURRENCY_BLOCKED`: an India-region sandbox merchant cannot send invoices to India-based recipients
  (including the default India sandbox buyer). Contributors therefore carry US billing addresses.
- `CURRENCY_NOT_SUPPORTED` for INR orders; everything is USD.
- Payouts are not available for this merchant (not needed by Chip-In).

## Unit check for the fallback planner

```bash
node scripts/plan-check.mjs
# {"item":"Nintendo Switch","title":"Nintendo Switch","n":6,"days":5}
# {"item":"Sony WH-1000XM5","title":"Sony WH-1000XM5","n":4,"days":7,"max":350}
# ...
```

## Build

```bash
npx tsc --noEmit && npx eslint src && npm run build
```
