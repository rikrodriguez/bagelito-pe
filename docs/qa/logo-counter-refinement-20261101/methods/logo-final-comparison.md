# Logo: reference → baseline → final

Final code: `5f318730e928fd3e6d05dcdb7b34dbfc13247c59`.

Read-only analysis of actual 1536 × 1024 pixels. No product or test files changed. No further optimization proposed.

| Stage | Maximum letter bbox coordinate difference from reference | Blue word area | Tagline blue area difference |
|---|---:|---:|---:|
| Reference | 0 px | 31079 px² | +0.00% |
| Baseline 2199afb | 28 px | 39793 px² | +99.06% |
| Pass 1 e9d995c | 5 px | 30815 px² | +17.23% |
| Pass 2 2e03fd0 | 2 px | 30344 px² | +10.42% |
| Final 5f31873 | 2 px | 30653 px² | +10.42% |

These coordinate and ink measurements describe this logo ROI. They are not a visual-fidelity score or an acceptance criterion for the rest of the storefront.

| Letter | Reference bbox | Final bbox | Reference/final blue area (px²) | Area change | Reference/final enclosed counter areas (px²) |
|---|---|---|---:|---:|---|
| B | [508, 129, 606, 232] | [508, 129, 606, 232] | 4580 / 4510 | -1.53% | 741,723 / 924,1108 |
| A | [616, 103, 698, 198] | [615, 103, 698, 198] | 3959 / 3630 | -8.31% | 432 / 438 |
| G | [695, 75, 782, 171] | [695, 73, 782, 170] | 4666 / 4800 | +2.87% | none / none |
| E | [788, 67, 860, 164] | [787, 67, 860, 164] | 4332 / 4553 | +5.10% | none / none |
| L | [871, 69, 942, 169] | [870, 69, 942, 169] | 3091 / 3081 | -0.32% | none / none |
| I | [954, 81, 990, 176] | [955, 80, 989, 176] | 2179 / 2112 | -3.07% | none / none |
| T | [1004, 89, 1084, 188] | [1004, 89, 1083, 188] | 3382 / 3278 | -3.08% | none / none |
| O | [1077, 128, 1174, 224] | [1079, 128, 1172, 223] | 4890 / 4689 | -4.11% | 2242 / 2281 |

The final A edge correction changes its enclosed blue counter from 747 px² in Pass 2 to 438 px², versus 432 px² in the reference (+1.39%). Its outer bbox is unchanged. The seven other letter records and tagline are exactly unchanged from Pass 2.

Final tagline bbox: `[657, 185, 993, 228]`; reference: `[660, 183, 989, 230]`. Final tagline ink is 2,819 px² versus 2,553 px² (+10.42%). The threshold-derived median character half-stroke maximum is 4 px versus 3 px. This is not a true typographic stroke-width measurement.

Reference/final threshold-derived median blue RGB: `[2.0, 58.0, 155.0]` / `[2.0, 58.0, 155.0]`; coral: `[241.0, 139.0, 133.0]` / `[241.0, 139.0, 133.0]`. Matching medians do not establish equivalent lighting, material, edge color, or shape.

Method: fixed ROI [475,40,1230,250], fixed RGB masks, 4-neighbor connected components; eight blue components above 500 px² sorted left-to-right. Bboxes are [xmin,ymin,xmax,ymax] with exclusive maxima. Counters are enclosed non-blue regions inside each isolated blue face; this includes inner coral/background, not only white. Tagline uses the same small-component selection for every image. Exact thresholds and source hashes are preserved in the JSON/script.

Limitations: native font/vector rendering differs from photographic letterforms. Final B has two enclosed counters, but their areas are 924/1108 px² versus 741/723 px² in the reference. A retains 8.31% less blue ink; E has 5.10% more. PCA angles in JSON describe ink inertia, not font rotation; nearly circular O makes those angles unstable. No screenshot outlines were traced. No claim of pixel-perfect fidelity is supported.

Reproduce in the existing environment (Pillow/NumPy/SciPy already installed):

```sh
python /workspace/bagelito-boutique-evidence-20261101/logo-counter-refinement/logo-pixel-audit-final.py
```

Artifacts:

- Final PNG SHA256: `98477829e9e24478be7fd13412cb00edac793d45201a6786e924ef5c5b1a692d`
- JSON SHA256: `84b533e6424662db464d5452293bae68db366f31a48bd4f1dad9635e967f9526`
- `logo-pixel-audit-final.py`
- `logo-measurements-through-final.json`
- `final-5f31873/read-only/1536-entry.png`

No blocker remains for this measurement task. Commercial behavior, mobile rendering, and whole-scene fidelity were outside its scope.
