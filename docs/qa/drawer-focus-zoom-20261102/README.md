# Reference drawer focus and high-zoom reflow — 2026-11-02

Application `09eb1a321908ae2693ef68bdfcbc04a79b6a1148`; tested local `6fe38498ae0edc852f77b5d18072fec3dfd2744f` has identical tree `6005b51c84f5601b23564a3b547739f05cf6fe8f`.
This fixes reproduced usability defects, **not final mockup fidelity acceptance**.

## Reproduced and corrected

- Before: opening the menu and pressing Tab moved focus to the cart **behind** the overlay. The reference menu and cart are now labelled modal dialogs: background siblings become inert, initial focus enters the panel, Tab/Shift+Tab wrap, and closing restores the opener. Existing Escape behaviour remains. An explicit in-panel menu close control is added. Selecting categories in the menu also closes it when already on the selector scene. Legacy non-reference nav/aside semantics remain unchanged.
- Before: a native 500px Chrome window at 200% zoom yielded 250 CSS px. Document overflow was zero, but the Schmears card had clientWidth 68/scrollWidth 80 and its heading was clipped. Below 301 CSS px, the entry cards now stack as image/copy rows, and the progress control reflows to three columns. The fix does not reduce font sizes, stretch images or hide overflowing text. At the same zoom, cards are 221/221 and copy 105/105; “Schmears” is fully visible.

[Menu before](captures/menu-before-1180.jpg) · [Menu after](captures/menu-after-1180.jpg) · [Cart after](captures/cart-after-500.jpg).

| 200% native Chrome zoom | Evidence |
| --- | --- |
| Before, clipped heading | [Before](captures/zoom200-before.jpg) |
| After, top | [After top](captures/zoom200-after-top.jpg) |
| After, scrolled cards | [After cards](captures/zoom200-after-cards.jpg) |

Selected screenshots preserve original JPEG tool bytes. Tool captures are content regions, not full native windows; exact dimensions/SHA256 are in [capture-manifest.json](capture-manifest.json). The zoom captures are 243×347 rendered regions from the 250×357 CSS viewport.

## Verification on this application

- **82/82 Node tests PASS**, zero skipped. Eleven new checks: ten focused helper/integration-contract tests and one CSS regression. The helper suite uses a minimal fake DOM, not a browser or React integration emulator.
- **Full npm run build PASS**, including TypeScript and existing structural 11/manual 4/movement 14 checks. Movement 14 is already in Node 82; it is not an additional 82 + 14 suite.
- Independent source review found no critical issue and independently reran the ten focus tests.
- Native 1180×757: menu initial focus; Shift+Tab first→last; Tab last→first; middle traversal; Escape; explicit in-panel close; empty cart single-control cycle; focus restored to each opener and inert removed.
- Native 500×714 at 100%: menu navigation across scenes and same-scene category dismissal; populated cart initial focus, reverse/forward wrap, Editar sabores dismissal and opener restoration. Selections remain intact.
- Native 500px window at 150%: 333×476 CSS px, DPR 1.5, cards 96/96 and document overflow 0. At 200%: 250×357 CSS px, DPR 2, document overflow 0, cards 221/221, copy 105/105, actual native scrolling reaches all three cards. Combo click works at 200%; progress computes three columns. Header screenshot immediately after Ctrl+Home was taken during smooth-scroll, so it does **not** prove settled header clearance.
- After one browser recovery: one complete review-only Combo path at 500px, Everything + Sesame + Ají Amarillo 120 g → review → delivery/consent. Checkbox checked and unchecked; Pago no activo remained disabled. No contact/address data entered or submitted. The [closed gate capture](captures/closed-gate-500.jpg) also shows the unchanged 10-order loyalty promise and inactive tracking/redemption.
- [Source audit](source-audit.json): 159 existing runtime/asset/config files unchanged; 24 named selection/commerce functions and the commercial render after the chrome are byte-identical. One menu callback intentionally adds dismissal; not all onClick expressions are unchanged. Only GuidedCommerce chrome, the new focus helper and aligned CSS change at runtime. Catalog, checkout, loyalty, payments, all image/reference/brand bytes and scene geometry are untouched.
- [Node log](node-tests.log), [build log](build.log), [browser observations](browser-observations.json), [preflight](preflight.json). Preflight only checks source pinning and lists a **planned**, unexecuted automated matrix; it is not evidence that those scenarios ran.

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
 CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
 npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
QA_CODE_SHA=<tested-local-sha> node scripts/qa-rebuilt-storefront.cjs --preflight
```

## Limits and cleanup

One unscoped Playwright close-menu locator matched both the inert trigger and in-panel button; no click occurred. Scoping to the labelled dialog resolved it. During the final journey, CDP timed out and native Chrome displayed “Can't open this page”, error 9; browser failure is recorded rather than represented as application success. A single native Reload recovered the page; that fresh attempt then completed the review-only path above. The failure cause is not established; it is not attributed to the application.

This is native desktop-window/zoom QA, not mobile/touch emulation or a full 320/390/tablet/landscape matrix. No Safari, screen-reader announcement, full external-focus recovery, complete network audit, purchase or live financial flow is certified.

The official arched logo still needs a clean export from the original authenticated design. The current approximate wordmark is unchanged; no guessed font, screenshot crop or invented asset is substituted. Upper/rear case glass still differs from the approved reference. No claim of exact visual equivalence.

Sites loopback preview was stopped, matching its initial state. QA tab 119 was closed; native viewport restored to 1180×757, DPR 1/100% zoom. Final DOM: reviewOnly=true, inertCount 0, Canvas 0. No Site save/sync/publish, production deploy, merge, credentials, permissions, dependencies, spending or third-party message. Review-only guards and autodeploy=false remain unchanged. PR remains draft; remote CI is reported separately.
