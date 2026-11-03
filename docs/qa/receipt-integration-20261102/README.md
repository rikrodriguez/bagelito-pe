# Reservation-bound receipt and callback lifecycle — 2026-11-02

Application commit `d0997a54b2c37efdebb9468b4c5395605d0d3fc5` (local equivalent `a3f0ab4e9e70bb72bbaea50682f26c3cb257a37f`), exact tree `2432b5752e23001eebd4be85254d8da3f07f822a`.

**Review-only remains unchanged. No new public route, real database/migration, credentials, Culqi SDK/provider request, charge, price change or deployment.**

## Original local results

| Stage | Result / boundary |
|---|---|
| Complete Node suite | **228/228 PASS**, zero skipped |
| Actual TSX lifecycle/response harness | **37/37 PASS**, included in228; mocked hooks/window/SDK/fetch, real JSX runtime |
| Receipt/private bridge/React rendering | **14/14 PASS**, included in228; server-rendered markup, not browser pixels |
| Full application build | **PASS**: Vite + TypeScript + structural11/manual4/movement14; movement14 already counted in228 |
| SQL additions | **Pending independent execution at initial publication**: two new cases added,36 total; not executed again in original SIGKILL environment |
| Native concurrency / real processor / browser screenshots | **Not performed** |

The earlier 34-case SQL pass applies to the preceding application, not the two newly added bridge cases. The local results above retain their initial-publication boundary. The following independent SQL execution subsequently verified all 36 cases on the exact receipt-integration version; the counts are kept separate from the earlier SQL run and 228 local tests.

## Independent in-memory SQL results

**36/36 PASS, exit 0, zero failures/cancelled/skipped/todo**, executed sequentially in the separate existing Bagelito environment on 2026-11-02. No application, SQL, fixture, test semantics or dependency changed for this run. Documentation evidence was added afterward.

| Identity | Exact value |
|---|---|
| Tested remote/evidence HEAD | `cdcaded9bb348405b34e6e44726230e2bb6f7cd2` |
| Tested HEAD tree | `bd2ef4c2d2df8871b2bb6f82f0495b811ec3bcf3` |
| Application commit | `d0997a54b2c37efdebb9468b4c5395605d0d3fc5` |
| Application tree | `2432b5752e23001eebd4be85254d8da3f07f822a` |

Node `v24.19.0`, npm `11.9.0`, pinned PGlite `0.5.12`, existing TypeScript `5.9.3`. The previously verified installations were reused; no package resolution/install or credential configuration was performed. Exact command and working directory: [sql-independent-command.txt](sql-independent-command.txt).

```sh
NODE_PATH=/workspace/sql-validation-f6f96bb/typescript-loader/node_modules \
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
node --wasm-num-compilation-tasks=1 --test --test-concurrency=1 \
  --test-reporter=tap tests/sql/product-lines.test.cjs
```

[TAP output](sql-independent.tap) preserves all 36 individual results. [Structured evidence](sql-independent-results.json) includes exact identities, pre-execution tracked file SHA-256 values, the seven verified financial fixture SHA-256/Git blob identities, command, versions, timestamps, exit code, per-case results and resource counters. The original raw output remains unchanged in the executor. Published TAP normalizes only checkout-path prefixes and trailing whitespace; raw/published hashes are recorded. The fixture source manifest identifies PR23 commit `085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca`; that commit itself was not locally available, so no direct source-tree comparison is claimed.

New cases 35–36 connect the actual synthetic reservation/financial coordinator to the private injected receipt reader. A pack of six sesame bagels plus a 120 g pot and a standalone 240 g pot produce complete detail with `isFiscalReceipt=false` and `fulfillmentAuthorized=false`. The reader makes one read RPC and leaves reservation/payment row counts unchanged. Pending actual detail, mismatched order code and absent snapshot are rejected without another reservation or payment attempt. These are plain contract outputs, not browser-rendered pixels or actual provider callbacks.

The run completed in 6.553 s with no SIGKILL; maximum child RSS was 1021700 KiB under the 16 GiB cgroup limit. OOM/max/kill counters stayed zero. This current result does not establish the cause of the previous executor's SIGKILL, which remains unknown.

The fixture supplies `new PGlite()` with no URL, data directory, credential or socket. Current legal/proposed guided SQL is loaded only into owned in-memory engines. SQL migrations, financial core, fixture and lockfile are unchanged from the independently verified preceding version. The TypeScript VM rejects external runtime imports; the coordinator's real-provider type import is erased, charge observations are fabricated callbacks, and `fetchCharge` throws. No provider client, real database, credential read, native PostgreSQL/Docker/socket attempt or workaround was used.

The private reader remains unregistered and requires prior caller authorization/trusted payment state; the status endpoint still does not expose product snapshots. Source stays review-only/default-disabled, non-fiscal and without dispatch permission. No prices, policy, workflows, application/test code, environment credentials, deployment or merge changed. **Native concurrency/lock-race and real processor sandbox/3DS/webhook/refund acceptance remain untested.** No readiness or fulfillment authorization follows from these 36 serialized simulations.

## Independent real-browser component results

**8/8 PASS**, observed in the actual Chrome accessibility tree and screenshot at 2026-11-02 15:16–15:17 UTC. This separate fixture used real ReactDOM and the unchanged application components from `d0997a54`; it did not use the simulated-hook Node harness. These eight cases are not added to the 228 Node or 36 serialized SQL counts.

The private static fixture was compiled with the already installed esbuild binary, opened in its own browser tab, and started through the visible **Run isolated QA** button. [Exact harness](browser-harness.tsx.txt), [HTML/CSP](browser-page.html.txt), [static server](browser-static-server.cjs.txt), [source/bundle hashes](browser-source-sha256.txt), and [observed accessibility output](browser-ax.txt) are retained. The screenshot was visually inspected during execution; no screenshot artifact is included here. The archived fixture files are evidence, not an installed application route or CI runner.

Cases cover unmount during reservation, changed-cart response invalidation, late recovery, wrong paid order identity, double recovery clicks, late widget token, late paid poll, and a complete historical receipt. The final rendered detail visibly contained **6 × Sesame**, **1 × Whipped Original · 120 g**, products **S/62**, delivery **S/8**, total **S/70**, and the non-fiscal/no-dispatch disclaimer. The current editable fixture cart contained Plain; it did not replace historical products.

All fetches stayed intercepted for the page lifetime, SDK/3DS objects were inert mocks, and localStorage was replaced with a fresh in-memory map without reading or clearing actual stored recovery. Empty ready-marker script tags had no external source; response and page CSP denied all connections, frames, images and forms. The amounts and identity were synthetic test evidence, not a price or live transaction approval. Actual SDK loading, network, provider, database, webhook, authentication, production storefront layout and mobile fidelity were not tested by this fixture.

The existing private Sites preview was **stopped** before use. Only the owned QA tab was closed and the temporary preview was stopped afterward; stopped status was confirmed. No published site, existing tab, real order or credential changed.

Independent evidence was also verified locally: all four files in SQL evidence commit `9f19269d` matched their Git blob hashes, its exact tree `f50169f95aed2460a94652aea32ba68cca0193a7` matched the local synchronized tree, and all 89 pre-execution tracked-file SHA-256 values matched their tested versions.

## Regression evidence

A preserved13-case early harness against the previous TSX produced **1 PASS /12 FAIL**. It demonstrates late reservation/preparation continuation, stale recovered confirmation, duplicate recovery and insufficient paid-response validation. That is not a claim that all37 final cases were run as RED. The final harness adds affirmative controls and stricter reservation/preparation cases; its double-event test invokes the same captured handler twice before re-render, matching a queued duplicate event rather than clicking a removed element.

Baseline TSX SHA-256: `5ada3d9f7362c570a3e87841c0c5a61ebcc5a1858752f2bfc85f6dd547f0cc84`, from remote documentation HEAD `4f2f59dff579a2b954bf40b93f0bf1109d9827eb` (local `fa513ac4a1843bc18e2ce45fa99b190361fdb9ae`). Original13-case test source is preserved as `lifecycle-red-harness.txt`; original output is `lifecycle-red.log`.

## Substantive coverage

- Unmount or changed order/customer before reservation or preparation returns prevents later payment preparation/widget opening. Equal-content re-renders remain valid and a new context can start an explicit new attempt.
- Late widget callbacks, antifraud-device results, charge responses, status polls and waking poll timers cannot continue abandoned work or call `onPaid`.
- Duplicate widget/recovery events coalesce. Pending recovery is retained across a changed context; the next action consults status instead of creating another reservation.
- Reservation response must echo checkout UUID and valid order code, safe positive minor amount and future expiry. Preparation must return a valid payment-attempt UUID, equal amount and the same expiry, not an extended hold.
- Paid observations require matching order, known reserved amount when available, affirmative success, valid payment/order state and no reconciliation. Failed/expired observations are also identity-bound before clearing recovery.
- Recovery without a product snapshot deliberately returns no product lines. A valid snapshot supplies its actual historical products, never the new editable cart. A malformed supplied snapshot fails rather than silently disappearing.
- All15 pots and four supported pack compositions preserve names, quantity, grams and historical money; extra fields cannot inject PII/token/cart data.
- The private injected receipt bridge issues one read RPC only after a valid trusted payment context. Missing/corrupt/wrong-order/unpaid snapshots cannot produce complete detail. No public/browser module imports that server reader.
- Actual React component markup shows pot grams, product/delivery breakdown and registered total, with explicit non-fiscal/no-dispatch wording. It renders no pay button, external link or script.

## Remaining integration boundary

The existing status endpoint is unchanged and does not yet deliver stored product snapshots. The newly added private bridge is **not** an HTTP endpoint or an authorization mechanism. Its future caller must authorize the order and obtain authoritative payment/reconciliation state before using it. No browser may call a service-role RPC directly.

Consequently current legacy status responses can show verified code/total with missing-detail notice; they cannot claim a complete product receipt. The landing remains review-only and does not mount Culqi. The approved storefront/mockup assets and prices are unchanged.

Callback invalidation is not server-side cancellation or proof that an in-flight charge rolled back. Cleanup retains payment recovery; it never enables an automatic second payment. The detail authorizes neither fulfillment nor fiscal issuance, and does not infer a payment/delivery date from snapshot creation time.

[Implementation boundary](../../guided-receipt-integration-20261102.md).

## Commands

```sh
NODE_OPTIONS='--max-old-space-size=320 --max-semi-space-size=4' \
  QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
```
