# Culqi body deadline and gate regression — 2026-11-02

Application `783357ae00acb2f6d5e0aa84fbb3f6e06848cb7a`; tested local `c6968ea564b5318903375d54622e24f829b8289a`; identical Git tree `86ee3c3bb465ea57e596fad9415fc794102df3fd`.

## Executed

- **101/101 Node tests PASS**, zero skips. Previous 82 plus 9 provider-deadline and 10 payment-configuration tests. All newly added payment tests use synthetic config/transport with no real credentials or network.
- **Full npm run build PASS**, including Vite, TypeScript and existing structural 11/manual 4/movement 14 checks. Movement 14 is already included in 101, not counted twice.
- RED replay runs the final 9 provider tests against the original pre-fix source: **2 failures/7 PASS**, exit 1. POST and GET both show timer count 0 while body is pending; expected 1. Fixed source: both reject with TimeoutError and abort, without retry.
- Covered normal responses, malformed JSON, redirect rejection, timer cleanup and existing 3DS REVIEW result.
- Configuration tests verify each readiness gate, merchant-review override, matching test/live keys, production exclusions, exact origins/forwarded headers, public-secret exclusion, and status recovery after new intake is disabled.
- `git diff --check` passes on edited source/tests/docs. Raw build log intentionally retains terminal ANSI/trailing whitespace.

[Final tests](bagelito-culqi-20261102-tests.log) · [Build](bagelito-culqi-20261102-build.log) · [RED replay](bagelito-culqi-20261102-red.log) · [Operational readiness](../../payment-readiness-20261102.md).

## Scope and limits

The fix extends the existing 10-second deadline through response-body consumption. It does not change request payload, charge semantics, retries, endpoint, checkout wiring, pricing, database writes, readiness flags or the merchant-review kill switch. `.env.example` is a disabled template, not environment configuration. The initial provider regression was independently authored and reviewed against the source diff; the configuration suite was added separately.

No new native-browser pass is claimed for this server-only patch. No tokenization, real provider request, charge, webhook delivery, 3DS challenge or sandbox/live E2E was executed. No DB migration or credential configuration. Previous storefront screenshots describe the unchanged UI, not financial certification. Review-only remains hardcoded; purchase completion is still blocked as documented.

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
 CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
 npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
```

The expected-red replay uses an isolated temporary directory containing only pre-fix `src/server/culqi.server.ts`, then invokes the current test file by absolute path. No source checkout was reverted.
