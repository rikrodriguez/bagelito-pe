# Targeted320 fix — final measured checkpoint

Code `4be846f06e0cf8ab4ba20df37b114104f96955db`, immutable review-only server3249. Fresh captures at320×700,390×844 and1536×1024; six PNG. Both viewport and fullpage pixels were reviewed, including the complete320 page. No product/shared driver changes by this worker; no additional matrix or purchase journey was run.

The same focused native caption assertions that failed cbf10f7 now pass in all three contexts:13actual HTML captions,8bagels+5schmears matching verified names;16px minimum on both phones,18px at1536. No caption-to-caption glyph overlap or glyph outside case bounds. Generic geometry helper failures0; all5HTML images decoded per context. Thirty-one source/helper/art hashes remained stable. Safety/capability/page/console failures0; three known framework initialization reads. Capture process exit0.

## Direct320 regression measurements

- Everything glyph: x105.625–162.078; Sesame: x182.297–222.406. Horizontal gap20.219px, replacing the previous overlap.
- Blueberry glyph ends at x298.75, inside its case edge x310; previous overhang is gone.
- Cinnamon Raisin's widest glyph line ends at228.359, before Blueberry starts at247.063. Words remain16px native text and wrap naturally on spaces.
- All bagel/schmear labels in the full320 screenshot are readable without an enlarge action. The narrower phone uses title case and a narrower font axis;390 retains its larger uppercase placard styling.

## Visible label taps

A separate320 context used native touchscreen taps at the actual center of each visible `.rebuilt-case-label` span after fresh navigation before each action. Both spans measured300×44px with15px text. Actual hit-testing returned the label span; resulting scenes were pack-size and schmear-size. Tap process exit0; no safety/capability failures. This is two focused callbacks, not purchase coverage.

## Scope and visual limits

Desktop composition/counter art retain the anchored design documented in the c987 comparison. Brand letter shapes, tagline weight, product photography and reflections still differ from the reference; no exact fidelity claim is made. Asset alpha extents differ from the nominal counter DOM anchor as previously measured. The final1536 screenshot and DOM bounds are recorded in this report; no reference/screenshot was used as a rendering asset by the capture worker.

The320/390 page retains normal vertical scroll; it does not fit every control and photographic detail inside the first phone viewport. No Safari/physical-device certification, full keyboard suite, new1024/1280 sweep or complete purchase journey is implied. The cbf10f7 RED report and captures remain unchanged.
