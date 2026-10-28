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
