# Equal-size visual inspection — 1536 × 1024

Application: immutable review-only server3246, code `7323f9a70888538e3db96071eaf022dce5a06a80`, matching checkout HEAD at capture. Twenty-six measured source/helper/art hashes remained stable. Five fresh Chromium contexts at1536/390/1280/1024/1920, DPR1; the equal-size comparison uses the1536×1024 desktop context. No product code edits by the capture/review worker. The parent retired only the left noninteractive slogan since9ea; browser assertions confirm it is absent in every captured viewport.

Reference inspected directly: `/workspace/bagelito-rebuilt-storefront/public/images/store-reference-approved.webp`,1536×1024, SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`.

Actual screenshot inspected directly: `1536-entry.png`,1536×1024, SHA256 `14c0d1e9e6b11130ac68f70fcc6765c8789a8d4c64f88d64f9fa7797f8cdb3ab`. Fullpage companion is preserved separately; no composite or reference transformation was created.

## Preserved visual attributes

- Warm glazed tile, globe pendants, steel kitchen and plants give a spatial bakery setting. Blue/coral arched brand, white hero lettering and cream/blue/pink category cards follow the reference vocabulary.
- Three native category cards remain above a foreground glass/steel display. Bagels are abundant in eight trays, with live names, and schmears occupy metal pans.
- Menu and cart occupy upper corners; a rounded progress control follows the cases. Text, labels, category buttons and progress are DOM/SVG, not embedded screenshot controls.

## Material differences visible at the same size

Review criteria supplied by the parent from its specialized design review: recognizable brand, tactile spatial materials, native readable interaction and full-width responsive composition. These criteria are used as observations below, not a numerical fidelity score. The screenshot fills the1536px viewport; product/case controls remain independent native elements. Functional callback coverage belongs to the separate runner, not these captures.

- The reference includes the left wall slogan; the candidate intentionally omits it after the user explicitly retired that copy. This is a requested difference, not a fidelity defect.

- The reference brand is larger and placed farther right, with a stronger rising arc and denser letters. The current SVG rectangle is x450.56–1085.44,y21–176.41; its separate tagline sits at y173.4. Font outline, spacing and arc differ from the raster reference.
- The current hero and card row sit higher. Current category bounds are y275.47–493.31 with a1040px-wide group (x248–1288). In the reference the row is visually around y350–585, narrower and offset toward the right. These reference positions are manual pixel observations, not inferred DOM measurements.
- The current cards are wider and shorter, with smaller relative product artwork and more open side area. Reference pack/combination images fill more of each card. Current Combos uses the older softer individual bagel assets; its two bagels and bowl composition differs from the reference's overlapping photograph.
- The reference cases span nearly the whole lower foreground, with a larger bagel section than schmears and shallow tray perspective. Current cases have equal559.44px widths inside a1146.88px container, and taller tray artwork. The food angle, portions, crust texture and pan perspective are independently generated concepts rather than matching product photographs.
- Current live case headings and action buttons form an additional bar above the food; the reference has placards directly on the trays. Current foreground food is framed by straight native rectangles and simpler glass reflections.
- The reference includes a left menu board, staff, merchandise and other small shop details. Current room art has racks, ovens and plants but omits those details. No unverified raster menu prices were reproduced.
- There are five current schmears, compared with six drawn in the reference. The current application preserves its verified catalog and does not add a recipe from the reference. Reference card quantities/offers are likewise not treated as approved commercial data.
- Current progress uses numbers rather than the reference's icons and connectors. At1536×1024 it extends from y972.27 to1036.27, so its last12.27px require normal scroll. Both current food images/cases are complete within the1024px viewport.

## Measured current bounds

| Element | x | y | width | height |
|---|---:|---:|---:|---:|
| SVG brand |450.56|21.00|634.88|155.41|
| Hero h1 box |288.00|209.41|960.00|54.06|
| Categories |248.00|275.47|1040.00|217.84|
| Counter |194.56|509.31|1146.88|448.95|
| Bagel food image |203.56|576.31|559.44|372.95|
| Schmear food image |773.00|576.31|559.44|372.95|
| Progress |463.00|972.27|610.00|64.00|

Native title/copy visible line counts: Packs title1/copy2; Combos title1/copy1; Schmears title1/copy2; hero1; tagline1. Range fragment tops are preserved and grouped within2CSSpx to avoid duplicate nested-span rectangles counting as extra lines.

Read-only checks in each of five viewports:8images decoded,0geometry failures,0safety/capability/console/page errors,1known framework sessionStorage initialization read. The retired left slogan is absent from normalized document text in all five browser contexts. These establish the measured rendering's mechanics; they do not establish exact visual fidelity, actual product photography, Safari/device behavior or purchase coverage. No fidelity score is assigned.
