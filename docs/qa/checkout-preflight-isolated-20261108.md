# Checkout preflight QA — 2026-11-08

## Reproducible isolated execution
Node.js 22.16.0; reconstructed exact text of the two current GitHub files in an isolated workspace (the import path was adapted from `../src/lib/` to `./` only for colocated execution). Command: `node --test checkout-readiness.test.mjs`. Result: **15 pass / 0 fail / 0 skipped**, ~116 ms. This is **not** GitHub Actions CI, full-repo integration or a real checkout/payment test.

Source branch `feat/storefront-selection-20261102`, commits `dd42cf11f5bbd5aa11280c0def45b3318480df96` (validator) and `172b7f42f0b105fa55ac8b3798ef792fc80740d8` (tests).

## Security finding: still NOT safe to wire directly
`trustedSnapshot:true`, `paymentEnabled:true`, `product.available:true`, `priceCents`, `maxQuantity`, `delivery.tariffVerified:true` are ordinary booleans/values and are forgeable if accepted from a browser. A passing result is **not** an authorization token. This function must run **only after** a server has independently fetched and validated canonical catalog version, stock/reservation, capacity, district, delivery tariff, order version and payment policy. Do not expose a client route that trusts these fields. Marketing opt-in is not a condition of purchase.

## Next code integration gate
1. Locate existing server checkout/quote handler and identify its authoritative catalog/Delivery V2 adapters.
2. Map approved versioned SKU data to immutable server-calculated quote, without client-provided prices.
3. Test duplicate webhook replay, stale quote, zero capacity, unknown SKU, and client-forged flags.
4. Keep `payment=not_requested` and Culqi/Whop inactive until payment provider decision and sandbox acceptance.

No deployment, merge, live payment, customer message, AI call or CRM mutation.
