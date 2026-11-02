# Reservation-bound receipt and callback lifecycle — 2026-11-02

Application commit `d0997a54b2c37efdebb9468b4c5395605d0d3fc5` (local equivalent `a3f0ab4e9e70bb72bbaea50682f26c3cb257a37f`), exact tree `2432b5752e23001eebd4be85254d8da3f07f822a`.

**Review-only remains unchanged. No new public route, real database/migration, credentials, Culqi SDK/provider request, charge, price change or deployment.**

## Local results

| Stage | Result / boundary |
|---|---|
| Complete Node suite | **228/228 PASS**, zero skipped |
| Actual TSX lifecycle/response harness | **37/37 PASS**, included in228; mocked hooks/window/SDK/fetch, real JSX runtime |
| Receipt/private bridge/React rendering | **14/14 PASS**, included in228; server-rendered markup, not browser pixels |
| Full application build | **PASS**: Vite + TypeScript + structural11/manual4/movement14; movement14 already counted in228 |
| SQL additions | **Pending independent execution at initial publication**: two new cases added,36 total; not executed again in original SIGKILL environment |
| Native concurrency / real processor / browser screenshots | **Not performed** |

The earlier SQL34 pass applies to the preceding application, not the two newly added bridge cases. A subsequent independent SQL report, when available, must state its exact commit and36-case result separately.

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
