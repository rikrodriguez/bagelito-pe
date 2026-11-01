# Bagelito: measured logo and counter refinement

Application and QA source: **`1f161dba29d8920bced2ebd647e1e24d5c06d7d2`**. Same draft PR47. This is a measured visual candidate with explicit remaining differences, not final visual approval or pixel-perfect equivalence.

## Actual current captures

[Desktop1536×1024](qa/logo-counter-refinement-20261101/final-1f161db/read-only/1536-entry.png) · [390 full page](qa/logo-counter-refinement-20261101/final-1f161db/read-only/390-entry-full.png) · [320 full page](qa/logo-counter-refinement-20261101/final-1f161db/read-only/320-entry-full.png).

Comparison baseline: [2199 at1536×1024](qa/reference-anchors-20261101/clean-2199afb/read-only/1536-entry.png). The approved [1536×1024 reference](../public/images/store-reference-approved.webp) was inspected directly. Its WebP SHA256 remains `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`; the coordinator verified the original JPEG separately. No JPEG byte-identity claim is made for this WebP.

## Logo: drawing, weight, width and curve

The initial wordmark used Fredoka700 for every letter, including an inherited variable-weight setting that overrode the tagline's nominal weight. More importantly, Fredoka's B has one connected counter; weight/width tuning could not produce the reference's two counters. The B is now one native SVG path derived from the existing licensed font outer contour and two manually separated counter paths. No screenshot autotrace, raster logo or new font is used. The A uses a native triangular counter mask with a corrected thin coral edge. The other letters use individual size, width, position and weight settings; the tagline uses a native curved Arial textPath.

Pixel masks and ROIs are fixed across comparisons. Maximum blue-bbox coordinate difference over eight letters went28px→5px→2px. This is a bounding measurement, not a fidelity score. Current actual logo/counter regions were independently checked pixel-identical to the measured5f images after the later scrolling fix.

| Measurement | Reference |2199 baseline | Current candidate |
| --- | --- | --- | --- |
| B blue bbox |508,129–606,232 |495,131–589,239 |508,129–606,232 |
| B topology |2 counters |1 counter |2 counters; blue area−1.5%, counter areas924/1108 vs741/723 remain larger |
| A counter area |432px² |Font-derived smaller opening |438px²; outer bbox within1px, blue face still−8.3% |
| Tagline blue bbox |660,183–989,230 |683,180–1032,225 |657,185–993,228; centre close, width+7px |
| Tagline blue area |2553px² |5082px² |2819px², still+10.4% |
| Thresholded face/coral medians |[2,58,155]/[241,139,133] |Brighter blue/orange |Matching medians within the measured masks |

G/E/L/I/T/O blue areas differ by approximately−4.1% to+5.1%. The B's organic outer shape, counters, exact lettering and shadow/material are still approximations. Rotation values and font-width axes are not inferred as exact font metrics from photo PCA; near-round O makes that estimate unstable. [Full reproducible pixel audit](qa/logo-counter-refinement-20261101/methods/logo-measurements-through-final.json) and its source script retain all eight measurements, source hashes and limits.

## Counter: compare the same physical planes

Three bounded native edits of our previously generated counter retained8bagel trays,5schmear pans and13blank placards. The first improved height but missed the divider; the second moved it too far. The selected third intermediate layer has its principal jamb at54.8% of canvas width. This percentage is not the same as its inner front-plane split.

A single uniform scale cannot simultaneously align both cases' widths/heights. The current composition displays the two cases with separate **uniform** native fits: a clipped bagel window of the new HTML image and a new SVG schmear window. Only the newly generated conceptual layer is windowed; the approved screenshot is never requested as runtime art. All essential food and placards remain visible. The existing mobile counter and its source windows/coordinates remain unchanged. No nonuniform food stretch was introduced.

| Same-plane landmark at1536 | Reference |2199 | Current actual pixels |
| --- | --- | --- | --- |
| Left cyan column |106 |126 |106 |
| Bagel inner jamb |885 |920 |885 |
| Next schmear jamb |907 |941 |907 |
| Bagel mid steel edges |729/744 |737/753 |729/745 |
| Bagel lower green rail |870 |892 |875 |
| Schmear mid edges |773/780 |Different geometry |774/781 |

The top/rear bagel glass remains about10–16px too high and extends slightly behind the cards. The lower steel plinth still reaches roughly918/923px. It must not be confused with the inner base at897/902 or with a nominal300px DOM anchor. The seam remains visibly stepped, although no large empty gap or duplicated food was observed. Matching boxes does not certify photographic fidelity. The missing sixth schmear, left cups, right tote and Fresh/Happier slogan are intentional exclusions under the user's later preferences.

The new desktop PNG was encoded losslessly to `public/images/rebuilt-aligned-counter-desktop.webp`:2020×778, SHA256 `3a19a37ebbedc735599e719e6b3b9feb80358937fcf288758e2a68483372642f`; all RGBA bytes match the selected generation. It is conceptual art guided by the reference and own generated layers, not verified recipes/inventory/staff photography. Original generated PNGs and rejected variants remain consumer-local; the selected exact pixels are recoverable in the committed WebP. [Encoding/provenance](qa/logo-counter-refinement-20261101/methods/desktop-counter-encoding.json), case fits and actual pixel review record source hashes and deviations.

## Functional regression and verification

The first full entry run on5f correctly failed: after the driver's existing native `scrollIntoViewIfNeeded` on the oversized clipped image, the hidden-overflow stage scrolled63px horizontally. Five strict anchors shifted; horizontal overflow and the menu's effective target also failed. Exit1 and30PNG hashes are preserved. **No complete journey/legal tab ran on that failed source.** A simple before/after replay reproduced stage scrollLeft0→63 with window.scrollX unchanged, without changing app styles.

The fix makes the desktop scene `overflow:clip`, so decorative spill does not create a programmatically scrollable scene. The same native operation now retains scrollLeft0 and the three measured anchors unchanged. A new behavioural guard asserts no horizontal scene shift immediately after the unchanged image-scroll loop; all six existing anchors and44/12/16px minimums remain intact. This is a cause fix, not an assertion relaxation.

On **1f161db**, actual NPM entry1536 and one complete Combo320 review-only journey/legal tab both passed, exit0. The entry exercised three category callbacks, two case callbacks, keyboard, five image decodes, the desktop SVG case/clip and all six strict anchors. The Combo completed one legal tab (eight sections, `opener=null`), review/consent and disabled payment gate. All83PNG hashes (30entry+53Combo) were independently rechecked and preserved in an indexed archive;44frozen inputs remained intact. There were three known framework reads across three documents and zero application network/capability/page/console/callback errors. The two diagnosis contexts are reported separately, one known framework read each.

The current functional run did not execute the mobile entry-profile/off-DOM decode branch; native mobile captures and the complete mobile journey are separate coverage. The old failure has its original30PNG archive/report and was not relabelled PASS.

Current build/types and58/58Node tests passed, exit0, no skips. Three fresh read-only viewports produced six PNG with13native captions,16px phone text, zero caption overlap/outside-case, geometry or safety failures. The current capture report remains WIP-not-final for visual acceptance. Historical5f native label taps passed2/2 at300×44px/font15 and retain their old source attribution. The current complete journey result is listed separately above; no full purchase matrix, fresh tablet/landscape sweep, Safari/physical-device certification, QA3D, performance benchmark or remote-CI result is implied.

The driver verifies five exact HTML image roles, two unchanged mobile SVG windows and one new desktop SVG window, source dimensions, proportional rendering, explicit case clipping, uniform source transforms and separate full-asset/window alpha measurements. When the mobile entry profile is executed, the driver explicitly decodes the old texture off-DOM and counts it separately from the new hidden desktop HTML image; that branch is not claimed in the current functional run. Geometry/safety helpers were not modified. Eight handlers, catalog/prices, quantities, optional declinable upsells, consent, checkout and protected domain/server/configuration sources remain byte-identical to4c98.

## Method and scope

The actual specialized references read and applied were `website-builder/references/design-taste-frontend.md` and `website-builder/references/image-to-code.md`, provided by package `c9/website-builder` (`skill://plugin_asdk_app_6a3293e129088191abf0875820e839da/website-builder/references/…`). Design read: preserve the Bagelito boutique identity, reference density and spatial composition, with restrained motion. Generic redesign defaults do not override the supplied palette/cards or later exclusions. Decisions were per-letter anatomy/weight, same-plane perspective measurement, native responsive controls and direct equal-size screenshot comparison. No Figma, hosted builder, new dependencies or external paid generation service was used.

No drinks, sandwiches, Wallet or invented prices/rewards were added. Combos remain Bagels+schmears. Loyalty remains10verified orders→2bagels+1schmear with tracking/redemption inactive here. All browser work used isolated review-only loopback and blocked application commerce/network/capability writes. No real payments, orders, provider/DB writes, deployment/merge, private-preview update, PR46 integration, permission/credential or spending change occurred. Autodeployfalse remains. PR47 title/body updates were not retried after the previous denials; this report and pinned captures are the current evidence.
