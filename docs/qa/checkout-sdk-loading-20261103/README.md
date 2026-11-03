# Recoverable SDK loading — 3 November 2026

Draft-only checkout reliability fix on PR47 HEAD `0b876a1`. No activation,
deployment, provider request, payment, price or configuration change was made.

## Operational defect

A terminal script load error left the failed element in the DOM. A later click
attached new listeners to that already-failed element, so checkout waited forever.
A request that never emitted load/error also had no deadline. Four new regressions
failed against the original component (50/54 cases passed).

The loader now shares the two known SDK scripts across callers, validates a
preexisting element's type/source, and bounds each caller's wait to 12 seconds.
A terminal error removes only that failed element, permitting a **manual** retry.
A timeout does not prove that a script failed to execute: the existing request is
retained, late load/error is observed, and another click waits on the same element
instead of injecting a duplicate. Successful events dispose loader listeners and
caller timers; old operation guards still prevent an abandoned checkout from
reserving or charging. Only existing error-message copy changed; no layout,
reference imagery, CSS, route or product flow was redesigned.

## Verification

**338/338 Node PASS**, zero failures, cancellations or skips. This includes the
56-case lifecycle suite, with nine added cases; subsets are not added again.

- Aggregate build and TypeScript: **PASS**, subprocess exit 0. Structural 11/11,
  manual fallback 4/4 and movement 14/14 are included; repeated subsets are not
  added to the Node count.
- Initial focused run after the fix: **54/54 PASS** under bounded Node heap.
- The final lifecycle coverage adds current-order selection during shared loading
  and terminal error arriving after timeout. All 56 cases pass in `node-full.log`.
- Independent read-only review: **56/56 lifecycle PASS**, plus three targeted
  in-memory interruption/retry probes, with no blocking defect found in scope.
  Those probes are not added to the full-suite count.
- Source/test diff whitespace check: PASS.
- Reused installed dependencies without package or lockfile changes.

## Browser verification blocked

`browser-fixture.cjs` is a prepared actual-DOM loader test, not successful browser
evidence. Every SDK request would be intercepted and simulated. It tests terminal
error/manual retry and a real 12-second timeout followed by late completion without
reinjection. Neither scenario ran here:

1. The installed Playwright package's expected bundled executable was absent.
2. The existing `/usr/bin/chromium` then aborted at startup:
   `process_singleton_posix.cc ... socket() failed: Operation not permitted`,
   SIGABRT. This is an execution permission restriction. No workaround, permission
   expansion or alternate environment was attempted after that denial.

`browser-bundled-unavailable.log` and `browser.log` preserve those failures.
There is no browser PASS, screenshot, SDK compatibility or bank/provider acceptance
claim. The first unbounded-heap Node focused process also failed before per-case
results (`focused-unbounded-incomplete.log`); its cause was not established. The
bounded rerun completed successfully and does not reclassify the earlier attempt.

## Scope and remaining blockers

The component and lifecycle tests are the only existing files changed. Backend,
SQL, catalog/prices, public pages, all gates and autodeploy remain unchanged. Actual
isolated schema/configuration and authorized Culqi/3DS/Yape/webhook acceptance,
pot inventory, unconfirmed commercial prices and release approval remain necessary.
This loader correction does not by itself make the store operational or certify a
sale. Remote CI is not certified from absence of workflows/runs/checks.
