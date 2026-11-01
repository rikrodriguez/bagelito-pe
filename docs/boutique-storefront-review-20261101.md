# Bagelito boutique scene — verified review candidate

Current application: **`7323f9a70888538e3db96071eaf022dce5a06a80`**. This final delta deletes only the user-rejected noninteractive left-wall slogan. Broader QA epoch: `9ea4528806f5dd032e1d76eb7f56e1be98a9d042`; it is kept separate below. Same draft [PR47](https://github.com/rikrodriguez/bagelito-pe/pull/47), based on PR45. Subsequent commits preserve documentation and exact evidence only. This remains a visual candidate for Ricardo, not final visual acceptance or a deployed store.

## What changed visibly

The previous UI (`79e484c`, PR47 before this task) was a flat cream page with isolated, soft bagel photos and repeated bowls. Pixel inspection of the approved WebP established that the requested visual language is an interior: physical blue/coral brand, warm glazed tile and globe lamps, a deep kitchen, glass/steel and abundant foreground product.

The scene now combines four independent conceptual art assets with native SVG lettering, three real category buttons, eight bagel/five schmear placards, menu/cart, two case actions and progress controls. A separate portrait architectural composition is selected at widths≤1050px: it keeps lamps and room depth without cropping a desktop screenshot. Native content reflows and scrolls vertically on mobile/tablet. Desktop composition scales with available height; both complete cases are in the first viewport at1280×800 and1920×1080. Progress is below the first viewport at1280; it fits at1920×1080. No product/room image is stretched or rendered with `object-fit:cover`.

The approved reference, its vitrina crops and storyboard are **not rendering assets**. Newly generated room and food plates contain no rasterized labels, prices, logo or UI. Five native imagegen calls produced four selected assets, including a native framing correction of the newly generated schmear art. No user reference was an image-generation input. Runtime WebPs preserve exactly the selected PNG pixels, verified by SHA256 of raw RGBA8 bytes; no resizing/cropping/repainting occurs in that encoding. Room-only CSS saturation/brightness is explicit. See [provenance](qa/boutique-scene-20261101/art-provenance.json), [encoding verification](qa/boutique-scene-20261101/lossless-encoding.json) and [actual tools/skills](qa/boutique-scene-20261101/tools-and-skills.md). The [specialized frontend review](qa/boutique-scene-20261101/specialized-visual-review.md) records the exact `design-taste-frontend`/`image-to-code` resources read and concrete application, including the user's copy instruction taking precedence over the image.

## Current images after rejected-copy removal

- [Móvil390, complete](qa/boutique-scene-20261101/final-7323f9a/read-only/390-entry-full.png).
- [Desktop1280, first viewport](qa/boutique-scene-20261101/final-7323f9a/read-only/1280-entry.png).
- [Desktop1920, first viewport](qa/boutique-scene-20261101/final-7323f9a/read-only/1920-entry.png).
- [Tablet1024, complete](qa/boutique-scene-20261101/final-7323f9a/read-only/1024-entry-full.png).
- Additional exact320/768/844 frames and purchase states are in [selected captures](qa/boutique-scene-20261101/final-9ea4528/selected-captures.json).

The [read-only inspection](qa/boutique-scene-20261101/final-7323f9a/read-only/inspection-summary.json) records actual bounds. Case bottoms are781.91px in1280×800 and992.05px in1920×1080. This is evidence about composition and legibility, not a photographic-equivalence score. The reference still differs in architecture, staff/side signage, brand-letter proportions and food styling. The four new plates are conceptual; they do not prove recipes, actual stock or verified SKU photography. The smaller category Combo retains the pre-existing individual bagel photos and their source softness. No exact-reference or final-photorealism claim is made.

## Current final-source checks

On **7323f9a**, the actual build/types and58Node tests pass, with zero skips. Read-only capture covers1536×1024 (equal to reference),390/1024/1280/1920: five contexts, ten original PNG, eight images decoded/context, geometry0 and retired-copy absence asserted in all five. The [pixel comparison](qa/boutique-scene-20261101/final-7323f9a/read-only/pixel-comparison.md) explicitly lists remaining reference differences.

Affected functional QA on7323f9a: actual entry alias1280/1920 **2/2 PASS**, six category+four case callbacks, keyboard; Pack390 with flavored extra **1 complete journey PASS**, one real legal tab. Both processes exit0;119/119PNG hashes independently verified; four known framework reads/four documents and zero application-capability/network/console errors. [Current terminal summary](qa/boutique-scene-20261101/final-7323f9a/functional-terminal-summary.json), [exact one-paragraph delta audit](qa/boutique-scene-20261101/final-7323f9a/affected-source-audit.json).

The broader six-entry/four-purchase results in the next table belong only to9ea4528 before that one copy deletion. No assertion reassigns that matrix to7323f9a. The remainder of the commercial source, CSS, assets, driver and helpers is byte-identical across the final delta.

## Broader terminal QA on9ea4528 before copy retirement

| Check | Actual result |
| --- | --- |
| Read-only final visual capture | 4/4 at390/1024/1280/1920;8 original PNG;8 images decoded/context; geometry0, source hashes unchanged. |
| Responsive entry | **6/6 PASS**, exit0;320/390/768/844landscape/1280/1920.18 category callbacks,12 case callbacks,6 keyboard Tab/Enter entries,48 decoded images. |
| Four complete review-only purchases | **4/4 PASS**: Pack390 with flavored extra and Pack390 declining extra; Combo320; Schmear1280. Three actual runner processes exit0 after entry. Includes quantities, optional add/remove/decline, summary/edit/cart/progress, fictional delivery data, consent and inactive payment. |
| Legal pages | Four real new tabs, eight sections and `opener=null`. |
| Functional screenshots | **388/388 hashes verified independently**,384 main PNG+4 legal PNG, zero missing/mismatch. Full originals preserved in the executor;18 selected functional PNG and8 read-only PNG are published. All four raw functional reports and the full PNG hash manifest are preserved. |
| Build/types | **PASS, exit0**. Inherited structural11/manual4/movement14 checks are included; movement is not added again to the Node total. |
| Node | **58/58 PASS**, exit0; zero failed/skipped/cancelled tests, approved local HDR fixture. |
| Source integrity |38 frozen files unchanged through terminal QA.56 other `src` files, eight scene callbacks, all six QA helpers, catalog/commercial/checkout/consent code, package manifest and Vercel config unchanged versus e91. |
| Browser safety | Functional:14 known exact-key TanStack reads/14 documents; read-only capture:4/4. Zero application storage operations, API/fetch/XHR/POST/provider/egress attempts or safety/console/page/callback errors in those browser contexts. |
| Separate local negative probe | An intentional loopback GET to an unknown `/api/` path returns503 with `no-store` under the review-only server flag. It is separate from browser traffic, with no POST/provider call. |

The [terminal summary](qa/boutique-scene-20261101/final-9ea4528/functional-terminal-summary.json), [source audit](qa/boutique-scene-20261101/final-9ea4528/source-audit.json), [all functional PNG hashes](qa/boutique-scene-20261101/final-9ea4528/functional-png-manifest.json), logs/process exit records and compressed raw reports are in the same directory. Root re-read the four exit/status records and independently rehashed all388 files; the parallel agent's summary alone was not treated as proof.

This is bounded coverage, **not** the previous12-purchase matrix, complete text18/secondary36 profiles, QA3D/guided suite, Safari/device test or remote CI. Those broader/historical results are not reassigned to the new source. The changed entry driver explicitly covers five category images plus the responsive room and two independent case images (eight total), replaces the obsolete18-photo assumption, decodes all eight and checks actual roles/dimensions/ratios. Targets44px, copy12px, headings16px, overlap/clipping/source/network guards remain unchanged.

## Failure preserved before the fix

Candidate8895043 fitted the cases on Full HD but clipped conservative glyph bounds of G/E/L above y0 (maximum3.97px). Its actual entry command terminated **exit1**,27 flags across nine entrance frames; six contexts and180 PNG were preserved, no purchase stages ran. [RED screenshot/report/process](qa/boutique-scene-20261101/red-8895043/) remains separate. The correction moves the desktop brand down5px; no assertion was weakened. On9ea4528 the corresponding glyph bounds are positive and all six entry contexts pass. Earlier c9 WIP captures remain labeled as WIP.

## Commercial and release limits

Combos stay **Bagels + schmears**. There are no beverages, sandwiches, Wallet, invented offers or catalog changes. Upsells remain optional at verified catalog prices. Loyalty still describes10 backend-verified orders→2 bagels+1 schmear, with tracking/redemption explicitly inactive. PR46 remains isolated, not imported or activated. No browser/GHL payment or loyalty authority was introduced.

The four scene assets have native widths1024/1536px. Recorded pixel-density ratios are available; no4K/retina, physical iPhone/iPad, Safari, transfer-speed or mobile-performance certification is implied. Lossless scene assets are larger than production-optimized photography; byte reduction and device/network measurement remain future work. This candidate uses review-only loopback serving, not the private Sites preview.

`git.deploymentEnabled:false` remains. No merge, deployment, private preview update, DB migration, live payment, provider write, credential, permission or spending change occurred. PR45, PR46 and the existing preview branch remain untouched. PR47 description remains historical because its metadata update was previously rejected; that operation was not retried. The fresh source/evidence and this document are the current record.
