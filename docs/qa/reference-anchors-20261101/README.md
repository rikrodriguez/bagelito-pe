# Reference alignment evidence index

Application source: `2199afb6b51a3321259f512242bd47268ac3300c`.

See [review and measured differences](../../reference-alignment-review-20261101.md). `clean-2199afb` is the current artifact epoch. The older `final-4be846f` name is historical; it still contains cups/tote and is not the final approved visual.

- Current: three read-only viewports (1536×1024, 390×844, 320×700), six PNG, manual prop absence inspection, native 16 px phone captions; two native 320 label taps; one actual NPM entry1536; build/types and 58 Node tests. Every process completed with exit 0. The capture report intentionally retains `WIP-not-final` because visual acceptance is pending.
- Current functional raw report is `clean-2199afb/functional/raw-results/entry-1536.json.gz`. Thirty exact entry PNGs are downloadable in `entry-captures.tar.gz`, with relative paths/hashes in `entry-captures-index.json`. Identical PNG bytes use normal tar hardlinks; extracting with `tar -xzf` restores all 30 names. All 30 extracted members were verified. Four interaction PNGs are also directly viewable.
- Prior complete Combo320 and legal-tab run: source `4be846f06e0cf8ab4ba20df37b114104f96955db`, 53 PNG hashes, selected PNGs retained.
- Prior complete Pack390 with optional flavored extra and entry1536: source `cbf10f7f101742a899f9a681d0a6ddd24dc9e36b`, 89 PNG hashes (59 Pack + 30 entry), selected PNGs retained.
- `red-cbf10f7-320` preserves the three specific caption failures that generic geometry checks missed. No assertions were relaxed; the corrected phone typography keeps 16 px.
- Raw records retain their original absolute consumer-local paths and code/checkout epochs. These are not URLs. This relative index and the artifact manifest identify downloadable repository paths without rewriting historical reports.

## Reproduction

Use an isolated checkout of the application SHA, existing package dependencies, Node 24.19.0, Chromium 151 and Playwright from the execution environment. No dependencies were installed or changed in this task. Do not point the driver at a production URL.

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr npm run build
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
HOST=127.0.0.1 PORT=3250 BAGELITO_REFERENCE_REVIEW_ONLY=true node .output/server/index.mjs
```

In a separate terminal, with the isolated server running:

```sh
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules BASE_URL=http://127.0.0.1:3250/ QA_CODE_SHA=2199afb6b51a3321259f512242bd47268ac3300c QA_WIDTHS=1536 QA_OUTPUT_DIR=/tmp/bagelito-entry-recheck npm run qa:reference:entry
```

The approved local HDR fixture SHA256 is `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`. It prevents a network fixture download in existing Node tests; it is not loaded by the DOM storefront. The two focused capture/tap drivers are preserved under `clean-2199afb/drivers`; they retain original fixed paths/loopback port and require equivalent local paths if replayed. They are evidence tooling, not production app code. All browser runs install the unchanged safety helper, block application network/capability writes, and use review-only serving. Framework scroll-restoration initialization reads are listed explicitly in each report.

No complete purchase rerun, tablet/landscape matrix, Safari/physical device, QA3D, performance benchmark, remote CI, production checkout or deployment is claimed on the current prop-cleanup revision. The existing private preview was not changed. PR47 title/body were not retried after the earlier automated rejection.
