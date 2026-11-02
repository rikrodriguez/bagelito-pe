# Guided product lines — 2026-11-02

**Draft implementation; reference storefront and payment gates remain closed.** This is not a checkout launch, a new price approval, or proof of database installation.

## Implemented

`planGuidedOrder` now provides one canonical, side-effect-free representation for packs, optional pots, standalone schmears, the current two-bagel combo, and the QA-only two/eight-bagel extra. Each line retains bagel flavors/counts and schmear flavor/grams/count; the quote includes the dated menu source (`2026-10-14`). Prices are read only from the existing verified-menu snapshot. No new selling price or promotion was introduced.

- Malformed optional schmears, negative/coerced quantities and unknown flavors cannot silently disappear from a pack.
- Invalid combinations are rejected before inventory reads. A pack's optional pot remains exactly 120 g, not an implicit conversion from another selected size.
- Capacity projection uses actual selected bagel units (2 for the current combo; 0 for a pot alone; 2/8 for the corresponding extra). This does **not** verify schmear inventory.
- Unknown-price lines remain explicit with `publishedAmountPen: null`; `amountPen` is null if any line is unpriced. A pot's price is no longer presented as the total of pot + unpriced bagels. Premium/mini unresolved prices are not presented as complete totals either.
- A known pack + 120 g pot has a complete **dated reference subtotal**, but is still `review_required` because the current transaction adapter cannot persist the pot.
- Session creation consumes the same canonical plan and allows only the existing lossless large 6/12 bagel-only projection. Even an erroneously ready quote cannot cause a partial order to be persisted. Existing idempotency, legal acceptance, capacity RPC, provider and payment gates are unchanged.

## Evidence and unresolved commercial choices

Repository source: [`verified-menu-2026-10-21.json`](../src/domain/data/verified-menu-2026-10-21.json), menu dated October 14, inspection recorded October 21. The original menu's current availability was **not** re-certified on November 2. Its quoted values are reference evidence, not current inventory or authorization to charge.

**Price clarification resolved later on November 2:** Ricardo supplied an image of `bagelito.pe`'s published menu carousel, slide 4/6. Direct visual inspection confirms every existing schmear price: 120 g S/12 original / S/16 flavored; 180 g S/18 / S/23; 240 g S/22 / S/29. SHA-256: `db730c30cd00acae2f5af50b0684f1ef5f3e4e63068cf02e8c6b33d7489f58f4`. The image is not republished here. This current user-supplied evidence resolves the editable Canva conflict **without changing any price**. Confirmation metadata is recorded separately in the JSON; it does not re-certify the entire menu or stock. The S/48 and S/90 packs visible above are a separate Halloween promotion and were not imported as ordinary pack prices.

| Product | Existing dated evidence | Current treatment |
|---|---|---|
| Large packs | Single 6/12: S/50 / S/100; mixed 6/12: S/60 / S/115 | Existing non-premium path preserved; payment gates remain separate |
| Schmear 120 g | Original S/12; flavored S/16 | Confirmed by current user-supplied published-menu image; review-only product line |
| Schmear 180 g | Snapshot S/18 / S/23 | **Resolved:** current user-supplied published-menu image confirms S/18 / S/23; conflicting editable Canva text is not used |
| Schmear 240 g | Snapshot S/22 / S/29 | Confirmed by current user-supplied published-menu image; review-only product line |
| Historical combos | 6 mixed + one 120 g pot S/74; 12 mixed + two pots S/140; 6 mixed + three pots S/99 | Canva page 3 corroborates; **not** prices for the current 2+1 journey |
| Current two-bagel + one-pot combo | No confirmed selling price found | Exact composition retained; amount null; never ready |
| Two/eight-bagel extras | No approved price/promotion found for these journeys | Explicit unpriced line; never ready; no inference from S/10 unit reference or “6+2 gratis” QA copy |
| Historical pot upgrade | +S/6 (180 g), +S/13 (240 g) | Snapshot does not define per-pot vs per-combo. Not applied |
| Premium packs | Canva page 7 contains single 6 S/60 / single 12 S/110; snapshot omits that rule | Not imported from an unverified editable version; mixed inclusion remains unresolved |

The original user-provided Canva design was read through its connector on November 2 (11 pages, with repeated material that may be drafts). Its private editing link and artwork are not republished here. Instagram's original post could not be re-opened in the source audit. A retrieved historical **assistant** message about restoring the three older combos could not be read with surrounding user context; it is not treated as user commercial approval. No current journey/composition was changed on that basis.

## Persistence boundary verified in source, not in the live database

The separate financial candidate PR23 at `085f3df` contains `create_culqi_reservation_order` in [`add-checkout-safety.sql`](https://github.com/rikrodriguez/bagelito-pe/blob/085f3df/supabase/add-checkout-safety.sql): positive `p_pack_units`, bagel-only `flavor_slug/flavor_name/quantity` items, inserted bagel sum equal to pack units, and capacity counted from pack units. The original [`setup-bagelito-reservations.sql`](https://github.com/rikrodriguez/bagelito-pe/blob/085f3df/supabase/setup-bagelito-reservations.sql) has no product kind or pot grams in `order_items`.

Therefore do not encode a pot as a bagel, charge an unpersisted add-on, put product composition only into delivery notes, or create a fictional six-bagel standalone order. Core financial installation has already been documented separately; **do not blindly reapply those migrations**. This audit made no database connection or migration.

Before these products can sell end-to-end:

1. Reconcile the dated catalog against the current commercial source: exact available products, combo composition/price, premium inclusion, optional extra offer and upgrade scope.
2. Add a separately reviewed forward-compatible product-line persistence adapter/RPC, with explicit product kind, bagel format, schmear grams/counts, immutable server-priced amounts and full canonical replay matching. Keep stock/capacity, legal evidence and reservation creation atomic; do not weaken the existing financial core.
3. Test zero-bagel standalone orders, mixed lines, every supported price, retries/concurrency, same-total substitutions, refunds/reconciliation and fulfillment receipts against an isolated database. Confirm actual installed schema before any rollout.
4. Only with explicit authorization configure isolated sandbox credentials and perform Culqi HTTP/3DS/webhook tests. Production activation remains a separate authorization and acceptance gate.

The current frontend is still `reviewOnly`; no existing financial flag, secret, environment, live database or deployed site was changed.
