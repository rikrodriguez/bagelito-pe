# Fresh-checkout test regression — 2026-11-01

Base PR47 head: `9f397542e599a2655655a0536edc152b4e400b8b`.
This is a test-only portability correction, not a visual redesign or a new responsive certification.

## Reproduced and corrected

A fresh depth-one clone failed the default Node suite: `qa-world-driver.test.cjs`
unconditionally ran `git show` for historical commit `925c050…`, unavailable in a
shallow checkout. The suite stopped before registering that file's 13 cases;
45 tests passed and one file failed. Fetching the original commit restored the
unchanged baseline to 58/58, demonstrating the setup dependency.

The exact 10,576-byte historical source is now inert local test data with a pinned
SHA256 assertion. The existing unchanged-logic comparisons and opt-in historical
replay remain intact. Two extra source-selection tests protect both modes.
No assertions or thresholds were removed or relaxed.

A separate copy containing sources/scripts/tests/assets and dependencies, but no
`.git` directory, runs **60/60 tests, zero skips, exit 0**. Explicit historical
replay still fails on the known old behaviour; its red log is preserved, not
counted as current passing coverage. The fetched original blob and local fixture
were compared byte for byte.

## Build, environment and visual limits

The unchanged application built and typechecked successfully; inherited static,
manual and movement checks passed. Node v24.22.1 / npm 11.9.0. This isolated
checkout needed `npm install --ignore-scripts --package-lock=false`, resolving the
existing manifest; observed direct versions are archived. No package manifest,
lockfile, runtime metadata or dependency range was changed/published. This does
not establish identical transitives to the earlier preinstalled environment.

The approved reference and pinned actual desktop capture were visually read.
The latest source already refines logo/counter geometry. No current UI defect was
asserted from old screenshots and no unverified visual change was made.

Fresh entry and mobile/tablet journey QA was attempted, but Chromium failed before
page load because the execution sandbox denies its Unix socket. The escalation
path failed during environment mounting (`bwrap`, read-only filesystem), rather
than returning an authorization denial. A connected-browser localhost tab attempt
timed out; a subsequent inventory showed no tab. **Zero new browser viewports or
journeys passed.** These are environment blockers, not application failures.

No remote CI runs/statuses were present on the initial head. No workflow or
arbitrary dependency-lock solution was introduced. PR47 remains draft and Vercel
autodeploy remains false. No deployment, merge, orders, payments, integration,
credentials, permissions or spending changes. `src`, `public`, commerce logic,
catalog and all existing browser QA scripts remain unchanged.
