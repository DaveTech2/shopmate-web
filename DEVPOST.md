# Shopmate, your hybrid AI personal shopper

## Inspiration
Shopping online in Lagos means typing vague keywords into five apps, guessing delivery fees and burning mobile data
on comparison tabs. We'd already built Shopmate as a chat shopping agent; #BuildHybridAI was the push to make it a web
app where the *personal* parts of shopping, your budget, your shoe size, "flat feet", are understood **on your own device**.

## What it does
Say what you need in one sentence. Shopmate:
1. understands it **on-device with Gemini Nano** (product, budget, use, size, delivery city → structured JSON),
2. retrieves real catalog listings and ranks them with **cloud Gemini**, giving 2-3 concrete "why it fits" reasons per pick,
3. shows the landed price, item + delivery fee and ETA to your city,
4. compares 2-3 items side by side with an AI verdict, edits your cart from plain language, and plans bulk orders
   ("office restock for 20 staff") with a cloud agent that calls the shop's own tools,
5. checks out (test mode, no real charges) and tracks the order.

Every AI answer carries a badge, **On-device · Gemini Nano** or **Cloud · Gemini**: with latency, so you can see hybrid inference working.

## How we built it
- **Firebase AI Logic hybrid inference** (`firebase/ai`, Gemini Developer API backend):
  - `PREFER_ON_DEVICE` for intent parsing, compare, cart edits and product Q&A;
  - `PREFER_IN_CLOUD` for ranking/explanations (falls back on-device when offline);
  - `ONLY_IN_CLOUD` with **function calling** for the bulk-order planner (tools aren't available on-device).
  - One JSON Schema per task drives **structured output on both paths** (`responseConstraint` on-device, `responseJsonSchema` in cloud).
  - `initializeDeviceModel()` on first user gesture with live download progress; `inferenceSource` on every response powers the badges.
- **App Check** (reCAPTCHA) protecting AI Logic; **Auth** with instant anonymous guests upgraded in place to email/Google;
  **Firestore** for carts, orders and saved searches with owner-only security rules; **Remote Config** for the cloud model,
  default inference mode, FX rate and feature flags.
- React + Vite + TypeScript, mobile-first dark UI. The delivery-fee engine (distance bands, size surcharges, express) is
  ported from our existing Python Shopmate plugin.

## Challenges we ran into
- On-device models are single-turn and have no tool calling, so we split the product into tasks that fit each side,
  and made the chat stateless per turn by passing the products on screen as context.
- Keeping Nano honest: the model never invents listings, retrieval and prices come from the catalog; the model parses and explains.
- Making hybrid *visible*: surfacing `inferenceSource` and latency as badges without cluttering a shopping UI.

## Accomplishments we're proud of
- A complete shopping flow (search → compare → cart → checkout → tracking), not just a prompt demo.
- Guests can use everything instantly; signing up keeps their cart.

## What we learned
Small structured tasks are where on-device models shine: they're instant, private and free, and they make the cloud
model's job smaller and cheaper.

## What's next
Real merchant feeds and Paystack live payments, image search ("find shoes like this photo", multimodal on-device),
Android with Gemini Nano, and WhatsApp ordering through the existing Shopmate agent.

## Built with
firebase-ai-logic, gemini-nano, gemini, chrome-prompt-api, firebase-auth, cloud-firestore, firebase-app-check,
firebase-remote-config, firebase-hosting, react, vite, typescript

## Pre-existing work
Catalog data and delivery-fee rules come from the open-source Shopmate Hermes plugin (Python). The web app, hybrid AI
layer and all Firebase integration were built during the submission period.
