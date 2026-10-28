# Bagelito / AI Studio portable-slice verification

**Date:** 2026-10-27 (America/Lima).  
**Scope:** portable TypeScript business modules and a sample TanStack Start read-only route.  
**Proof class:** local test of source-equivalent extracted modules, **not GitHub CI, AI Studio preview, live Supabase, Culqi or production**.

## Extracted framework-independent modules

- `portable-src/data/packs.ts`: copied from `src/data/packs.ts`.
- `portable-src/data/flavors.ts`: copied from `src/data/flavors.ts`.
- `portable-src/lib/catalog.ts`: copied, replacing Next source alias `@/data/*` with relative imports.
- `portable-src/lib/delivery-pricing.ts`: copied without behavior changes.
- `portable-src/lib/batch-availability.ts`: copied without behavior changes.
- `portable-src/lib/public-batch-display.ts`: copied, replacing the Next reservation-service type import with a standalone `BatchAvailability` type.
- `portable-src/lib/batch-types.ts`: copied the exact TypeScript response field contract from `src/lib/reservations/service.ts`.

## Executed tests (local reconstruction)

The corresponding portable module sources were assembled in a local isolated directory and verified with:

```sh
tsc -p portable-tsconfig.json
node --test tests/read-only-catalog.test.mjs tests/batch-availability.test.mjs
```

Observed result: **TypeScript compile PASS; 8 tests PASS, 0 FAIL**.

Tests cover:
1. Current source pack slug/amount catalog equivalence.
2. Current flavor IDs and lookup.
3. District delivery pricing and fallback.
4. No imported Next.js runtime in portable catalog/delivery module.
5. Batch status + close-time gate.
6. Expired public opening date suppressed.
7. Future waitlist dates displayed.
8. Delivered batch does not promise upcoming delivery.

**Limitations:** no run of the entire source-repo test suite, no source/target deployed comparison, no official GitHub Actions evidence yet, no live server route or AI Studio project compiled, no payment or reservation transaction exercised.

## How to reproduce in this repository

```sh
npm ci
node migration/ai-studio/verify-portable-slice.mjs
```

The verification script compiles the portable-src folder then runs both test files. Its temporary build output is cleaned up.

## Mandatory next integration gate

1. Verify that a Bagelito sub-account exists in RikMarketing and create `Bagelito Commerce` as a **TanStack Start** AI Studio project.
2. Let AI Studio generate its own private Git repository via `More → Git`. Preserve that baseline.
3. Transfer these checked `portable-src` modules to the AI Studio repository. Port `GET /api/batch` against Supabase test data; prove exact response shape, cache headers, and mobile-visible status.
4. Verify intended NEW product configuration independently: **Packs → Large/Mini, Combos → two bagels + schmear, Schmears**, without treating legacy pack prices as currently approved.
5. Work through reservation and Culqi sandbox only after the read-only slice passes.
6. Prove independent ZIP export/build outside HighLevel and preserve unchanged production deployment as rollback.

No production integration, public domain change, payment execution or GHL automation activation is authorized by this report.


## Verified published-menu extension (2026-10-21 reference)

Added `portable-src/data/verified-menu-2026-10-21.json` from the catalog evidence file, distinct from the older website's `packs.ts` and `flavors.ts`.
The updated journey is **Packs → Grande/Mini → selection, Combos → exactly two bagels + schmear, Schmears → flavor and size**.

Added `portable-src/lib/approved-shop-contract.ts` and `tests/approved-shop-contract.test.mjs`.

Safe design choices:
- Historical published regular packs: six mixed S/60, six single S/50, twelve mixed S/115, twelve single S/100.
- Mini pack prices from the menu are preserved only as *published base prices*; selected mini flavor compatibility is not established, so checkout stays blocked.
- Five schmears in 120/180/240 g with published original/flavored prices.
- Current two-bagel combo remains **unpriced and nonchargeable**; the older printed six/twelve-bagel combo offers are reference only, not a replacement.
- Premium bagel surcharges/inclusions, batch availability, and up-to-date offer approval are independent release gates.
- Seasonal and color-custom bagels are not inserted into regular eight-flavor purchase selections.

Local test run: `tsc -p portable-tsconfig.json` **PASS**; `node --test tests/*.test.mjs` **16/16 PASS**. These are **local** checks of equivalent extracted code and values; GHL preview, CI and Culqi sandbox remain unverified.

The production checkout must have a separate server-side gate and must not treat a UI quote or the historical menu alone as authority to charge customers. Do not turn these read-only purchase previews into live payment flows until current menu approval and transactional backend integration are demonstrated.


## Read-only Supabase batch parity + TanStack starter

- Added `portable-src/lib/batch-read.ts` and `tests/batch-read.test.mjs`.
- Added independently structured `tanstack-app/` with `package.json`, `vite.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/api/catalog.ts`, `src/routes/api/batch.ts`, `src/server/batch.server.ts`, styles and copied portable domain modules.
- The preview UI includes visible real Bagelito bagel photo URLs and a blocked checkout, with Packs → Grande/Mini, Combos → 2 bagels + schmear and Schmears 120/180/240g.
- The server-side Supabase adapter reads only batches/orders, has a 42703 legacy-schema fallback and returns 503 with accepting=false when secrets or DB are unavailable. It does not mutate data.

**Executed local validation:** portable TypeScript compilation PASS; **26/26 deterministic unit tests PASS**, 0 fail, including 10 additional batch-read projection scenarios. Syntax-only parsing of local TanStack TypeScript/TSX scaffold: 16 source files, 0 syntax errors. This is not TanStack dependency typechecking or an application build; npm registry packages are unavailable in the execution container.

**Not completed:** installing TanStack dependencies, AI Studio project creation, Git Sync connection, target SSR/build/preview, server endpoint runtime test with Supabase, Culqi sandbox, live GHL workflows. GitHub Actions runner remained unavailable and its draft workflow was removed.

**Required next gate:** create the AI Studio-generated private Git repo, integrate `migration/ai-studio/tanstack-app/` there and execute true `npm run build` + `npm run typecheck` + browser/endpoint smoke tests against a test database. Preserve Bagelito's Next production until these pass.


## Exact TanStack runtime validation — 2026-10-27

A Vercel Sandbox was created from the public migration branch and the TanStack app was installed with real npm registry access. Initial validation exposed and corrected two real scaffold defects:

1. the proposed `@tanstack/react-start@^1.170.14` version did not exist;
2. copied catalog type exports still referenced the old `@/data/*` alias.

The tested direct versions are now pinned in the subproject package manifest: React Start 1.169.4, React Router 1.170.46, Vite 8.3.5, React/React DOM 19.3.1 and Vite React plugin 6.1.2.

A second sandbox was reset to a completely clean checkout of source commit `56fba5fe9b6fdb6d0e8efd94fa97a3aeefc8dc8e`, with generated files, package lock, node_modules and dist removed before validation.

Observed from that clean checkout:

- `npm install` in `migration/ai-studio/tanstack-app`: **PASS**, 0 vulnerabilities in the TanStack subproject.
- `npm run typecheck`: **PASS**. The command generated the route tree, built client + SSR, then completed `tsc --noEmit`.
- Portable domain suite: **26/26 PASS**.
- Store UI contract suite: **4/4 PASS**.
- `vite preview` smoke test:
  - `GET /` → **200**;
  - `GET /api/catalog` → **200**;
  - `GET /api/batch` with no Supabase secrets → **503**, `accepting:false`, `status:"closed"`;
  - bundled entry scene → **200**;
  - bundled counter scene → **200**;
  - bundled product image → **200**.

The Store source in this validated slice implements the approved journey: Entrada → Packs / Combos / Schmears; Packs → Grandes / Minis; combo = 2 bagels + schmear with no sandwich/drink; checkout remains fail-closed.

**Still unverified:** HighLevel AI Studio project creation/Git Sync, AI Studio-hosted preview, test Supabase credentials, reservation writes/concurrency in the target runtime, Culqi sandbox and production cutover.

The normal Vercel Git deployment status remains blocked by the Free-plan daily deployment quota. That quota status is not a build result; the isolated Vercel Sandbox build above is the current executable evidence.
