# Bagelito — Nonpayable order intent capture (DRAFT / NOT DEPLOYED)

**Purpose:** capture requests for human follow-up without creating a paid order, a delivery promise, or any reservation of stock.

## Files
- `src/lib/order-intents/contract.ts` — validates known 10 pack price categories, 6 schmear price categories, 3 published combos and Custom Colors as REQUESTS ONLY. Validates flavor composition, consent and bounds; rejects payment or forged prices.
- `src/lib/order-intents/repository.ts` — HMAC fingerprints and idempotent insertion, rejects conflicting retries, returns no PII.
- `src/lib/order-intents/service.ts` — server-only Supabase admin client, Delivery V2 district coverage check, stores only in `order_intents`.
- `src/app/api/order-intents/route.ts` — `POST`, disabled unless `BAGELITO_ORDER_INTENTS_ENABLED=true`; uses existing public API reservations rate-limit/honeypot controls and responds 202 with `awaiting_human_review`, `review_required`, `not_requested`, `checkoutEnabled:false`.
- `supabase/add-order-intents.sql` — UNAPPLIED schema script, separate from paid `orders`. Unique `(store_id,source,idempotency_key)`, RLS, no anon/authenticated privileges, only service-role access.
- `tests/order-intents-contract.test.mjs` and `tests/order-intents-repository.test.mjs` — 19 tests using Node 22 experimental type stripping.

## Prerequisites for any controlled pilot
1. Obtain explicit user authorization to install `supabase/add-order-intents.sql` in the correct environment. Do not modify current Supabase, Meta or payments without the approved cutover.
2. Configure a secret `BAGELITO_ORDER_INTENT_HMAC_KEY` (32+ random characters) exclusively on the server; do not publish it.
3. Verify production API rate limiting, nonbinding consent text, review queue access controls and retention policy.
4. Enable `BAGELITO_ORDER_INTENTS_ENABLED=true` ONLY for a separately authorized pilot; OFF by default.
5. Present **'Solicitud recibida para revisión; no confirma precio, disponibilidad, fecha ni pago'** in the storefront. No automatic Dawn outbound messages.

## Security and current status
- The endpoint is not deployed or activated; the SQL has not been applied.
- No quote total, payment method, payment intent, charge or confirmed dispatch time is stored. No actual kitchen address is present.
- The 10 pack and 6 schmear identifiers are category handles, not proof of stock nor the final 15 individual schmear SKUs. Combos/Custom Colors remain human-reviewed pending full composition and pricing eligibility.
- A repeated idempotency key and identical normalized payload returns the existing request ID; a conflicting payload receives 409 (requires the DB UNIQUE constraint).
- Customer information is stored server-side only after the feature flag is enabled, consent is given, and SQL is installed. Only a UUID and statuses are returned.
- Real RLS, Supabase concurrency, API integration, CI, GHL handoff, Golden S01-S04 and full Next.js build are NOT verified.

## QA evidence
- `tsc --strict` for the pure contract/repository modules: PASS (Node type shim used only for isolated local compile).
- **19/19 PASS**: the exact checked-in `.mjs` tests were executed with Node 22.16 using `node --experimental-strip-types --test`, with Git blob hashes matched.
- **6/6 PASS**: isolated Next route smoke with substituted NextResponse, security and persistence dependencies; not a live Next/Supabase request.
- These are isolated tests, NOT production integration approval.

## Next engineering gate
Build an authenticated internal review queue and human status workflow with strict role permissions; test real Supabase schema in a controlled nonproduction environment after authorization. Then connect the visual storefront to this request endpoint, without moving any Golden imagery.
