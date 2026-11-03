# Bagelito: interactive vitrine and published menu, 2026-11-03

First progressive design candidate over PR47 `0a5ccfdb112f675e6529f593c69a3a870c78b612`.

## Changes
- Real buttons directly on the eight photographic bagel trays. Selection fills a visible kraft box; removing a mixed-pack bagel returns focus to its tray. A single-flavor pack has an explicit whole-box clear action.
- Authentic supplied logo pixels, with gallery chrome clipped using SVG, replacing reconstructed lettering. Blue #004aad retained.
- Separated entrance cases with restrained numbered placards and readable flavor legend, accessible descriptions, quieter step controls. This is a first iteration toward the newly supplied immersive references, not final visual acceptance.
- Restored menu combos: Perfect Pair 6+1×120 g S/74, Brunch Pack 12+2×120 g S/140, Schmear Lover 6+3×120 g S/99. Pack prices visible. Custom Colors reference states minimum six, base S/50, 1–2 colors included, 3–5 +S/10, 6–7 +S/15.
- Drafts preserve the selected published combo ID and its full bagel/pot quantities. Legacy 2+1 remains recovery-only with no assigned price.
- Combo payment/persistence remain closed. Premium inclusion, upgrade granularity and stock are not inferred. No payment, SQL, provider credentials, deployment settings or production domain changed.

## Verification
- 407/407 Node tests PASS, zero skipped, serial run with the pinned offline HDR.
- Full npm build PASS: client/server Vite, TypeScript, static/fallback/movement aggregate. Counts from included checks are not added to the Node total.
- Independent static review's four initial findings fixed (single-flavor removal wording, disappearing-control focus, accessible legend and number contrast).
- New `scripts/qa-boutique-experience.cjs`: syntax and preflight PASS. Browser execution still pending; local Chromium stops before navigation at socket Operation not permitted. Controlled escalation also could not start because the environment wrapper encountered read-only session infrastructure. No restriction was bypassed.
- Earlier failed/interrupted checks are retained alongside the final logs; initial test fixture adaptation and resource-killed TypeScript attempts are not presented as passes.

## Reproduce isolated visual QA
Build, then start `.output/server/index.mjs` with `BAGELITO_REFERENCE_REVIEW_ONLY=true`, `BAGELITO_MERCHANT_REVIEW_ONLY=true`, `NITRO_HOST=127.0.0.1`, `NITRO_PORT=3290`. Run the browser script with BASE_URL=http://127.0.0.1:3290 and a fresh OUTPUT_DIR. It blocks API and non-loopback egress and checks 320/390/768/1280 entry, empty/partial/full box, removal focus, count cap, cashier and back navigation.

Scripts for older reference compositions remain historical; the new script is the candidate's visual acceptance path. A preview is not authorization to merge or launch the store.
