# Complete-product persistence evidence — 2026-11-02

Application commit `0808c7a7afae364843ab2644b353565a8a6ed773` (local equivalent `89361789801f0a182aba5f4ad78f8e524a546d25`), exact tree `4fe7f04d53bfe4bda904bd235436d2323c3f1ffc`. Only documentation/logs follow this tested application commit.

## Final results

| Stage | Result | What it proves |
|---|---|---|
| Node suite | **160/160 PASS**, no skips | Existing gates plus injected adapter validation and rejection of the v2 contract by the legacy session re-read |
| Isolated SQL/adapter suite | **28/28 PASS**, no skips | Actual PostgreSQL18.6/PGlite0.5.12 transactions against exact PR23 core fixtures plus PR47 legal and proposed additive migration |
| Independent SQL repeat | **28/28 PASS** | Second clean in-memory database execution of the exact same final code; not 28 additional unique tests |
| Full application build | **PASS** | Vite + TypeScript + structural11/manual4/movement14 checks. Movement14 already counted in Node160 |
| Native concurrent runner | **BLOCKED before tests; 0 scenarios executed** | PostgreSQL17.11 startup failed on Unix socket creation (EPERM), despite successful loopback TCP bind |
| Native runner syntax / git diff | **PASS** | Syntax/whitespace only, not concurrent correctness |

During development, one intermediate SQL test process exited with a file-level failure before an individual case result was captured; its cause was not established. It is not attributed to an application assertion or memory contention. The final sequential full run and a separate clean repeat both completed all28 cases. This does not replace native concurrency verification.

## Substantive SQL coverage

- All15 standalone flavor/size combinations, exact unchanged confirmed prices, **zero fictional bagels**.
- All four supported regular pack prices, optional120g pot and complete immutable commercial lines.
- All26 existing delivery districts: SQL tariff matches server-derived amount; client cannot lower delivery.
- Exact replay returns original order/code/expiry without another order, snapshot, history entry or payment attempt; canonical bagel row ordering.
- Same-price product substitution, changed customer/address/notes, altered legal version, missing/tampered snapshots/items/money: reject without repair or overwrite.
- Expired, cancelled, paid, in-flight, reconciliation-required or provider-ID-bearing reservations cannot restart intake.
- Batch/order/bagel capacity, closed/future windows, missing/infinite delivery dates, elapsed/overlong payment holds.
- Invalid quantities, duplicates, unsupported products and **unpriced combos/extras/minis/premium** rejected. No selling price was invented.
- Atomic rollback after order/item insertion if snapshot or legal stamping fails.
- Default-disabled owner-only policy; no anonymous/authenticated execution, snapshot access or policy writes; service-only RPC, no direct snapshot writes.
- Original financial RPC definitions unchanged; migration replay preserves data/policy; absent core, object collisions and definition drift fail closed.
- Existing financial token-session preparation receives the complete amount without a provider payment.
- Snapshot reader works after synthetic payment and after intake closure, checks stored amounts, exposes no duplicated customer PII and does not reprice or create another reservation.
- No current public API route imports the new persistence adapter.

The old service-role RPC still trusts its caller. New records use a `guided-v1:` pack-slug namespace; the actual legacy HTTP session re-read rejects that contract even with matching bagels/amount. This is a tested application boundary, **not** a claim that the old raw RPC itself was rewritten. Never expose that raw RPC to customers or omit post-RPC validation.

## Native concurrency blocker

Only one native startup attempt. Owned temporary cluster `/tmp/bagelito-native-xAeX14`:

- `initdb` succeeded; PostgreSQL17.11 listened on `127.0.0.1:32971`.
- Creation of `/tmp/bagelito-native-xAeX14/.s.PGSQL.32971` returned `Operation not permitted`; PostgreSQL aborted.
- Owned process stopped; cleanup removed its own data directory and retained logs. No database connection or concurrent case ran.
- No retry, alternate transport, privilege escalation or live database was used.

The committed runner contains six concurrent scenarios and one explicit characterization of the raw legacy RPC boundary. All seven remain **unexecuted** here. PGlite uses serialized access and is not evidence of independent-session lock races.

## Commands and isolation

```sh
npm ci --prefix tests/sql --ignore-scripts
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' npm run qa:product-lines
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
node --check tests/sql/run-native.cjs
node --check tests/sql/native-concurrency.cjs
git diff --check
```

The SQL dev dependency is separately locked; local installation used the already-cached tarball offline, with integrity verification and scripts disabled. The seven baseline files are Git-blob/SHA-256 verified copies from financial PR23; only `CREATE EXTENSION pgcrypto` is removed in fixture execution because `gen_random_uuid` is built in. Current PR47 legal SQL is loaded separately. No environment database URL or secret is read by the fixture.

**No live DB, migration, credentials, Culqi call, charge, deployment, browser or visual QA.** The current public checkout remains unchanged/review-only; proposed policy remains disabled. Fulfillment/receipt integration and real sandbox acceptance are still required. See [proposal and cutover gates](../../guided-product-persistence-proposal-20261102.md).
