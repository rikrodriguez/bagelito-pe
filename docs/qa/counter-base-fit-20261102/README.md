# Desktop counter base fit — 2026-11-02

Application **`1b6bd5b9433fb7edacc1ff1ef6d9c794673abedf`**; tested local
`396aa317e59fad96902b0386c7c8aa6fb20ab329` has the same Git tree
`37cd269c5e641c7f12b1e4f2cafdadd458a330d7`.
This is a bounded lower-base improvement, **not final visual acceptance**.

## Comparison and correction

The [approved reference](../../../public/images/store-reference-approved.webp)
actually has a small physical step between the bagel and schmear cases. Making
all rails horizontal would invent geometry. The previous own-art composition
also had an unnecessary tall steel plinth extending to approximately y918/923
at the reference scale; the reference feet end around y900/907.

Only the desktop windows onto our existing independent generated artwork change:

- Bagel window: source x0–1107, y0–618 (previously y0–778).
- Schmear window: source x1080–2020, y0–624 (previously y0–778).
- The lower clipping endpoints map to y899.594 and y907.299 at the 1536-wide
  composition. These are **geometric clip coordinates**, not measured full-image
  alpha silhouettes or a fidelity score.
- Both uniform scales, origins, food, all 13 placard positions, click targets,
  architecture, product/reference bytes and mobile windows are unchanged.
  No image editing, regeneration, screenshot crop as runtime art, food stretching,
  hand-painted cover-up or new asset was introduced.

The thinner bases were inspected in the actual browser. The extra decorative
steel strip no longer covers the room counter; the narrower physical step is
retained. No food or placard was visibly cut. Upper/rear glass is still too high,
food details still differ, and a lower-base fix does not solve those differences.

| Native viewport | Previous application | Current application |
| --- | --- | --- |
| 1180 × 757 | [Before](../pack-reference-refinement-20261102/captures/entry-1180.jpg) | [After](captures/entry-1180.jpg) |
| 500 × 714 | [Before](../pack-reference-refinement-20261102/captures/entry-500.jpg) | [After](captures/entry-500.jpg) |

[Lower narrow view](captures/lower-counter-500.jpg) ·
[Schmear callback](captures/schmear-callback-500.jpg).
The tool returns rendered regions: selected entry images are 1165×747 and
485×693, not full native-window captures. The callback image is 500×714.
Files preserve the selected JPEG tool bytes without processing; dimensions and
SHA256 are explicit in [capture-manifest.json](capture-manifest.json).

## Verification

- **71/71 Node tests PASS**, zero skips. Two new tests pin exact source windows,
  uniform sizing, unchanged mobile windows and conservative lower-caption
  clearance. Geometry arithmetic is not a substitute for browser/pixel inspection.
- **Full `npm run build` PASS**, including TypeScript and existing structural11,
  manual4 and movement14 checks. Movement14 is also inside Node71, not extra tests.
- Build ran after the application edits. Only the two test additions followed;
  built application sources were unchanged during all captures. Driver preflight
  subsequently confirmed sources match the immutable tested commit.
- Native 1180×757: 13 captions, zero horizontal overflow, review-only true,
  zero Canvas. Browser clip endpoints y682.296/688.125; lowest caption bottoms
  y654.211/661.242. Both case buttons remained large and opened Packs and Schmears.
- Native 500×714: desktop art hidden; original two mobile SVG windows preserved;
  zero overflow. Real wheel reached scrollY512; narrow Schmear case click opened
  the real 120/180/240g selector. Payment entry stayed disabled.
- **159 existing runtime/asset/config files and all 8 onClick expressions unchanged**.
  Runtime changes are only one SVG viewBox in ReferenceScene and aligned CSS.
  Catalog, checkout, payments, loyalty and user/source brand assets are unchanged.
  [Source audit](source-audit.json), [browser observations](browser-observations.json),
  [Node log](node-tests.log), [build log](build.log), [preflight](preflight.json).

A first read-only browser metric request could not call getScreenCTM in the
connector's DOM facade. It did not alter the app. Subsequent supported DOM box
and source-window observations are recorded; no full matrix/CTM audit is claimed.
One immediate AX snapshot after the narrow click was stale; a later DOM query
confirmed compact=true and “Elige tamaño”, and the actual screenshot verifies it.

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
QA_CODE_SHA=<full-application-sha> node scripts/qa-rebuilt-storefront.cjs --preflight
```

## Brand source and remaining limits

The existing approximate wordmark is **not changed**. Read-only research located
the user's actual blue/coral arched logo in a user-supplied raster and the
original editable Canva design. The raster includes a peach background and an
image-carousel marker; it is not a clean transparent logo export. The connected
Canva metadata exposes editable text but not its font/effects or a usable export.
The inspection transaction was cancelled without saving. The Dropbox Materials
SVG is the same generic Arial-based substitute already in the repository, not
the organic original. Historical font suggestions are not treated as verified.

A clean SVG or transparent PNG export of the **original** is still required;
no screenshot, autogenerated redraw, inferred font or generic SVG has been
substituted and called faithful. Private source files/links are not republished
in this repository. The reference and existing brand files retain their hashes.

This is two native desktop window sizes, **not touch/device emulation**. No fresh
320/390/tablet/landscape/1536/1920 matrix, Safari, full purchase/upsell journey,
full network audit or exact visual equivalence is claimed. Node source windows
were checked arithmetically at several widths; that does not certify browser
coverage at those widths. PR remains draft; remote CI is reported separately.

Loopback Sites QA used both review-only guards. Preview was stopped afterward,
matching its initial state, and the native browser restored to 1180×757; QA tab
closed. No Site save/sync/deploy, production, credentials, permissions, catalog,
payments, merge, dependency or spending change. Autodeploy remains false.
