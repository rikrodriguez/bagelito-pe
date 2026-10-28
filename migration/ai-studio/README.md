# Bagelito — TanStack Start / HighLevel AI Studio migration

Status: **PREPARATION ONLY; NOT DEPLOYED**.
Date: 2026-10-27. Source: `rikrodriguez/bagelito-pe` on `main`, current production remains `https://bagelito.pe/`.

## Decision

Keep the production Next.js application, Supabase database, and Culqi integration intact while building an isolated TanStack Start version for HighLevel AI Studio. AI Studio creates its **own** GitHub repository from `More → Git`; do not attempt to connect the existing Next.js root as the AI Studio Git Sync root.

This directory lives on a **separate Git branch** to make the migration executable without changing the running product. It is a source-to-target handoff, not a second deployed shop.

## Existing code inventory verified

- Next.js 15.5.23 / React 19.2.7 / TypeScript
- 12 page routes, 2 layouts, 18 HTTP route handlers
- Domain modules in `src/lib`: batch capacity, reservations, pricing, catalog, delivery, Culqi, waitlist, tracking, complaints, monitoring, admin
- Persistent business data and RPCs in Supabase; signed/private proof storage
- Culqi tokenization, server charge, status and webhook reconciliation
- Admin Server Actions in `src/app/admin/actions.ts`, plus `cookies()`, `redirect()`, `revalidatePath()`
- Next.js-specific `next/image`, `next/link`, `next/script` components

See `porting-manifest.json` for the exact pages and endpoints. A GET batch-route **porting example** is included under `tanstack-src/`; it is NOT compiled, hosted, or tested yet.

## Mandatory rules

1. Do **not** modify `main`, production domain, public checkout, Supabase schema or data, production DNS, wallet, payments or Culqi webhook URL during preflight.
2. Preserve the approved future customer journey: **Packs (large or minis) / Combos (two bagels + schmear) / Schmears**. Current source data may not yet implement every future selection; do not invent prices or assume source UI is approved design.
3. Supabase is the single authority for orders, reservations, batch capacity, payment attempts, order history, and production states in phase 1. GHL stores derived CRM/customer communications only.
4. Keep Culqi as the payment processor. Confirm payment on the server using verified provider events and amount/currency/order match; a browser redirect does not confer paid status.
5. Preserve concurrency and idempotency: last available unit, expiration/late payment, duplicate webhook, retries, partial failure, and callback recovery.
6. `beforeLoad` is a UI guard only. Every private server function and route needs its own authorization check, and public endpoints need request validation, throttling, idempotency and CSRF/origin protection as applicable.
7. Move secrets to AI Studio Secrets; do not commit `.env` values or production customer exports. Test/live keys and webhook destinations must remain isolated.
8. AI Studio Cloud database replacement is a **separate later decision** contingent on equivalent transactional safety, restore testing, data portability and performance.
9. All payment and messaging automations remain non-production until QA and explicit release approval.

## Installation sequence

1. In RikMarketing, open or create a **Bagelito** sub-account. Do not load the Adam agency snapshot.
2. Inside Bagelito, create **Bagelito Commerce** in AI Studio, get the default TanStack Start baseline, connect `More → Git`, and copy the exact new repo URL into an internal handoff.
3. Migrate **one independent vertical slice first**: catalog and read-only batch availability. Restore its original test fixtures, verify SSR, hydration, cache headers, mobile, and API shape in AI Studio preview.
4. Port rest of storefront/checkout, then reservation service and Culqi sandbox, then admin, then CRM read-only sync. Do not port Next routing or middleware blindly.
5. Compare deployed Next vs TanStack with deterministic fixtures and edge cases. Run real sandbox-provider tests without charging real customers.
6. Export TanStack app to a non-GHL test host; prove independent startup and restore against test data. Maintain Next production rollback before any cutover.
7. Only after gates pass, prepare domain cutover with rollback instructions and human approval.

## Runtime caveat

AI Studio runs TanStack Start, not `next build`/`next start`. Typical request lifecycle is short and cannot host a persistent background worker. If a later feature requires long queues or cron, use GHL automation or a separate worker service and signed callbacks. GHL integration must be optional and fail-safe for order/payment handling.

## Stop conditions

Do not proceed if:
- source and target cannot prove equivalent batch quantity/capacity constraints;
- payment confirmation could be duplicated, forged or inferred from browser success;
- private admin functionality is accessible anonymously;
- test Cloud/Supabase connectivity or secrets isolation fails;
- a functional regression alters prices, order state, legal/merchant checkout or mobile flows.

## Evidence needed to declare work complete

Record exact source SHA, new AI Studio repo SHA, preview URL, test commands/results, server logs, screenshots, GHL API sync evidence, Culqi sandbox test records, export/restore evidence and rollback path. A document or passing local mock test is not production validation.
