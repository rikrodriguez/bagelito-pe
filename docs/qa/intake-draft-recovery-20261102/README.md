# HTTP intake, cart recovery and price evidence — 2026-11-02

Application commit `fb1940f198817b9bb5931ccf80805cb83d34c213` (local equivalent `fc3e2dd6a5850308ca1b3480a0928780dcaf4974`), exact tree `e421cb2d8849d818532b7d1d547f579795717ecc`. Only these evidence files follow the tested application commit.

## Verified results

- **147/147 Node tests PASS**, zero skipped (128 previous + 19 new).
- **Full build + TypeScript PASS**; structural 11/11, manual fallback 4/4 and movement 14/14. Movement cases are already in the 147, not additional unique tests.
- **HTTP RED: 2/2 regression tests failed** on the prior reader. A never-settling stream cancellation kept both the 408 deadline and 413 size rejection from returning. The reader now initiates best-effort cancellation without awaiting it, handles cancellation rejection and releases the reader lock. The original two-second total deadline, size limits, JSON-only content type and object-only payload rule are unchanged.
- **10 HTTP tests:** actual in-process `Request`/`ReadableStream` with controlled time; stalled cleanup, oversize cleanup, rejected cleanup, whole-request deadline across chunks, split UTF-8 success, actual byte limits, declared limits/content type, malformed roots/UTF-8, absent body and stream error. No sockets or provider requests.
- **Cart RED: 5 failures / 2 passes** using the prior component source and the final seven tests. Four behavioral failures expose lost mode/malformed recovery/incomplete extra recovery; the fifth is the new notice's source assertion, not a pre-existing visible-notice defect.
- **7 cart tests:** execute the actual extracted save/restore effects. Persist and restore `upsell8`/`downsell2` without PII; coherent legacy drafts; explicit rejection of ambiguous/malformed drafts without inventing an offer; preserve partial selections without going to cashier; review-only never accesses storage or renders the notice. Invalid draft notice is dismissible. This is handler-level coverage, not mounted React/browser QA.
- **2 evidence tests:** all original/flavored schmear size prices match the user-supplied published-menu image; the separate Halloween promotion does not replace normal pack or historical combo prices.

## Price clarification

The current user-supplied screenshot of `bagelito.pe` menu slide 4/6 was visually inspected:

| Pot | Whipped Original | Flavored |
|---|---:|---:|
| 120 g | S/12 | S/16 |
| 180 g | S/18 | S/23 |
| 240 g | S/22 | S/29 |

All values were already correct in the catalog. **No price changed.** The 180 g editable-Canva discrepancy is resolved by this published-menu evidence. Separate confirmation metadata records the review date and SHA-256 without republishing the user image. The Halloween S/48 and S/90 pack promotion visible above is not an ordinary pack price and was not imported. This image does not establish current inventory, combo/extras prices or payment authorization.

## Reproduction and limits

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
git diff --check
```

No real database/provider/HTTP integration test, sandbox transaction, browser QA or responsive visual comparison was performed for this patch. Tests inject only synthetic streams, time, storage and state setters. No credentials, financial flags, schema or live site were changed. `reviewOnly` remains active, including no cart storage; its visual assets/layout are unchanged. The new recovery notice belongs only to the non-review legacy flow and is not visually signed off.

Product-line persistence, current two-bagel combo and extras pricing, isolated Culqi E2E and any deployment remain separate pending work. See [product-line commercial evidence](../../guided-product-lines-readiness-20261102.md). Local results are not remote CI or readiness to sell.
