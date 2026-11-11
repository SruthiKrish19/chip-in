# Chip-In

**Live demo:** https://chip-in-sigma.vercel.app  
**Hackathon:** PayPal AI Hackathon 2026 (Devpost)

**Say what the group wants to buy. The agent collects on PayPal, buys when funded, refunds if not.**

> "Get us a Nintendo Switch for the office game nights, split 6 ways. Deadline in 5 days."

Chip-In turns that sentence into a funded group purchase:

1. **Plans** the pot: finds the item and price (Channel3 product search), splits the cost to the cent, sets a deadline.
2. **Invoices** every contributor on PayPal, each with a **QR code** they can scan from their phone.
3. **Tracks** payments live, **nudges** stragglers with PayPal invoice reminders, and re-splits when someone joins.
4. **Buys** the moment the pot is full: creates and captures a PayPal Order and attaches **shipment tracking**.
5. **Refunds** everyone automatically if the deadline passes short.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). MIT licensed.

## Demo

- Home: create a pot from a sentence, or click **Seed “Office Switch” demo**.
- Pot page: funding bar, **AG Grid** contributor ledger, activity log, and the **Ask Chip-In** assistant ("who hasn't paid?", "add Taylor", "cancel").
- Each contributor gets a shareable page `/pot/<id>/pay/<contributor>` with their PayPal QR code and a **Pay with PayPal** link.
- **Simulate payment** records the payment against the real PayPal invoice so you can walk the whole flow in the sandbox.

## How PayPal is used (sandbox)

| Step | PayPal API |
| --- | --- |
| One invoice per contributor, note written by the agent | Invoicing v2 `POST /v2/invoicing/invoices`, `/send` |
| QR code on the pay page | Invoicing v2 `/generate-qr-code` |
| Payment tracking | Webhook `INVOICING.INVOICE.PAID` + Invoicing v2 `GET` ; demo button records via `/payments` |
| Reminders to the unpaid | Invoicing v2 `/remind` |
| Someone joins → re-split | Invoicing v2 `/cancel` + new invoices |
| Fully funded → buy the item | Orders v2 `POST /v2/checkout/orders` (approval link), `/capture` |
| Shipment tracking for the group | Orders v2 `POST /v2/checkout/orders/{id}/track` |
| Deadline missed or cancelled → refund everyone | Payments v2 `POST /v2/payments/captures/{id}/refund` for real payments, Invoicing v2 `/refunds` for recorded ones; open invoices cancelled |

Every money movement is deterministic code in [`src/lib/pot.ts`](src/lib/pot.ts). The model never calls PayPal directly.

## How AI is used

- **Planner** ([`src/lib/planner.ts`](src/lib/planner.ts)): Claude (`claude-sonnet-5-5`, Anthropic API, structured output via Zod) turns the request into `{ itemQuery, participants, participantCount, deadlineDays, maxPrice }`. Totals and shares are then computed in code. Without an API key a deterministic regex planner produces the same shape, so the app runs end to end with no key.
- **Messages**: Claude writes the invoice note, reminder, and refund text per contributor (templates when no key).
- **Assistant** ([`src/lib/assistant.ts`](src/lib/assistant.ts)): a Claude tool-use loop over `get_pot_status`, `send_reminders`, `add_contributor`, `cancel_pot`. The model proposes a tool call; the server executes it. Cancel requires the organiser's explicit ask. Without a key, keyword intents hit the same functions.

## Sponsor tools

- **Channel3**: `POST https://api.trychannel3.com/v1/search` with `x-api-key` finds the item and current price ([`src/lib/channel3.ts`](src/lib/channel3.ts)). Without a key, a labelled local catalogue is used and the UI says "local catalogue".
- **AG Grid** (`ag-grid-community` + `ag-grid-react`): the contributor ledger with status pills, invoice numbers, payment/refund IDs, and per-row actions ([`src/components/Ledger.tsx`](src/components/Ledger.tsx)).

## Run it locally

```bash
git clone https://github.com/SruthiKrish19/chip-in && cd chip-in
npm install
cp .env.example .env.local   # fill in PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from a sandbox REST app
npm run dev                  # http://localhost:3000
```

Then click **Seed “Office Switch” demo**, open a contributor's QR page, and press **Simulate payment** on each row until the pot is funded. The pot page shows **Approve PayPal order**; log in with a sandbox buyer, approve, and the app captures the order and attaches tracking.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | yes | Sandbox REST app credentials |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `PAYPAL_WEBHOOK_ID` | no | Enables signature verification on `/api/webhooks/paypal` |
| `ANTHROPIC_API_KEY` | no | Enables Claude; otherwise the deterministic planner runs |
| `ANTHROPIC_BASE_URL` | no | e.g. `https://ai-gateway.vercel.sh` to route via Vercel AI Gateway |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-5-5` |
| `CHANNEL3_API_KEY` | no | Enables live Channel3 search |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Persistence on Vercel; otherwise `.data/pots.json` locally / memory on serverless |
| `NEXT_PUBLIC_BASE_URL` | yes on Vercel | Used for PayPal return URLs and share links |

### Webhook

Point a PayPal sandbox webhook at `https://<your-host>/api/webhooks/paypal` for `INVOICING.INVOICE.PAID`. Real invoice payments then flow in without the demo button.

## Sandbox notes

- The sandbox merchant used for the demo is India-region. PayPal blocks sending invoices to India-based accounts (`INR_FOREIGN_CURRENCY_BLOCKED`) and does not support INR orders from this account, so contributors get **US billing addresses** and all amounts are **USD**. A US-region sandbox business account removes both limits.
- The capture step needs a sandbox buyer login in the browser (standard PayPal approval). Judges: see the testing instructions on the Devpost submission for the credentials.

## Architecture

```
src/app            Next.js 16 App Router (pages + API routes)
src/lib/paypal.ts  PayPal REST client (OAuth, Invoicing v2, Orders v2, Payments v2)
src/lib/pot.ts     Pot state machine: collecting → funded → purchased | refunded/cancelled
src/lib/planner.ts Claude structured-output planner + deterministic fallback + share splitting
src/lib/assistant.ts Claude tool-use assistant + fallback intents
src/lib/channel3.ts Channel3 search + local catalogue
src/lib/store.ts   JSON-file / Upstash Redis storage
src/components     Dashboard, AG Grid ledger, chat, QR pay page pieces
```

Built with Next.js, TypeScript, Tailwind CSS, AG Grid, the Anthropic SDK, Zod, and Vercel. See [TESTING.md](TESTING.md) for the exact sandbox checks that were run.
