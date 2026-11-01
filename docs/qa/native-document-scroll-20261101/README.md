# Native document scrolling — 2026-11-01

**A real scroll lock was reproduced and fixed.** At 500 × 714, the entrance
extended below the viewport, but the inherited global `body { overflow:hidden }`
prevented wheel/End input from reaching the schmear vitrine and progress bar.
Programmatic `scrollIntoView()` in the earlier driver could conceal this defect.
Older gallery-scroll claims are not evidence that native document input worked.

Before: PR47 `14558ef2480c4adda26a788ffd2b326ce74ff84a`.
After/application code: `dacea773ddea6179f714cb2a0b08e8067d2eb470`.
The local tested code commit `c0eb14748ab1dc8d1d4798e962da13bb03cad11a`
and published code commit share tree `6b6ec64fb931ddd7058fd76a05486c1da9dacf29`.
The evidence commit adds documents/captures only.

## Actual browser results

| Native desktop window viewport | Before | After |
| --- | --- | --- |
| 500 × 714 | `overflow-y:hidden`; document height 1246; wheel `scrollY 0 → 0`; End also stayed at 0 | `overflow-y:auto`; document height 1226; wheel `0 → 512`; targeted Ctrl+Home returned to 0 |
| 1180 × 757 | Entry inspected; no native-wheel coverage credited | `overflow-y:auto`; document height 850; wheel `0 → 93` |

The real scrollbar uses 15px: layout client widths were 485 and 1165. Both
after states had **zero horizontal document overflow**. The 1180 entry had
five decoded HTML images and no Canvas. Browser screenshots are original JPEG
bytes returned by the tool, not PNGs or edited composites; see the
[capture manifest](capture-manifest.json).

- [Blocked narrow entrance](captures/wheel-500-before.jpg)
- [Narrow entrance after keyboard return](captures/entry-500-after.jpg)
- [Lower vitrine reached with real wheel](captures/wheel-500-after.jpg)
- [Desktop entrance](captures/entry-1180-after.jpg) and [wheel to footer](captures/wheel-1180-after.jpg)
- [Review-only consent/payment/loyalty](captures/combo-review-500-after.jpg)

At 500px, real UI controls completed: Combos → two bagels (Everything, Sesame)
→ one 120g schmear (Ají Amarillo) → cashier → delivery/consent review. The cart
showed three products and the summary matched. Consent could be checked, but
both payment entry and “Pago no activo” remained disabled. No customer details
were entered or submitted. The loyalty copy states 10 orders → 2 bagels + 1
schmear, with backend tracking/redemption explicitly not active. There were no
Canvas or iframe elements at checkout. This is **one review journey**, not a
purchase, exhaustive checkout test, or verification of all optional upsells.

## Small fix and stronger guard

Only runtime change: `body:has(.reference-storefront)` enables vertical document
scrolling while that shell is mounted. The older fixed-screen tour's default is
unchanged. No product art, reference image, commercial callbacks, checkout,
catalog, dependency manifest, or deployment setting changed.

The entry driver now exercises native wheel then keyboard return **before**
programmatic gallery scrolling, records those observations, and rejects hidden
or clipped document roots. A fitting document is explicitly not credited with
wheel coverage. Full-bleed and clipping measurements use layout `clientWidth`,
not the scrollbar track; reference anchors retain their nominal proportions and
the existing 1px tolerance. No geometry/font/target minimum was lowered. Global
CSS is now included in the driver's source hashes.

Six deterministic regressions cover native-input sequencing, hidden/clip roots,
blocked wheel, fitting documents, route scoping, and scrollbar-aware full bleed.
**66/66 Node tests passed, zero skips.** Build, TypeScript, and inherited static,
manual and movement checks passed (movement cases are not counted twice).
Source/script/test `git diff --check` and script syntax checks passed. Build logs
retain their original whitespace. Commands:

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
NODE_OPTIONS=--max-old-space-size=1536 npm run build
```

The HDR fixture is only for inherited tests, not this DOM storefront:
SHA256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`.
The first final-suite invocation omitted this mandatory environment variable;
three test files rejected setup. The corrected invocation passed all 66 cases.
The build preceded QA-script-only refinements; runtime sources and compiled
preview were unchanged thereafter. Exact runtime files are pinned in
[source-hashes.json](source-hashes.json), and actual browser text/metrics in
[browser-observations.json](browser-observations.json).

## Visual comparison and remaining limits

The [actual approved reference](../../../public/images/store-reference-approved.webp)
and fresh desktop/narrow pixels were inspected. The composition retains the
logo, category cards, abundant independent product vitrines and native labels;
the narrow layout reflows into separate vitrines rather than stretching the
reference photo. This patch does **not** claim pixel equivalence or redesign:
wordmark contours, product art and the counter seam still differ from the
reference. The approved reference asset is unchanged (SHA256
`0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`).

These were two actual Chromium desktop window sizes, **not touch/device
emulation**. The cloud window minimum was 500px; DevTools was blocked by browser
policy and was not bypassed. The exec Chromium path still cannot create its
sandbox socket, so the full 320/390/tablet/landscape/1536/1920 matrix and the new
Playwright entry driver have not been rerun end-to-end here. A read-only cloud
attempt at the full geometry helper could not instantiate `WeakMap`; no full
geometry-audit pass is credited. Safari, physical devices, comprehensive network
instrumentation, all upsell branches, and remote CI remain unverified by this run.

The supported Sites daemon served a **local-only** compiled preview with both
review-only guards enabled. It was stopped before QA, and was stopped again
afterward; the browser window size was restored and the QA tab closed. No Site
was registered, published, deployed, or synced; no production data, Mesa
publication, credentials, permissions, payment provider, or spending was changed.
