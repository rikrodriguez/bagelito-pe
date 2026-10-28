# CODEX HANDOFF — Bagelito AI Studio migration
Status: ready for AI Studio integration, not deployed.
Last updated: 2026-10-27 (America/Lima).

## Source of truth
- Current production Next.js: `rikrodriguez/bagelito-pe` on `main`.
- Active isolated migration PR: https://github.com/rikrodriguez/bagelito-pe/pull/37
- Portable domain & 26 local tests: `migration/ai-studio/portable-src/` and `migration/ai-studio/tests/`.
- Independent TanStack Start source scaffold: `migration/ai-studio/tanstack-app/`.
- Product catalog reference from 2026-10-21: `migration/ai-studio/tanstack-app/src/domain/data/verified-menu-2026-10-21.json` (not authorized live stock).
- Live site `https://bagelito.pe/` remains unchanged.

## What is done
- 12 Next page routes and 18 Next HTTP endpoints inventoried; no automatic copy.
- Framework-neutral catalog, pricing, preview and batch capacity read functions.
- Current source contract: 26/26 unit tests PASS locally with independent TypeScript compilation.
- TanStack Start app files for `/`, `/api/catalog`, `/api/batch`, `__root.tsx`, `router.tsx`, `vite.config.ts`, CSS and README.
- Read-only server-side Supabase adapter that fails closed (503) if credentials or DB are unavailable.
- **AI Studio app build/SSR/Git Sync/GHL environment are NOT verified.** No API has charged customers.

## Next exact task (do not re-audit)
1. Open RikMarketing -> Bagelito subaccount -> AI Studio. Confirm an actual `Bagelito Commerce` project exists; otherwise create one. Connect **More -> Git**. Keep AI Studio-generated private repo/branch and do not overwrite its starter blindly.
2. Clone that AI Studio-generated repository, then integrate `migration/ai-studio/tanstack-app/` from PR #37, resolving version/import differences against the actual baseline. Pin dependencies and generate lockfile in target repo.
3. Run `npm install`, then `npm run build` (this generates `src/routeTree.gen.ts`), then `npm run typecheck` in the new TanStack target. Fix all build/type errors. Capture exact SHA/versions.
4. Configure **test** Supabase URL and service role in AI Studio Secrets only; never expose keys or connect live data to a public preview before authorization.
5. Prove endpoints GET `/api/catalog` and GET `/api/batch`, including cache headers, closed-on-failure, no unexpected writes, query compatibility and real Supabase test credentials.
6. Inspect desktop/mobile actual AI Studio preview. Verify 8 regular bagel photographs, Packs Grande/Mini, Combo 2 bagels + schmear (no sandwich/drink), Schmears sizes and correct selectable options.
7. Compare the source repo's published menu to the 2026-10-21 menu record. **Do not invent** current offer, premium surcharge, mini flavor availability, combo price, batch cadence or seasonal stock.
8. Keep all checkout buttons disabled in technical preview. After the review gate: port transactional reservations, price/capacity server authority, Culqi sandbox 3DS, charge and webhook idempotency; only then CRM GHL sync.
9. Export app from AI Studio and build on non-GHL host using test DB to demonstrate portability. Keep old production as rollback.
10. Only merge/publish after full QA with explicit authorization for DNS/domain and live payments.

## Out of scope / forbidden
- No direct modifications to the original `main` or live `bagelito.pe`.
- No live Culqi charges, real payment links or test card payments in production.
- No destructive Supabase schema/data operations or customer exports.
- No GHL email/WhatsApp sends or activated automations before verified consent and operator approval.
- No reuse of the Adam Erhart Agency OS snapshot in Bagelito.
- No conflation of source 2026-10-21 printed menu with current commercial acceptance.

## Evidence required to close this gate
- AI Studio project ID and generated repo URL, branch, deployed preview URL.
- New target commit and versions, build/typecheck result, SSR/mobile QA.
- GET endpoint tests and redacted logs (never share secrets).
- A signed release checklist for Culqi sandbox and production cutover (separate gate).

**Do not claim AI Studio live deployment until there is a matching deployed preview URL and pass evidence.**
