# Boutique Bagelito implementation plan

**Goal:** Replace the flat display with a spatial, warm boutique scene based on the approved visual reference.

**Architecture:** ReferenceScene keeps its exact commercial callbacks. Newly generated architectural and tray art provide depth and food detail; SVG lettering, category cards, eight bagel/five schmear captions, menu/cart and progress remain native elements. The reference raster and derived crops are never rendering assets.

**Scope authorized:** Continue visual implementation and produce a first real screenshot before extended QA. No additional approval gate is needed for this already requested work.

**Constraints:** No new dependencies; no prices, quantities or recipes invented from the storyboard; combos only Bagels + schmears. Keep review-only purchase, optional upsells, consent and inactive loyalty. No remote merge, deployment, Sites update, live payments or PR metadata retry.

1. Inspect original reference and current screenshots/assets. Separate existing soft product photography from independent conceptual art. Done.
2. Generate room architecture without raster text/UI and abundant bagel trays independently from text. Preserve originals and generation provenance. Done.
3. Rebuild ReferenceScene/CSS with full-width responsive composition and native controls. Compile and commit a WIP candidate, then capture 390/320/tablet/desktop through a loopback review-only server.
4. Inspect actual pixels and fix reproducible clipping/legibility/composition defects. Preserve source SHA and before/after captures.
5. Update image-decoding coverage explicitly for the changed scene structure; retain source guards, no-reference requests, keyboard/callback/44px/12px/16px and failclosed assertions. Run focused entry/purchase cases and build/Node checks appropriate to changes.
6. Publish verified source/evidence on the existing draft PR47 branch if allowed. Do not retry the denied metadata operation. Report exactly which cases ran and remaining visual/device limits.

**Review focus:** 320px category copy and brand; all native labels without raster duplication; room art must not masquerade as application controls or product stock; full-width tablet/desktop; unchanged compact checkout chrome; no reference crops or external commercial requests. Conceptual assets are not actual product photographs or proof of recipes/inventory.
