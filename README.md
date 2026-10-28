# Bagelito Commerce — TanStack Start portable Store

**Status:** source scaffold verified in an isolated Vercel Sandbox; **not yet connected to HighLevel AI Studio and not production**. The current Next.js production app at https://bagelito.pe/ remains unchanged.

## Purpose

This directory is the portable TanStack Start version of Bagelito Store intended for the private repository that HighLevel AI Studio creates through **More → Git**. Do not replace the current production root with this directory and do not make GHL the source of truth for orders or payments.

## Customer journey implemented

- Entrada → Vitrina → **Packs / Combos / Schmears**.
- Packs → **Grandes / Minis**.
- Grandes: 6 or 12 bagels.
- Minis: 6, 12 or 24 mini bagels.
- Mixed / single-flavor selection and visual bagel picker.
- Combos: **2 bagels + schmear**, explicitly no sandwich and no drink.
- Historical printed combo products are reference data only and are not exposed in the active Store.
- Schmears: five published flavors with 120 / 180 / 240 g size references.
- Review panel with batch status and server-verification messaging.
- Checkout remains intentionally blocked until current offer approval, inventory, reservation and payment gates are live.

## Bundled visual assets

The portable app includes local copies of:

- approved Bagelito entry scene;
- approved counter/vitrine scene;
- pack photography;
- eight regular bagel flavor photos.

The active Store UI therefore does **not** depend on the old Bagelito website to render these product images.

## Runtime

Pinned direct runtime versions verified on 2026-10-27:

- `@tanstack/react-start` 1.169.4
- `@tanstack/react-router` 1.170.46
- Vite 8.3.5
- React / React DOM 19.3.1
- `@vitejs/plugin-react` 6.1.2

`npm run typecheck` first runs the Vite/TanStack build so a clean clone generates `src/routeTree.gen.ts`, then executes `tsc --noEmit`.

## Verified commands

From a clean clone of commit `56fba5fe9b6fdb6d0e8efd94fa97a3aeefc8dc8e` in a Vercel Sandbox:

```bash
cd migration/ai-studio/tanstack-app
npm install
npm run typecheck
```

Observed:

- dependency install: PASS, 0 vulnerabilities in the TanStack subproject;
- client production build: PASS;
- SSR production build: PASS;
- TypeScript: PASS.

Repository verification:

```bash
npm ci
node migration/ai-studio/verify-portable-slice.mjs
```

Observed:

- portable domain tests: **26/26 PASS**;
- Store UI contract tests: **4/4 PASS**.

Runtime smoke test using `vite preview`:

- `GET /` → **200**;
- `GET /api/catalog` → **200**;
- `GET /api/batch` without Supabase secrets → **503**, `accepting:false`, `status:"closed"`;
- entry, counter and product image assets → **200**.

This proves the scaffold builds and fails closed outside production. It does **not** prove the HighLevel AI Studio target runtime, live Supabase connection, Culqi sandbox, reservation concurrency, or production release.

## APIs

- `GET /api/catalog`: published reference menu; checkout remains disabled.
- `GET /api/batch`: read-only Supabase adapter. Missing credentials or backend failure returns a closed/non-accepting response with HTTP 503.

## Secrets

Configure only in the target server-side secret store:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never expose the service-role key to the client. Culqi credentials are not part of this read-only pilot and must be added only when sandbox checkout is ported.

## Production safety

- Supabase remains the authority for orders, reservations, batch capacity and payment state during phase 1.
- GHL may receive derived CRM/customer state but must not decide whether an order is paid or inventory is reserved.
- Premium inclusion/surcharge, mini flavor eligibility and the current two-bagel combo price still require current commercial approval.
- A browser success state is never payment confirmation.
- Reservation and Culqi webhook handling must remain server-side, idempotent and amount/order verified.
- No live message, real charge, production DNS change or production cutover is authorized by this scaffold.

## Next execution gate

1. In RikMarketing, open/create the Bagelito sub-account.
2. Create **Bagelito Commerce** as a new AI Studio project. New AI Studio projects use TanStack Start.
3. Open **More → Git → GitHub** and let AI Studio create its private repository.
4. Keep Automatic Push/Pull enabled and preserve the generated baseline.
5. Transfer this portable app into that generated repo, then run the same build/typecheck and smoke tests inside AI Studio preview.
6. Add test Supabase secrets and verify real `GET /api/batch` behavior.
7. Port transactional reservation logic.
8. Port Culqi **sandbox** checkout/webhook reconciliation.
9. Only after sandbox payment and rollback tests pass, prepare any production cutover.

## Current external blocker

The authenticated HighLevel session is visible, but the available browser-control connector cannot perform the required GHL UI actions in this chat. No AI Studio-generated Bagelito repository was found in the connected GitHub account as of this verification.

The existing Vercel Git deployment check is also being rejected by the Free-plan daily deployment quota; this is separate from the successful Vercel Sandbox build evidence above.
