# Verified visit menu — implementation plan

**Goal:** Preserve the approved full-screen entrance → display → Packs/Combos/Schmears experience and ground the preview's menu exclusively in the five user-uploaded screenshots.

**Architecture:** Layer a read-only, accessible menu on the existing /visita branch. Do not recreate the store. Base is PR #31 at 4cf686b7db6b64273b96e670c377aeadf422cc56, preserving PR #30 and all later pack-builder work. Existing pack configuration remains unchanged; no new combo/schmear checkout is implemented.

**Sources:** IMG_4144.jpeg (packs/combos); IMG_4145.jpeg (schmear sizes/prices); IMG_4146.jpeg (mini bagels/custom colors); IMG_4139.jpeg (five flavors); IMG_4140.jpeg (kraft-paper packaging reference, not replacement brand identity).

## Constraints
- Existing approved image and white-square-tile/blue/steel design stay untouched.
- Latest explicit screenshots override generated render menu text and speculative blueprint ideas.
- Combos are bagels + schmears, not sandwiches or drinks.
- Do not infer stock, ingredients, allergens, tax breakdowns, pickup/delivery timing or financial approval.
- The extra schmear-size charge's application unit and custom-color batch unit are unconfirmed; preserve literal offer but no automatic charge.
- No database/API writes, orders, charges, production deployment or merge.

## Tasks
1. Write source-price regression tests; verify missing source module fails.
2. Create a reference JSON with the four regular packs, three combos, five schmears and three size tiers. Archive minis/custom-color terms separately from enabled configuration.
3. Add a small read-only menu dialog reachable after category choice. Preserve camera, progress bar, current pack builder and original logo. No added category or promotion.
4. Test JSON exactness, JSX, type/build, keyboard close/restore and compact-screen dialog fit. Preserve the upstream photographic asset pipeline; explicitly report any unavailable or expiring dependency.
5. Draft PR against PR #31 and preview-only deployment when verified. No changes to main.

## Review focus
Incorrect original vs flavored schmear price; mistaking combo packaging for sandwich+drink; invented flavor names from generated images; ambiguous size-supplement charging; dialog overflow on 320px.
