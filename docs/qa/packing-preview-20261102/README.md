# Read-only packing / source reconciliation — 2026-11-02

Application commit `5067c70ad6290eab7ab67a6b7969d37ce5e0853d` (local equivalent `e85afb7390fcba1385fece36c10a65583882d91f`), exact tree `08d971acd9506228d002fd66fd6eb54e29bdd4d1`. Only these evidence docs/logs follow the application commit.

**Draft only. Not a ready-to-sell checkout. No live database, migration, credentials, provider transaction, outgoing customer message or deployment.**

**Subsequent evidence:** a separate existing Bagelito coding environment completed the revised SQL suite at34/34 after a one-line test-only VM comparison correction. [Independent report](../sql-independent-20261102/README.md) preserves original and corrected runs for both application versions. The results below remain the historical record of this executor; they are not overwritten or relabeled as passed.

## Results

| Stage | Result |
|---|---|
| Regression against earlier reader | **RED:12 PASS /1 FAIL**; accepted a numeric-string gram value instead of rejecting an inconsistent snapshot |
| Final top-level Node suite | **174/174 PASS**, zero skipped |
| Full TypeScript | **PASS** with640MB old-space; an earlier320MB attempt exhausted the V8 heap |
| Full build | **PASS**: Vite, TypeScript, structural11, manual4 and movement14; movement14 are already included in Node174 |
| Revised isolated SQL suite | **BLOCKED before cases: SIGKILL**.34 cases present,0 individual results from final execution |
| Native concurrent suite | **NOT rerun**; previous Unix-socketEPERM blocker remains |
| Public exposure/default-disabled source gate | **PASS**, included in174; this is a source assertion, not a live DB permission check |
| JS test-file syntax / git diff | **PASS** |

There were multiple diagnostic SQL starts, not a hidden passing run: the first produced only file-level failure; TAP diagnostics established SIGKILL. Smaller V8 heap, single WASM compilation worker, no test-worker isolation and a one-case/one-engine diagnostic also failed before case results. After the other preview was stopped, a single coordinated final retry again ended with SIGKILL in approximately1.3seconds. **The underlying reason was not established**; it is not attributed to a SQL assertion, application defect or another agent. No further SQL retries were made after that final attempt.

The suite was separately changed to avoid keeping two PGlite engines alive concurrently: initial policy state is captured immediately after migration, before fixture reset; the missing-prerequisite case closes the old engine before opening the clean fixture. All permission/default/core-definition assertions remain. This reduces a known fixture peak but did **not** resolve the observed kill.

**Do not reuse the earlier28/28 SQL PASS as evidence for this changed reader SQL or the six new cases.** No new SQL case, native lock race, actual Culqi sandbox or browser scenario is claimed as passed here.

## What the passing Node tests establish

- Typed V1 composition: supported pack identity, actual quantity totals, unique regular bagel SKUs, one matching pot, numeric120/180/240g, correct optional-pot size and complete products.
- Fifteen pot flavor/size combinations and all four supported pack compositions, with/without optional120g pot, project without imaginary bagels.
- Historical stored prices and legal version are preserved; current menu prices are not used to reprice a prior order.
- Identity, metadata, integer bounds and stored subtotal/delivery/total consistency are checked.
- Unknown extensions/PII/token fields are stripped; result arrays do not mutate the source.
- All payment statuses, including `paid`, remain informational: `fulfillmentAuthorized` is always `false` and the view is explicitly `commercial-review`.
- Injected reader makes one read-only RPC, rejects wrong-order snapshots and never falls back to an incomplete bagel-only representation.
- No current public route imports the new adapter/parser/preview; SQL source still defaults policy to disabled and revokes policy writes from consumer/service roles.

## Proposed SQL hardening / unexecuted additions

The SQL reader now compares `order_items`, `pack_units` and the versioned pack slug with the stored product detail, in addition to the existing money checks. This is code review/syntax-level work only until the SQL suite runs in a functional environment. It does not prevent an owner from coherently rewriting every trusted record.

Six added isolated tests are present but **unexecuted**:

1. Complete pack+pot and standalone-pot reservations through actual financial SQL/coordinator with fabricated in-process charge evidence, then read-only packing and replay.
2. Lower synthetic charge amount cannot mark the full order paid.
3. Synthetic provider timeout preserves lines and prevents automatic second attempt.
4. Synthetic3DS continuation uses the same source and complete amount.
5. Missing pot detail cannot produce an incomplete packing preview.
6. Missing/changed/invented bagel rows or mismatched header cannot produce a contradictory preview.

No provider client is imported by these tests; `createCharge`/`fetchCharge` are local callbacks, and the database is in-memory PGlite using immutable financial fixtures. Even a future pass will prove **simulation only**, not real processor acceptance.

## Commands

```sh
NODE_OPTIONS='--max-old-space-size=320 --max-semi-space-size=4' \
  QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  node node_modules/typescript/bin/tsc --noEmit
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
# BLOCKED here; do not interpret the file-level failure as34case results:
NODE_OPTIONS='--max-old-space-size=320 --max-semi-space-size=4' \
  node --wasm-num-compilation-tasks=1 --test --test-concurrency=1 \
  --test-reporter=tap tests/sql/product-lines.test.cjs
```

## Open decisions and rollout gates

[Source reconciliation](../../combo-extra-source-reconciliation-20261102.md) recovers the owner's actual menu attachment and three published bundles; it does not authorize assigning those prices to the current two-plus-one journey. Offer reconciliation and conditional second-pack upsell margin remain pending. No selling price or UI changed.

A functional SQL/concurrency environment, reviewed public/admin/fulfillment integration with authorization guards, actual schema/cutover approval and real sandbox acceptance are still required before production activation. This layer creates neither a fiscal receipt nor permission to dispatch goods.
