# Codex handoff — Bagelito TanStack migration, first executable slice

## Read first

- `migration/ai-studio/README.md` and `porting-manifest.json`
- `src/app/page.tsx`, `src/app/reserve/page.tsx`, `src/app/api/batch/route.ts`
- `src/lib/reservations/service.ts` and schemas
- `src/lib/payments/culqi.ts`, `src/app/api/webhooks/culqi/route.ts`
- `docs/runbook-operativo.md`, `docs/culqi-integracion.md`

Do not rewrite from scratch. Compare every migrated behavior against original Next.js source.

## First slice, without production changes

1. Inspect the actual **AI Studio-generated** TanStack Start repository. Use its locked dependency versions; do not replace its runtime or the Next production repository.
2. Port catalog types, source product data, delivery price calculations and **GET /api/batch** read-only endpoint.
3. Use `tanstack-src/routes/api/batch.ts` as a reference. Its import path assumes the service is placed in `src/lib` of the target repo; fix aliases and client/server boundaries before build. Use the TanStack Start server route syntax supported by the generated baseline.
4. Port a minimal interactive storefront using original design assets and approved customer journey, with checkout disabled in this first slice. No invented product prices; reconcile minis, combos and schmears with current approved menu first.
5. Add tests for catalog/price contracts, no-store batch response, unauthenticated public read path, SSR/hydration and mobile.
6. Run TypeScript check, lint, unit/integration tests and preview build in target AI Studio environment. Produce test report with commit SHA; failures are not PASS.
7. Do not touch Culqi live, Vercel, production DNS, Supabase schema, real orders or GHL sending automations.
8. Export a ZIP and independently build outside GHL once preview and tests are passing.

## Product invariant

Source Next reservation/payments/operations are existing truth. GHL becomes the communications/CRM plane, not payment confirmation or stock authority. Future Mandilia integration is an adapter, not a requirement for Bagelito launch.

## Acceptance for next phase

- AI Studio Git Sync repo confirmed and reachable
- GET /api/batch API compatibility established against test fixtures
- UI slice renders with source-approved images and correct selection rules
- No changes to current production
- Baseline and target SHAs/preview/test results documented
