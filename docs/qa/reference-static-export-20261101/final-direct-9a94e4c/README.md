# Final static storefront QA — 9a94e4c

Application `9a94e4cfc5a043726f643d3a9c546f096007bd94`; exporter `281b85d6bf80eb9f564af987a1fd21b8fbcd1318`. Tests used the immutable plain-file Python origin `http://127.0.0.1:3216/`, with strict export CSP. No server API or SSR was used.

All nine browser invocations finished with exit 0 and zero recorded failures: entry at 320×700, 390×844 and 1280×800 (9 category callbacks), 18 schmear text states, 36 secondary text/layout states, and six complete E2E journeys. There are 212 native PNG screenshots. [Machine summary](browser-summary.json).

| Raw stage evidence | Result | Coverage | PNGs |
| --- | --- | --- | --- |
| [entry](entry/exact-image-results.json) | PASS | 9 callbacks | 6 |
| [card-text18](card-text18/exact-image-results.json) | PASS | 18 | 42 |
| [secondary36](secondary36/exact-image-results.json) | PASS | 36 | 78 |
| [e2e/pack-decline-390](e2e/pack-decline-390/exact-image-results.json) | PASS | 1 E2E + legal | 15 |
| [e2e/combo-390](e2e/combo-390/exact-image-results.json) | PASS | 1 E2E + legal | 11 |
| [e2e/schmear-390](e2e/schmear-390/exact-image-results.json) | PASS | 1 E2E + legal | 11 |
| [e2e/pack-original-390](e2e/pack-original-390/exact-image-results.json) | PASS | 1 E2E + legal | 17 |
| [e2e/pack-flavoured-320](e2e/pack-flavoured-320/exact-image-results.json) | PASS | 1 E2E + legal | 17 |
| [e2e/pack-decline-1280](e2e/pack-decline-1280/exact-image-results.json) | PASS | 1 E2E + legal | 15 |

The six E2E journeys cover Packs with optional 120 g declined and accepted (Original S/12; flavoured S/16), Combos, standalone Schmears, checkout synthetic fields and consent, disabled payment, loyalty text, selection/removal, Back, cart editing, progress, menu and reset. Each opens the actual `/legal` link in a new tab: 301 → `/legal/` → 200, eight policy sections, `opener === null`, checkout preserved.

Mobile follows the user's explicit changed contract: no image enlargement control or horizontal pan, exact-source hero/vitrine crops and native readable category cards. Desktop keeps the full source image. Original WebP SHA-256 is `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`. Text audit keeps Range geometry checks, no overlap/clipping/overflow, readable text ≥12 px and interaction targets ≥44 px; thresholds were not lowered. Earlier baseline and candidate failures remain in their separate epochs.

[Desktop entry comparison](desktop-entry-vs-6f-pixels.json): 1280×800 entry versus original 6f screenshot is byte-identical and RGB-identical (0 changed pixels, maximum channel difference 0). This is an entry-only comparison, not a claim of identical pixels for every UI state. Mobile deliberately has the new presentation.

Network/capability drains recorded 27 initialization reads of the exact TanStack key `tsr-scroll-restoration-v1_3`, at most one per document, with stacks preserved in raw JSON. There were zero application storage reads, storage writes, fetch/XHR/API/provider requests, blocked egress attempts, CSP violations, page/hydration errors or network errors. This is not a zero-storage-read claim. Local document/image/asset GETs and the documented legal redirect are allowed.

Each stage retains its untouched JSON, native screenshots and stdout. `entry/stage-provenance.json` documents exporter identity separately because that entry driver does not serialize `QA_EXPORT_SHA`; raw metadata was not modified. All copied driver hashes match the hashes recorded during execution. Sources under `sources/` are exact replay copies; the E2E source retains original absolute helper imports from `/workspace/bagelito-card-layout-fix/scripts/`. Portable entry/text/secondary commands use the scripts in that worktree with `QA_REPO_ROOT`, `QA_CODE_SHA`, `QA_EXPORT_SHA`, `BASE_URL`, `QA_OUTPUT`, `QA_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` and global Playwright `NODE_PATH`. E2E additionally uses `QA_E2E_SCENARIO` and `QA_EXACT_WIDTH`.

Chromium contexts and browsers are closed. Safari/iPhone installation, hosting, production payments, DB, credentials, telemetría and deployment were not executed. No 3D or legacy zoom tests were run for this final delivery. ZIP extraction/hash/HTTP verification is recorded separately by the parent for the same immutable export; browser tests were not repeated against another port.

`SHA256SUMS` covers this archive except itself. Verify with `sha256sum -c SHA256SUMS` from this directory.
