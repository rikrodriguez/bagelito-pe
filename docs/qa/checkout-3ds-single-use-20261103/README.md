# Single-use 3DS continuation — 3 November 2026

Draft-only checkout lifecycle correction. The public storefront and all checkout
activation gates remain unchanged; no schema, credential, provider, price, live
payment, CRM, deployment or release action was performed.

## Defect and fix

The actual browser component accepted same-origin 3DS messages even without an
active challenge, and accepted duplicates or late success after closing/failing.
Regression fixtures reproduced extra `/api/payments/culqi/charge` requests; they
do **not** establish duplicate real charges. Backend amount/idempotency guards
remain intact.

A private in-memory challenge flag now arms only when the charge response requests
3DS, and is consumed synchronously before continuation. Review, expiry and context
cleanup disarm it. Expiry disarms before SDK close/reset to prevent reentrancy;
programmatic reset after consumption is no longer treated as customer cancellation.
A delayed `requires3DS` response rechecks reservation expiry before reopening the
challenge. A late non-3DS charge result still goes to payment-status observation:
expiry is not evidence that a submitted payment failed.

Only runtime change: `src/playable/CulqiBrowserCheckout.tsx`. Existing tests plus ten
new cases execute the actual TSX with hook/SDK/transport doubles. No UI styling,
server/API/SQL, product pricing, config, package/dependency graph or public route
changes. The base local tree exactly matches remote PR47 HEAD `0e53f9d`.

## Final verification

- **329/329 Node PASS**, zero failures/cancellations/skips. The 47-case lifecycle
  subset is included, not added again. Ten new cases extend the prior 319.
- Independent read-only review: **47/47 lifecycle PASS** and no remaining blocker
  within this scope; its expiry/reentrancy findings were reproduced and fixed.
- Source/test diff whitespace check: PASS.
- **Final aggregate build and TypeScript PASS**, recorded subprocess exit 0.
  Includes structural 11/11, manual fallback 4/4 and movement 14/14 (the movement
  cases are already included in the Node count). See `build-result.json`.
- Source hashes, code-only tree, exact invocation/runtime and fixture SHA256 are
  in `scope-and-results.json` and `node-result.json`.
- All other tracked files are byte-identical, including pricing, SQL, public pages,
  backend payment coordination, flags and `git.deploymentEnabled:false`.

## Reproduction and historical attempts

Dependencies were reused from the existing verified workspace; no install or
lockfile change was attempted. Full Node run uses the approved HDR fixture, a
minimal explicit environment (no inherited credentials), one test process at a
time and a 384 MiB Node old-space cap. Logs and exact command are retained.

- `before.log`: first six added cases against unmodified component, four failed
  (39/43 pass), proving pre-challenge/duplicate/closed/failed-event defects.
- `focused.log`: first fix, 43/43 pass.
- `intermediate.log`: two added reentrancy/reset regressions against first fix,
  43/45 pass; both fail before their correction.
- `expiry-response-before.log`: final delayed-response regression before its fix,
  46/47 pass; expiry response reopened authentication.
- `focused-final.log`: all 47 pass after all fixes.
- Intermediate full suites (325 and 327) are retained and are not final counts.
- `build-intermediate.log`: initial-version aggregate build completed successfully.
- `build-second-incomplete.log`: next-version build produced bundles but then
  reported `Killed`; no full pass is claimed. That shell did not preserve the
  failed npm exit code; final execution records the subprocess return code.

## Limits and unchanged launch blockers

These are in-process lifecycle/regression tests, not a browser/React concurrent
render, SDK contract, bank authentication or live Culqi acceptance. SQL and visual
matrices were not rerun because this change leaves those bytes unchanged; their
prior evidence remains versioned, not relabeled.

Remote CI cannot be certified from absent workflows/runs/statuses/checks. Actual
isolated environment/schema configuration, authorized sandbox Culqi/3DS/Yape and
webhook acceptance, pot inventory, unconfirmed commercial prices and release
approval remain required. No real sale, stock guarantee or production readiness
is claimed.
