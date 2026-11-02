# Public API rate-limit deadline and fail-closed responses

Draft-only correction based on PR47 `10f2b9dde77bd9c8c4614ee56aa823ddb6bdd7e0`.
No flags, credentials, database, DDL, policies, prices, checkout UI, payment provider,
GHL account, deployment configuration or workflow was changed.

## Independent review

A read-only reviewer reran the original 29 tests and reproduced an additional
wall-clock rollback case: `Date.now()` could extend the shared budget. The final
implementation uses `node:perf_hooks` / `performance.now()` and tests an unrelated
wall-clock rollback while retaining only the correct 750 ms remaining budget.
The reviewer then reran all 30 focused tests successfully and found no remaining
blocker in the limiter/test scope. Final code, tests and aggregate checks were
repeated after that correction.

Raw outputs are preserved byte-for-byte in the corresponding `.log.gz` files.
Readable `.log` copies remove only ANSI escape sequences, trailing whitespace and
trailing blank lines; warnings, failed attempts and assertions are retained.

## Reproduced defects

The previous limiter awaited `consume_api_rate_limit(...).single()` indefinitely.
A hanging database transport could block status recovery or checkout before their
own bounded work began. It also treated any truthy `allowed` value as permission
and could coerce malformed retry values into `NaN`/unbounded `Retry-After` values.

The initial 25 focused tests produced **7 PASS / 18 FAIL**, zero skips/cancelled
(`red.log`). Four additional status-route wiring cases and one monotonic-clock regression were
added after this RED run and are not claimed as part of it.

## Correction

- One **2,000 ms total monotonic-clock budget** for requester plus optional contact consumption.
- Each RPC receives the abort signal; promise racing bounds a transport that
  ignores it. Elapsed time is checked again before accepting a late response.
- Timeout/transport/malformed envelope returns a sanitized **503**, never a grant
  or a false **429**. Only literal boolean `true` authorizes the next stage.
- Valid boolean denial remains **429**; integer retry values are bounded to
  `[1, configured window]`. Missing/null retry uses that window; malformed types,
  negative/fractional values and non-finite values fail closed with 503.
- No retry. Abort is best effort, not rollback: a slot may have been consumed
  remotely even if the client times out. A late reply cannot start the contact RPC.
- Existing hashing, limits, scope names, requester selection, honeypot behavior
  and sequencing remain unchanged. Proxy/IP-header trust is **not** solved here.

## Verification

The focused suite runs the real limiter in a VM using a synthetic database double
and deterministic clock/timers. Four cases execute the real status route with that
limiter; config/body/order readers are explicitly stubbed to isolate the wiring.
They prove sanitized uncached timeout response and that denied/malformed replies
never create the order reader. They are not HTTP socket, Supabase or Culqi tests.

- Final focused suite: **30/30 PASS**, zero failures/skips/cancelled (`green.log`).
- Final full Node suite: **285/285 PASS**, zero failures/skips/cancelled
  (`node-full.log`): 255 existing cases plus 30 new cases, counted once.
- Standalone TypeScript and final complete build **PASS**, exit 0. Build includes
  11/11 structural, 4/4 manual fallback and 14/14 movement controls; movement cases
  overlap with the Node suite and are not added to its count.
- Results are recorded in `results.json` alongside exact commands, outcome
  boundaries and file hashes in `manifest.json`.
- Two initial aggregate build attempts were SIGKILLed (exit 137), not TypeScript
  diagnostics. Logs are retained, not presented as pass. The successful final run
  was serialized after Node checks finished, with heap 512 MiB, semi-space 4 MiB
  and worker/thread limits of one. That material execution change allowed a full
  run; the SIGKILLs' underlying cause was not independently diagnosed.
- The first full Node attempt omitted the required HDR fixture and failed three
  driver files. With the existing pinned offline HDR verified by SHA-256, the
  intermediate 280-case suite passed before the four additional route cases and monotonic-clock regression.
  The final suite reruns all tests, not just those additions.

No new browser or SQL validation is claimed: no UI or SQL changed. Prior 10 browser
and 36 SQL results remain evidence for their original exact candidate, not new
checks for this fix. No live purchase, real rate-limit RPC, deployed proxy trust,
network cancellation/rollback, GHL connection or production readiness is certified.

## Independent review

A read-only reviewer reran the original 29 tests and reproduced an additional
wall-clock rollback case: `Date.now()` could extend the shared budget. The final
implementation uses `node:perf_hooks` / `performance.now()` and tests an unrelated
wall-clock rollback while retaining only the correct 750 ms remaining budget.
The reviewer then reran all 30 focused tests successfully and found no remaining
blocker in the limiter/test scope. Final code, tests and aggregate checks were
repeated after that correction.

Raw outputs are preserved byte-for-byte in the corresponding `.log.gz` files.
Readable `.log` copies remove only ANSI escape sequences, trailing whitespace and
trailing blank lines; warnings, failed attempts and assertions are retained.

## Reproduce

```sh
node --test tests/public-api-security-deadline.test.cjs
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=4' npm run typecheck
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=1 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 npm run build
```

HDR SHA-256: `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`.
The fixture is pre-existing and remains outside Git. No network retrieval or
dependency installation was performed for this validation.
