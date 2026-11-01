# Logo-only pixel comparison: reference → 2199 → PASS1 → PASS2

No product or test files were edited for this audit. All images are1536×1024. Same blue/coral thresholds and component rules are used for every image. The PNG and source hashes are in `logo-measurements-through-pass2.json`; calculation code is `logo-pixel-audit-pass2.py`.

| Letter | Reference blue bbox / area | 2199 area | PASS1 area | PASS2 blue bbox / area | PASS2 area difference |
|---|---|---:|---:|---|---:|
|B|[508, 129, 606, 232] /4580|6396|5882|[508, 129, 606, 232] /4510|-1.53%|
|A|[616, 103, 698, 198] /3959|5246|3519|[615, 103, 698, 198] /3321|-16.12%|
|G|[695, 75, 782, 171] /4666|6255|4644|[695, 73, 782, 170] /4800|+2.87%|
|E|[788, 67, 860, 164] /4332|5996|4296|[787, 67, 860, 164] /4553|+5.10%|
|L|[871, 69, 942, 169] /3091|3511|2871|[870, 69, 942, 169] /3081|-0.32%|
|I|[954, 81, 990, 176] /2179|2503|1878|[955, 80, 989, 176] /2112|-3.07%|
|T|[1004, 89, 1084, 188] /3382|3779|2798|[1004, 89, 1083, 188] /3278|-3.08%|
|O|[1077, 128, 1174, 224] /4890|6107|4927|[1079, 128, 1172, 223] /4689|-4.11%|

Maximum absolute per-letter bounding-coordinate error:2199=28px;PASS1=5px;PASS2=2px. This is a coordinate diagnostic, not a fidelity score. Different inner counters or stroke distributions can share the same bbox/total area.

## Counters and remaining shape limits

- B: reference has two counters, areas741/723px. 2199 has one873px counter;PASS1 one2014px counter. PASS2 correctly has two,924/1108px. The outer bbox matches and blue area is1.5% below reference, but both counters are still larger than the reference; typography is not exact.
- A: reference counter432px,bbox[637,128,660,157]. PASS1 counter201px. PASS2 counter747px,bbox[632,124,665,162], overshooting area by73% and blue-face area16% below reference. The triangle mask plus11SVGpx coral edge paints the outside half over the blue face; the extra approximately9CSSpx explains the wider/taller non-blue hole. This is an observed limitation, not a request for further optimization.
- G: no enclosed hole in either reference or candidates; its interior is open. No enclosed-counter measurement is invented.
- O: reference counter2242px,bbox[1096,151,1156,202]. PASS2 counter2281px,bbox[1099,148,1152,203]: area is close, but shape is narrower and taller/upward.

## Tagline, color and angle

- Tagline blue bboxes: reference[660,183,989,230];2199[683,180,1032,225];PASS1[653,184,997,228];PASS2[657,185,993,228]. PASS2 center is essentially aligned; it remains7px wider and4px shorter, with10.4% more blue ink.
- Median blue/coral colors: reference[2,58,155]/[241,139,133];2199[0,74,173]/[250,150,127];PASS1 andPASS2 match those reference medians. Matching medians does not recreate the photographed lighting, material gradients or extrusion.
- PCA in JSON measures ink inertia, not true font rotation. The I axis is reasonably stable(reference−9.7°,PASS2−9.0°). O is nearly round(eigenvalue ratio1.04 inPASS2); its PCA angle is unstable and must not be interpreted as letter rotation.

The reference is a photographed/rasterized custom mark; candidates mix native font glyphs, masks and a font-derived B vector. Antialiasing, photographed curves, inner contours and shadows still differ. No pixel-perfect, font-identical or commercial-flow claim is made.
