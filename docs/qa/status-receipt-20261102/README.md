# Status receipt — independent verification, 2026-11-02

**Draft, review-only, default-off and sandbox-only. This is not a live checkout or production acceptance.** The candidate was fetched by exact SHA into an isolated checkout while PR47 remained at its expected parent. No application, SQL, test semantics, lockfile, configuration, workflow or credentials were changed during verification.

## Exact candidate

| Identity | Value |
| --- | --- |
| Candidate commit | `84425e3a09ab9a8f27d63af219d50b4d34e789ca` |
| Candidate tree | `8459ffc1fc3ae8d844daa9d0e3deaaf20fc1273e` |
| Parent / expected PR47 remote head before publication | `e85c984d079b3f5f4bb62a76affbba4a00764d68` |
| Canonical public dependency manifest SHA-256 | `710fbebce2a60627aa45e729e13f63051861243d0d1e771f6686216ab52426be` |

All pre-execution tracked file hashes still matched after the checks. Evidence documentation was added afterward. The publication commit adds only this directory above the reviewed candidate; its final commit/tree identity is returned after publication because embedding its own hash would be self-referential.

## Results kept separate

| Check | Actual result |
| --- | --- |
| Independent SQL36 | **36/36 PASS**, exit 0, zero failures/skips/cancelled/todo; 6.672 s |
| Independent final TypeScript | **PASS**, exit 0; 6.843 s |
| Independent full build | **PASS**, exit 0; Vite client/SSR/Nitro, TypeScript and all existing build controls; 9.409 s |
| Build structural controls | **11/11 PASS** |
| Build manual fallback controls | **4/4 PASS** |
| Build movement tests | **14/14 PASS**, zero failures/skips; counted within this build command |
| Optional full Node 255 suite | **Not rerun here**. Parent's local 255 PASS is separate evidence; no local HDR fixture was used or downloaded |
| Real provider / native concurrency / deployment | **Not performed** |

Do not sum SQL, Node and build-control counts. SQL36 was not repeated after dependency reconstruction: it had already passed on this exact candidate, and all source/test/SQL/fixture hashes remained identical. The SQL runtime does not load the new HTTP status service; its endpoint/gate/deadline contracts belong to the separate Node tests. No full Node 255 or browser result is reassigned to this executor.

The successful final checks were run after a material dependency change. The initial compiler attempt exited 2 with missing `@types/node` (`TS2688`), and initial build exited 127 with `vite: not found`. Those were dependency blockers, not application diagnostics. They remain in the initial logs. Neither those attempts nor the final checks were SIGKILLed. The previous executor's SIGKILL still has no established cause; this result does not diagnose it.

## Exact commands and environment

Node `v24.19.0`, npm `11.9.0`, PGlite `0.5.12`, TypeScript `5.9.3`. [commands.txt](commands.txt) preserves every command and working directory, including initial blocked attempts. Final checks:

```sh
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 node node_modules/typescript/bin/tsc --noEmit
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 npm run build
```

SQL36 used the already verified pinned PGlite and TypeScript installations:

```sh
NODE_PATH=/workspace/sql-validation-f6f96bb/typescript-loader/node_modules NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' node --wasm-num-compilation-tasks=1 --test --test-concurrency=1 --test-reporter=tap tests/sql/product-lines.test.cjs
```

[SQL TAP](sql36.tap), [TypeScript output](typecheck.log), [full build output](build.log) and [structured verification](verification-results.json) retain terminal outcomes, all 36 SQL cases, exact file identities, versions, timing, exit codes, counters and raw/published log hashes. Build output retains 20 nonfatal module-level `use client` directive warnings plus the bundler group-name/tracing notices. They were not suppressed or corrected. The Vite production build mode here is compilation, not a deployment or live provider action.

## Dependency provenance and history

The isolated environment initially lacked the frontend graph and the candidate has no compatible root lockfile. An authorized private Library archive could not be materialized because the executor proxy rejected the transfer with 403. No archive bytes arrived, so its supplied size/hash was never claimed as verified. That transfer was not retried or bypassed; proxy, network and credentials were not changed. [dependency-history.json](dependency-history.json) preserves the sanitized sequence and initial diagnostics without signed URLs or private transfer headers.

A subsequent, explicitly authorized operation reconstructed only publicly available npm packages from the original installation inventory. [public-npm-manifest.json](public-npm-manifest.json) contains exactly 197 unique package paths, 22 internal symlinks and 18 direct versions. The supplied canonical SHA-256 matched before further download/extraction. Every URL was the exact unauthenticated HTTPS `registry.npmjs.org` tarball URL; redirects stopped rather than switching hosts. Every supplied SHA-512 was verified before extraction. No `npm install`, resolver, version selection, `.npmrc` read or installation lifecycle script ran.

Archive paths and regular file types were validated; tar links/special files were rejected. Standard npm-equivalent extraction stripped one validated root: `package/`, or the official DefinitelyTyped name/version root whose embedded package name and version matched the manifest. The private verifier's initial stricter prefix assumptions are recorded in history; no tarball contents, versions or integrities were changed. Only the 22 manifest-listed internal `.bin` links were created. Final installed package inventory was exactly 197, with all 18 direct versions confirmed. [public-npm-verification.json](public-npm-verification.json) records each verified tarball's SHA-256, bytes, root and member count; supplied SHA-512 values remain in the canonical manifest.

The reconstructed installation stayed private and was temporarily linked only to this isolated checkout. The link was removed after checks, and generated `.output` artifacts were moved to the private evidence directory. No dependency files, generated outputs or lockfile were committed. Application source hashes remained exact.

## Local and browser confirmation

On the same application, the original executor additionally verified **255/255 Node tests** (27 new endpoint/contract cases), plus **10/10 actual Chrome/ReactDOM cases** with simulated fetch/SDK. [Detailed boundaries and commands](LOCAL-AND-BROWSER.md), [Node log](local-node.log), [browser observation](browser-ax.txt), and [structured local results](local-results.json) preserve these separate runs. The final minimized receipt rendered the historical Sesame bagels and 120 g Original pot rather than the editable Plain cart. The private preview was stopped after QA.

The publishing agent independently checked all 11 files in cloud evidence commit `1f82ec11` against Git blob hashes, verified its exact tree `81713b06105fd19df1924666b946419141e71f3e`, verified all 143 candidate-file SHA-256 values, and matched the canonical 197-package manifest. This later evidence update changes documentation only.

## Limits

SQL36 used only fixture-owned in-memory PGlite and fabricated charge observations. No real provider SDK/client was loaded by that suite, and no provider, database URL, credentials, native PostgreSQL, socket workaround or Docker was used. Seven immutable financial copies still match their manifest SHA-256/Git blob identities; current legal/guided SQL was loaded only in memory. No real migration, price/policy activation, payment, deployment, merge or external message occurred.

The new status receipt path stays default-off, sandbox-only and denied in production/live. The order-code/UUID pair is a capability, not person authentication; no atomic transaction or lock across reads is claimed. The service's 5 s global/2 s operation budgets do not cover body reading or the existing rate limiter. Deployed proxy trust/rate-limiter behavior remains a separate integration boundary. Minimal historical detail remains informational, non-fiscal and never authorizes packing or dispatch.

These checks do not certify real Culqi sandbox/3DS/webhook/refund acceptance, native concurrency/lock races, public activation, fiscal issuance, fulfillment or merchant launch readiness. The authorized publication contains only the reviewed candidate plus this sanitized evidence.
