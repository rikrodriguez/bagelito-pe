# Bagelito — Delivery V2 targeted QA and blocker audit (2026-11-09)

## Verified against GitHub branch
PR #52: https://github.com/rikrodriguez/bagelito-pe/pull/52
- `src/lib/delivery-v2/server-quote.ts`, exact GitHub blob `0f2f693966cc8e657eb0b94e22f7292d13232b9d`
- `src/app/api/delivery/preview/route.ts`, exact GitHub blob `d5b949a8d7607889b73dd2cbab9dd2eed5b2db8e`
- `src/lib/delivery-v2/review-only.ts`, exact GitHub blob `760d37bc79a1ad4c4e3624a7f41133808de7dceb`

## Real targeted tests run in isolated Node 22 / TypeScript 5.8.3
1. **12/12 PASS**: compiled exact `server-quote.ts` with test-only `delivery-private-tiers.ts` dependency, tested default fail-closed resolver; valid Lince/Miraflores/La Molina examples; unverified address, absent evidence, invalid area, forged browser evidence, and mismatched destination.
2. **8/8 PASS**: compiled exact `src/app/api/delivery/preview/route.ts` and `review-only.ts` with test-only canonical-preview stub; tested nonpayable delivery estimates, manual remote district, injected `payable` field, unknown district, malformed JSON, oversized body and wrong content type.

**Caution:** Tests used **test-only stubbed tariff modules**, so these are `20/20` targeted tests and **NOT** a complete canonical 25-case V2 suite, the 12 checked-in server-quote tests, the 8 checked-in endpoint tests, full Next.js build or real Supabase/Culqi integration. Do not claim full CI PASS. The endpoint was **already present** in PR #52 when this audit began; no duplicate route was created.

## Safety/readiness finding
The new function `requireVerifiedDeliveryV2` intentionally has an unconfigured server verifier and currently always returns an address-review error. Both `createReservation` and `createCulqiReservation` call it before database/payment work. This is a correct **fail-closed safety barrier**, **but neither legacy reservation path can currently take an order** while the verifier remains absent.

**P0 next engineering task:** provide a separate safe manual-review `order_intent` capture path with durable idempotency, owner-approved product selection, and human approval; do not require a valid courier address or payment for collecting a nonbinding enquiry. Do not misuse a paid order or payment-proof flow as enquiry storage. A production-capable trusted address validator and payment verification will be required later to convert review to payable checkout.

## Restrictions
No merges, deploys, charges, live messages, AI activation, alterations of Golden images, or costs. Production remains unchanged. Keep PR #52 Draft.
