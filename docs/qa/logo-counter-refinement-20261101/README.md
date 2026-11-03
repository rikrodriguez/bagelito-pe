# Logo/counter evidence index

Application/test source: `1f161dba29d8920bced2ebd647e1e24d5c06d7d2`.

See [measured review, source provenance and remaining differences](../../logo-counter-refinement-review-20261101.md). This index does not certify final visual acceptance.

- `final-1f161db/read-only`: six fresh actual PNGs (1536×1024,390×844,320×700;viewport/full-page pairs), reports and manual inspection. Five files are byte-identical to prior5f; the desktop viewport has10 different pixels at one card-edge row. Brand and counter regions separately match the prior measured pixels exactly.
- `final-1f161db/functional`: actual NPM entry1536 plus one complete Combo320/legal journey, both exit0;83exact PNGs in `captures.tar.gz`, with relative names/hashes in `captures-index.json`. All83archive members were rehashed. Byte-identical repetitions use ordinary tar hardlinks; `tar -xzf` restores every original name. Direct review captures are also retained. Raw reports are gzip-compressed unchanged, with original SHA/consumer-local paths preserved.
- `red-5f31873`: failed entry with7flags/exit1,30exact PNGs archived and rehashed; no complete journey was run on that source. A separate before diagnostic reproduces0→63 scene scrolling; the corresponding current after diagnostic retains0→0 without app/style mutation. Diagnosis contexts are separate from functional totals.
- `prior-5f31873`: exact measured old desktop PNG, read-only report and historical two320native label taps. These taps are not relabelled as current1f coverage.
- `pass1-e9d995c` and `pass2-2e03fd0`: immediate published WIP desktop/mobile comparisons. Their tests/artifacts retain their original source epochs.
- `methods`: fixed-ROI colour/connected-component audits, native B derivation from the existing licensed font, actual raster proof, targeted generation/encoding metadata, physical-plane fits and pixel reviews. These are consumer-local scripts with original fixed paths, not app runtime or a font dependency. Generated/rejected PNG originals remain local; the selected current desktop WebP has exactly equal decoded RGBA pixels.
- `drivers`: exact focused read-only/tap evidence drivers. Fixed local paths/ports must be adapted for a new isolated workspace; do not point them at production. The current production QA driver is `scripts/qa-rebuilt-storefront.cjs` in the pinned source.

## Reproduce current functional coverage

Use an isolated checkout and existing dependencies: Node24.19.0, Chromium151 at `/usr/bin/chromium`, Playwright from the execution runtime. No package/dependency install or lockfile change occurred. The approved local HDR fixture SHA256 is `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`; it avoids network fixture retrieval in inherited tests and is not loaded by the DOM storefront.

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr npm run build
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
BAGELITO_REFERENCE_REVIEW_ONLY=true BAGELITO_MERCHANT_REVIEW_ONLY=true NITRO_HOST=127.0.0.1 NITRO_PORT=3256 node .output/server/index.mjs
```

Separate terminal, explicit loopback only:

```sh
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules BASE_URL=http://127.0.0.1:3256/ QA_CODE_SHA=1f161dba29d8920bced2ebd647e1e24d5c06d7d2 QA_WIDTHS=1536 QA_OUTPUT_DIR=/tmp/bagelito-final-entry npm run qa:reference:entry
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules BASE_URL=http://127.0.0.1:3256/ QA_CODE_SHA=1f161dba29d8920bced2ebd647e1e24d5c06d7d2 QA_WIDTHS=320 QA_SCENARIOS=combo QA_OUTPUT_DIR=/tmp/bagelito-final-combo node scripts/qa-rebuilt-storefront.cjs
```

The exact functional process records, source freeze and source audit accompany both stages. The mobile entry-profile decode branch, wider purchase matrix, current tablet/landscape sweep, Safari/physical devices, QA3D, remote CI and performance were not certified. No deploy, real payments/orders, DB/provider writes, PR46/runtime loyalty activation or private Sites update occurred. Autodeployfalse remains. The PR47 metadata update previously denied was not retried.
