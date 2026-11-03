# Reference anchors — review candidate, not exactness certification

Baseline rejected UI: `7323f9a70888538e3db96071eaf022dce5a06a80`; latest evidence HEAD before this work: `7cd5c456a4d041a0696cfa5cef54ca046aa0af24`.

Original approved visual:1536×1024, WebP SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`. The coordinator verified the new attachment is identical to the original JPEG; no further Library transfer was attempted.

This candidate applies the already-read specialized `design-taste-frontend.md` and `image-to-code.md` references by measuring a single1536×1024 composition rather than applying a generic editorial layout. Brand, white hero, three interactive pastel category cards, frontal glass/steel cases and progress are the anchors. Responsive smaller screens retain native legible flow and a new portrait rendering of the same venue. Full-width3:2 desktop composition can require vertical scroll at a different screen aspect ratio; no food/photo stretching or cropping is used to pretend every ratio is identical.

| Element | Reference target at1536×1024 | Implementation approach |
| --- | --- | --- |
| Brand blue/tagline signal | Approx.x507–1174,y67–234 | Enlarged arched SVG lettering, curved native textPath tagline; actual ink must be measured in the first real screenshot. Original brand vector is unavailable; no exact font-shape claim. |
| Hero | White ink approx.y281–337 | Native headline boxx493,y270,fontsize60; box and painted ink are distinguished. |
| Three category cards | Approx.x395–1230,y350–584 | Native groupx395,y350,w835,h234;14pxgaps and reference-size product/copy areas. |
| Foreground | Approx.x90–1530,y600–900;≈54/46 bagel/schmear | Native anchor containerx90,y600,w1440,h300; NEW low-frontal generated transparent counter layer. Its actual visible pixels differ from this nominal container and must be reported separately. |
| Placards | Upper bagel ink≈705–717; lower≈836–846 | Native uppercase Fredoka with actual75width axis, following the blank placards on new artwork; no raster labels. Exact vertical differences remain measurable. |
| Progress | Approx.x465,y916,w605,h79 | Native buttons, iconography and callbacks at this anchor. |
| Side volumes | Menu pillar, staff, shelving/plants | New reference-guided architecture, real catalog names without invented prices; native shirt decoration. The user subsequently excluded the left cup stacks and right tote, as well as the rejected Fresh/Happier slogan. |

All four initial selected art assets were generated with the approved reference as an image input, not as a runtime screenshot or a crop. Current `2199afb` room assets are subsequent native edits of our own wide/portrait generations removing the excluded cups and tote; the composition was not cropped to hide them. They are reference-guided **conceptual** layers, not unrelated independent venue photography. The architecture has no raster text/logo/UI/food. Counter art has eight bagel and only five schmear concepts, without raster labels. Combo art replaces the soft older individual photographs in the entry category only. Encoding is lossless, with alpha/visible-pixel verification; originals remain preserved in generated_images. See [current review and exact source attribution](reference-alignment-review-20261101.md).

Known asset limits before the first screenshot: the selected counter has a strong visible band about493px high/2005px wide, approximately351px high at1440px rendering width, and≈58/42 split rather than300px and54/46. A native refinement was rejected for altering flavor concepts. These deviations are not hidden by measuring only the anchor container. The exact SVG brand shape, food styling and generated staff are not identical to the reference. No final fidelity score or pixel-perfect claim is authorized by functional tests.

Commercial source/callbacks, quantities, catalog prices, optional upsells, review-only checkout and consent remain intact. No Fresh slogan, sixth schmear, drinks, sandwiches, Wallet, invented offers, payment confirmation or activated loyalty. No PR46 integration, deployment, Sites change, production write, credential/permission change or spending. Keep autodeployfalse. PR47 metadata update remains blocked and is not retried.
