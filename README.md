# Shopmate — hybrid AI personal shopper

**Let's Shop Smarter.** Say what you need — *"wireless headphones under $50 with good battery life"* — and Shopmate
finds real listings, explains why each one fits, compares prices side by side, quotes delivery to your door and checks out.

Built for **#BuildHybridAI 2026** on **Firebase AI Logic hybrid inference**: the parts of shopping that are personal and
latency-sensitive run **on your device with Gemini Nano** (Chrome Prompt API), and the heavier reasoning runs on **cloud Gemini** —
with automatic fallback in both directions, and a badge on every AI answer showing which one actually replied.

## Value proposition
Online shoppers in markets like Nigeria juggle vague search boxes, hidden delivery fees and slow comparisons on
expensive mobile data. Shopmate turns one sentence into a ranked shortlist with reasons, a true landed price
(item + delivery to your city), and a one-tap compare — while keeping the raw request (budget, sizes, health needs
like "flat feet") on the device whenever possible.

## Features
- **Chat-first shopping** — natural language → structured intent → grounded catalog search → ranked picks with "why it fits".
- **Product cards** — image, price (USD/NGN), delivery fee + ETA to your city, fit score and reasons.
- **Discover** — browse the catalog by category.
- **Compare** — 2–3 items side by side with an AI verdict, pros/cons, delivery and specs.
- **Natural-language cart edits** — "make it 2 kettles and remove the toothpaste".
- **Bulk-order planner** — "plan an office restock of toiletries for 20 staff": a cloud agent calls the shop's own tools.
- **Accounts** — instant anonymous guest sessions (judges can try immediately), email/password and Google sign-in;
  guests are upgraded in place (cart and orders carry over).
- **Cart, demo checkout and order tracking** — Firestore-backed; checkout is **test mode only, no real charges**.
- **Status chip** — shows whether Gemini Nano is available / downloadable / downloading, with a settings panel to switch inference mode
  and warm up the on-device model.

## How hybrid inference is used (`src/ai/hybrid.ts`)
| Task | Mode | Why |
|---|---|---|
| Intent parsing (product, budget, use, size, location → JSON) | `PREFER_ON_DEVICE` | private, instant, free; runs on every message |
| 2–3 item compare | `PREFER_ON_DEVICE` | small context, structured output |
| Cart edits ("remove the toothpaste") | `PREFER_ON_DEVICE` | tiny structured task |
| Product quick-take / Q&A | `PREFER_ON_DEVICE` | short text |
| Ranking candidates with reasons | `PREFER_IN_CLOUD` | heavier multi-product reasoning; falls back on-device offline |
| Bulk-order planner | `ONLY_IN_CLOUD` + function calling | tools aren't supported on-device |

- Models are created with `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })`.
- **Structured output on both paths** from one JSON Schema: `onDeviceParams.promptOptions.responseConstraint` (Prompt API)
  and `inCloudParams.generationConfig.responseJsonSchema` (Gemini).
- `initializeDeviceModel()` is called on the first user gesture (Start Shopping / send) with download progress shown in the UI.
- Every result reads `response.inferenceSource` (`on_device` / `in_cloud`) → **"On-device · Gemini Nano"** or **"Cloud · Gemini"** badge plus latency.
- The model never invents listings: retrieval and prices come from the catalog; the model parses intent and ranks/explains.
- **Remote Config** controls `cloud_model`, `inference_mode`, `fx_ngn_per_usd`, `enable_bulk_planner`, `max_results`.
- **App Check** (reCAPTCHA Enterprise or v3; debug token on localhost) protects Firebase AI Logic.
- **Firestore** stores `users/{uid}/cart`, `orders`, `searches`; `firestore.rules` restricts every document to its owner.

### Demo mode
If no `VITE_FIREBASE_*` config is present the app still runs, clearly labelled **Demo mode**: AI answers come from a
deterministic rules engine (`src/ai/mock.ts`) and are badged **"Demo · simulated"**, and data stays in localStorage.
If a real Firebase AI call fails, results are badged **"Fallback · rules"** so it's never ambiguous what replied.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config + App Check site key
npm run dev                  # http://localhost:5173
```
1. Create a Firebase project → **AI Services › AI Logic › Get started** → choose **Gemini Developer API**.
2. Register a **Web app**, copy its config into `.env.local`.
3. **App Check**: register the web app with reCAPTCHA Enterprise (or v3) and put the site key in `.env.local`;
   enforce App Check for Firebase AI Logic. For localhost set `VITE_APPCHECK_DEBUG_TOKEN=true`, then register the printed debug token.
4. **Authentication**: enable *Anonymous*, *Email/Password* and *Google* providers; add your hosting domain to Authorized domains.
5. **Firestore**: create a database, then `firebase deploy --only firestore:rules`.
6. **Remote Config** (optional): `firebase deploy --only remoteconfig` (template in `remoteconfig.template.json`).
7. On-device: Chrome desktop 139+, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, then click
   "Download / warm up Gemini Nano" in the app's settings.

## Deploy
```bash
npm run build
firebase deploy --only hosting      # uses firebase.json (SPA rewrites) and .firebaserc
```
Vercel also works (`vercel.json` included). Set the same `VITE_*` env vars in the host.

## Pre-existing work
The product catalog, Nigerian place list and delivery-fee rules are ported from the Shopmate Hermes plugin
(github.com/DaveTech2/Shopmate, Python). Everything in this repo — the web app, hybrid AI layer, Firebase integration,
UI, compare/cart/checkout/orders — was built during the #BuildHybridAI submission period. The visual design follows an
earlier Shopmate design mock-up (landing + auth screens only).

## License
Apache-2.0 — see [LICENSE](LICENSE). Image credits in [CREDITS.md](CREDITS.md).
