# Independent in-memory SQL validation — 2026-11-02

**Draft/review only. No real database or provider acceptance.** These are independent, serialized PGlite executions on a separate resource context, not retries of the native Unix-socket operation that previously returned EPERM. No native harness or socket workaround was attempted.

## Results kept separately

| Application version | Test tree | Cases | Pass | Fail | Skipped | Exit |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Original `5067c70` at evidence HEAD `f6f96bb` | Untouched original | 34 | 33 | 1 | 0 | 1 |
| Original `5067c70` at evidence HEAD `f6f96bb` | One-line local assertion correction | 34 | 34 | 0 | 0 | 0 |
| Latest `13e0cc3` at evidence HEAD `67acdf2` | Untouched latest | 34 | 33 | 1 | 0 | 1 |
| Latest `13e0cc3` at evidence HEAD `67acdf2` | Final one-line assertion correction | 34 | 34 | 0 | 0 | 0 |

**Do not sum these case counts or call either untouched commit 34/34 passing.** All six added cases (29–34) passed in each run: complete pack/pot coordinator flow and replay; mismatched lower amount; timeout; synthetic 3DS continuation; missing pot detail; inconsistent bagel/header rows. Their observations are fabricated local callbacks, not Culqi transactions. Earlier 28-case SQL and 174/177 Node/build results are not substituted for these executions.

The final runtime/test code was tested on local branch `qa/sql-independent-20261102` based exactly on `67acdf2`. Only the assertion changed. The evidence files were then added; they do not alter runtime code. Final publication commit/tree identifiers are returned by the executor after committing and verifying the remote, rather than embedding a self-referential commit hash here.

## Exact identities

| Item | Identity |
| --- | --- |
| Original remote/evidence HEAD | `f6f96bb60951f5e1ba170ea1c5c9fdc74894335a` |
| Original HEAD tree | `4444a473d50246c0eab80dbf4fea20fe15e8f7e4` |
| Original application commit | `5067c70ad6290eab7ab67a6b7969d37ce5e0853d` |
| Original application tree | `08d971acd9506228d002fd66fd6eb54e29bdd4d1` |
| Latest expected remote/evidence HEAD | `67acdf2e70f03141e019f2bc53915751a257995e` |
| Latest HEAD tree | `0b17c4c23d29879bf1a2209f84988b604e9056e1` |
| Latest application commit | `13e0cc398c2fcb701854a62dd7c4317765fddf06` |
| Latest application tree | `38b91416ffa33a744f1b5068953425698a491d8a` |
| Final tested code tree, before these evidence docs | `de525e00c34672243ff276fdea5d33d2e64720db` |
| Corrected test file SHA-256 | `4d4a614bc98a1d102b258a4e42609d8ed48729575219422df438ad38c3cd50a2` |

Between the two application versions only the product RPC adapter and its unit tests changed. `tests/sql/`, all `supabase/` SQL, fixture sources and lockfile are unchanged. Latest adapter sanitizes rejected promises/malformed envelopes with a single injected RPC call and no automatic retry. No new provider imports, database clients or external runtime paths were added. Neither checkout contained `AGENTS.md` or applicable local skill files. Both requested proposal/packing documents and the latest RPC evidence README were read.

## Case 27: test harness correction

Both untouched runs failed at the same assertion in `tests/sql/product-lines.test.cjs:224`, reporting identical structure but `deepStrictEqual` prototype inequality. The real parser is loaded through `vm.runInNewContext` and constructs objects in that VM realm; `clone(created.lines)` uses host `JSON.parse`. A separate reproduction through the actual loader and a fabricated RPC, without creating a database engine, confirmed identical serialized values, differing object prototypes, failure of the original comparison and success after normalization.

```diff
-assert.deepEqual(snapshot.lines,clone(created.lines))
+assert.deepEqual(clone(snapshot.lines),clone(created.lines))
```

The existing clone helper is JSON serialization/parsing. Applying it symmetrically compares all validated JSON fields, nested values, array order, flavor, quantity, grams and historical stored amounts. No SQL or application behavior was corrected. Independent read-only review confirmed this cause and the one-line test-only correction. Original failure logs are preserved alongside corrected logs.

## Command, versions and dependencies

Node `v24.19.0`; npm `11.9.0`; PGlite `0.5.12`; TypeScript `5.9.3`. All runs used:

```sh
NODE_PATH=/workspace/sql-validation-f6f96bb/typescript-loader/node_modules \
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
node --wasm-num-compilation-tasks=1 --test --test-concurrency=1 \
  --test-reporter=tap tests/sql/product-lines.test.cjs
```

[commands.txt](commands.txt) preserves each exact command and working directory. `NODE_PATH` points only to the existing TypeScript loader installation. PGlite is resolved from `tests/sql/node_modules` and remains the sole database engine/dependency in the SQL lockfile. It was installed once from the pinned lock with lifecycle scripts disabled:

```sh
npm ci --prefix tests/sql --ignore-scripts --no-audit --no-fund \
  --cache /workspace/scratch/bagelito-sql-npm-cache
```

TypeScript was absent in this fresh environment. Its exact `5.9.3` entry/integrity was recovered from the clean saved checkout's existing lockfile and matches the version recorded by PR47's prior lock audit. It was installed separately with `npm ci --ignore-scripts --no-audit --no-fund`; no version was newly selected, target manifest/lockfile added, or frontend graph installed. Latest checkout reused those verified installations. The saved original checkout stayed clean and its branch was not switched.

Seven financial SQL copies match both SHA-256 and Git blob identities in `SOURCE.json`; [results.json](results.json) records all seven. Manifest source is PR23 commit `085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca`. That source commit was absent locally, so no direct source-tree comparison is claimed. The fixture loads those immutable copies, current PR47 legal SQL and the proposed guided-product SQL only into its owned in-memory PGlite engines; only the documented pgcrypto extension line is removed.

## Resources and evidence integrity

All four executions completed with per-case results and no SIGKILL. Current environment cgroup limit was 16 GiB; `max`, `oom`, `oom_kill` and `oom_group_kill` counters remained zero. Timing, maximum child RSS, resource snapshots, exit code, command, versions and all 34 individual results per run are in [results.json](results.json). This does **not** establish the cause of the old executor's SIGKILL; that cause remains unknown, and the old terminations are not labeled SQL assertion/application failures.

Published TAP logs remove trailing whitespace and normalize absolute checkout prefixes to `<checkout-f6f96bb>/` and `<checkout-67acdf2>/`. All case results and diagnostics are otherwise preserved. Raw and published SHA-256 values are in `results.json`; no environment/credential values were captured. Original raw evidence remains unchanged in the independent executor.

## Limits

The fixture calls `new PGlite()` with no URL, data directory, credential or socket argument. The application loader's VM has no `process`/`fetch`, rejects external runtime imports, and erases the coordinator's type-only provider import. `createCharge` observations are fabricated in process and the injected `fetchCharge` always throws. No Culqi client was loaded or contacted.

No real database/migration/credential inspection, native PostgreSQL, Docker invocation, Unix socket retry/workaround, privilege escalation, real payment, spending, workflow creation, deployment, customer/external message or production activation occurred. Publication is limited to this test correction and QA evidence in draft PR47. No SQL/application/route/policy/offer/price changed. Source remains review-only/default-disabled; fixture resets enable only its own in-memory policy. Combo 2+1 pricing remains unresolved.

**Native concurrency/lock-race acceptance and real processor sandbox/3DS/webhook/refund acceptance remain untested.** These serialized simulations do not establish browser acceptance, fulfillment authorization, live schema compatibility, cutover approval or merchant launch readiness.
