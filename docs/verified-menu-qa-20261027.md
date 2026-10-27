# Source-verified menu in the photographic visit

## Scope
Preserve /visita entrance, camera, three category choices, and all existing pack-builder work from PR #31. Add a read-only menu dialog to the chosen category. No new combo/schmear configurator, inventory change, order creation, price calculation for payment, server API change, database write, or production deploy.

## Primary sources
- IMG_4144.jpeg: regular packs; Perfect Pair S/74 (6 mixed + 1 × 120g); Brunch Pack S/140 (12 mixed + 2 × 120g); Schmear Lover S/99 (6 mixed + 3 × 120g). These are NOT sandwich-and-drink combos.
- IMG_4145.jpeg: 120g Original S/12 / flavored S/16; 180g S/18 / S/23; 240g S/22 / S/29.
- IMG_4139.jpeg: Whipped Original; Herbs & Roasted Garlic; Ají Amarillo; Honey Cinnamon; Classic Strawberry. No other schmear names were added.
- IMG_4146.jpeg: mini bagels and custom-color pricing recorded for later configuration.
- IMG_4140.jpeg: kraft-paper bags and monochrome stamp as packaging reference; the approved blue/coral primary logo is not replaced.

## Unknowns not inferred
Inventory, ingredient/allergen lists, nutrition, tax breakdown, delivery tariff, and exclusions on combo flavor choice are not supplied. The 180g +S/6 / 240g +S/13 supplement does not state a charging unit (per tub vs whole combo); it is stored verbatim with automatic charging disabled. Custom colors at quantities above the stated minimum are likewise not automatically quoted.

## Verification
Tested application SHA d46e4e0aef63752294b023e295aa08a6a68aa73e. The following additional change only disables automatic builds for this review branch.
- New tests first failed for missing reference data; after implementation Node suite 91/91 PASS.
- ESLint PASS. Next build and TypeScript PASS. /visita first-load JS reported by build: 129 kB (not a Lighthouse score).
- Chromium 390×844, 320×700, 1440×900: scene decoded; enter; choose all three categories; open real menu; exact screenshot values present; menu contained within viewport; Escape closes; focus returns; selection survives refresh. No horizontal overflow, no JavaScript errors, no mutating network requests.
- Axe-core WCAG 2/2.1 A/AA rule set on open schmear dialog: zero detected violations at those three widths. This is not a comprehensive accessibility certification or physical iPhone Safari test.
- Native dialog's scroll area keeps the entire catalog readable on a compact screen without replacing the full-screen store.

## Inherited limitations
The photoreal scene is conceptual, not a real establishment. It is unchanged in this patch, so text baked into it is not asserted to be commercial data. Use the supplied menu dialog as the source of real options. The inherited build-time image importer still relies on temporary Adobe links unless VISIT_ASSET_DIR is provided; assets should be archived before production. Fonts/images are served locally by an already-built deployment.

## Release gate
Draft PR stacked on PR #31; no merge and no changes to bagelito.pe. Preview only, BAGELITO_MERCHANT_REVIEW_ONLY=true. Payments/CRM/past orders remain outside scope.
