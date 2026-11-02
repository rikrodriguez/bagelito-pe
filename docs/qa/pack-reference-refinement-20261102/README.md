# Packs product and native details — 2026-11-02

Application: **`83a671c9ff82fb68bb574f1be125d5a07d7c84b1`**.
The local tested commit `c767bd828bb7b8de98421c77bc3a0a2ad16a27d1` and
published application share tree `07ed8ce840395f5130366af2025d1ddfea53259e`.
This is a bounded visual improvement, not final fidelity approval.

## Actual discrepancy and correction

The [approved reference](../../../public/images/store-reference-approved.webp)
shows a wide, shallow, open kraft tray in Packs. The previous independent asset
had a nearly square silhouette and a tall upright lid, making the product look
small inside the correctly sized card. A built-in image edit of **our own asset**,
using the reference only for composition, produced a new six-bagel open-tray
concept. No part of the website screenshot is used as runtime art or cropped to
fake the page. The old asset is preserved unchanged.

The new silhouette's opaque bounding aspect ratio is 1.5918 versus 1.0945
previously (alpha threshold 240). It renders proportionally with `object-fit:
contain`; no food stretching or card geometry change. This is an asset-shape
measurement, **not** a visual fidelity score. The food remains conceptual rather
than verified inventory/recipe photography. Composition, bagel count, packaging
and shadows are not asserted identical to the mockup.

Category icons now use native SVG chevrons like the reference, without changing
button hitboxes. Desktop entrance progress says “Selecciona”; narrow/compact
headers keep “Elige” to avoid squeezing the label. No price or offer copy was
copied from the mockup: large packs remain 6/12 and minis 6/12/24. The user's
later exclusions (Fresh/Happier slogan, cups, tote, sixth schmear) remain intact.

### Compare original browser captures

| Viewport | Before, previous application | After, this application |
| --- | --- | --- |
| 1180 × 757 | [Before](../native-document-scroll-20261101/captures/entry-1180-after.jpg) | [After](captures/entry-1180.jpg) |
| 500 × 714 | [Before](../native-document-scroll-20261101/captures/entry-500-after.jpg) | [After](captures/entry-500.jpg) |

Actual browser pixels were inspected at both sizes. The wider product is visible
without covering the Packs title/copy. Category imagery decoded, horizontal
overflow was zero, and desktop/narrow progress labels switched correctly.
Original JPEG screenshots and hashes are in [capture-manifest.json](capture-manifest.json).

## Verification

- **69/69 Node tests passed**, zero failures/skips. Three new React static-render
  and CSS scoping tests protect the asset, three native chevrons, closed payment
  state, and desktop-only long label. These are not browser tests.
- **Full `npm run build` exit 0**, including TypeScript and inherited structural
  11/manual 4/movement 14 checks. Movement is already within the Node suite.
- Driver preflight passed against the immutable local code commit; the exact
  Git tree equals the published application. New asset allowlist updated; no
  assertion thresholds relaxed. Full Playwright matrix was not rerun.
- Real mouse callbacks: Packs → large/mini selector at 1180; Combos → 2 bagels +
  1 schmear card at 500; Schmears → 120/180/240g selector at 500. Return-to-entry
  worked. [Schmear callback](captures/schmear-callback-500.jpg).
- Native narrow wheel reached `scrollY=512`; previous scroll fix remains active.
  `reviewOnly=true`, payment entry disabled, no Canvas, zero horizontal overflow.
  No new complete purchase/review journey is credited to this visual patch.
- **153 existing runtime files and all eight onClick expressions are unchanged**;
  only `ReferenceScene.tsx`, `reference-aligned.css`, and three new image assets
  affect runtime. Catalog, handlers, checkout, loyalty and server/configuration
  sources remain unchanged. [Source audit](source-audit.json).

### Resource failures were not relabelled PASS

Two earlier aggregate builds emitted bundles but ended 137/Killed; an isolated
typecheck also ended 137. At heap320/young4 a later attempt explicitly reported
JavaScript heap exhaustion (134). Their labelled tail logs are retained;
complete original logs remain in the workspace `/tmp/bagelito-pack-refinement-*`.
The successful final run used a quiet resource window, moved only our 410MB npm
cache out of `/tmp` tmpfs without deleting it, and ran:

```sh
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
```

Early browser actions timed out and native Chromium displayed error code 9;
those attempts are not counted. Following resource recovery and the passing
build, fresh actual screenshots/callbacks above succeeded. No browser security
policy was changed or bypassed.

## Provenance and limits

Built-in `image_gen` edit, no external paid service/API key/credential setup.
[Exact prompt](image-prompt.txt); [source hash, responsive dimensions and encoding](asset-encoding.json).
The original generated PNG remains at
`/workspace/scratch/241128f28314/generated_images/exec-f12b831b-639e-47f7-b546-846a680ac56d.png`.
Runtime assets are `public/images/rebuilt-pack-open-tray{,-800,-480}.webp`.
Lossless WebP encoding was decoded and compared byte-for-byte with each input
RGBA image (480/800 variants are proportional downscales). Alpha was preserved.
No template-image painting, screenshot tracing, or SVG imitation of photography.

This is two **native desktop window sizes**, not touch or physical-phone
coverage. The cloud minimum remains 500px; DevTools policy was not bypassed.
320/390/tablet/landscape/full reference-size matrix, Safari, pixel equivalence,
all upsell paths, and current full network/geometry audit remain unverified.
Wordmark contours, counter seam and product details still differ from the
reference. No final acceptance or production-readiness claim.

Sites served only the isolated loopback preview with both review-only guards.
It was stopped afterward, matching its initial state; browser window restored
to 1180 × 757 and the final QA tab closed. No Site publication/sync, production,
payments, merge, credentials, permissions, dependencies, or spending changes.
