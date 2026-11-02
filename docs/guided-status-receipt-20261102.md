# Gated status → historical product receipt — draft, 2026-11-02

The status route can now deliver a minimized, validated `productReceipt` from the existing stored product snapshot. **The feature is off by default, sandbox-only, and denied in production/live even when its flag is set. No flag, credentials, database, migration, payment, price, deployment or merge was changed.** The storefront remains review-only; this is not a complete working customer checkout or production launch.

## Access and disclosure

- The existing configured payment-status and origin guards run first. JSON is bounded at 4 KiB and the existing payments rate limiter runs before creating the order reader.
- `orderCode` plus the random checkout-session UUID is an existing bearer capability, not authentication of a person. Neither value alone is enough. Both must match the same database row; returned row identities are checked independently. Browser-supplied order IDs, prices, payment states and products are ignored.
- Product disclosure additionally requires exact server flag `BAGELITO_GUIDED_RECEIPT_ENABLED=true`, sandbox mode, non-production environment, configured bridge, explicit matching Origin and no cross-site/same-site Fetch Metadata. The product path additionally requires a v4 checkout capability. No flag is added to public configuration. Closing intake or merchant review does not disable recovery of an existing payment.
- Default-off, legacy non-guided orders and unconfirmed/reconciling/cancelled states do not query the proposed snapshot RPC. A guided paid order under the explicit gate must have a valid snapshot; missing, malformed or contradictory data fails generically rather than pretending to have full details.
- The server-derived internal order ID is used only inside the injected reader. Response fields are reconstructed: recognized items/grams, historical monetary totals, public order code and false fiscal/fulfillment flags. No contact, address, internal order ID, checkout UUID, terms evidence, timestamp, provider token or raw error is included in `productReceipt`.
- The real client confirmation path validates that minimized contract, binds code/amount to the surrounding paid status, and reconstructs known product labels. Malformed details or ambiguous raw-snapshot-plus-receipt responses fail closed. The existing private/raw snapshot contract remains supported for internal tests, not serialized by this route.
- Every response uses private/no-store/CDN no-store headers. Status errors are sanitized; mismatched capability pairs return the same 404.

## Consistency and deadlines

The existing expiry/reconciliation RPC remains authoritative for observed payment state. After reading products, the service rechecks the bound order identity, capability, product namespace, currency and amount, then observes payment/order/reconciliation state again. A change fails closed. **This is not an atomic transaction, a lock spanning reads, or dispatch authorization**; a later concurrent event can still change the order. No SQL definition or financial coordinator was altered.

The database observations share a 5 s budget, with at most 2 s per operation. Promise racing bounds a transport that ignores abort, and the result is checked against the deadline again before acceptance. Abort is best-effort transport cancellation, not proof of rollback. There is no automatic retry. The 5 s budget covers this service only: bounded body reading and the existing rate limiter are outside it. The existing rate limiter has no own timeout and trusts proxy-derived IP headers; deployment-level proxy trust and rate-limiter deadline remain separate review items, not solved or certified here.

The minimized receipt is informational/non-fiscal and does not authorize production, packing or delivery. It is not an invoice and promises no delivery date. No new price is inferred; unsupported combos and extras remain blocked.

## Verification boundaries

The new HTTP tests execute the real route, real config gate, JSON reader, status service, private snapshot reader and client receipt parser in a VM, with an injected in-memory database double and rate-limit double. They use synthetic credentials only and reject unexpected external imports. They prove application contracts, not Supabase transport, actual proxy behavior or Culqi integration.

The predecessor produced 9 passes / 17 failures against the first 26 endpoint regression cases. An additional late-final-result deadline test was added afterward and is not claimed as part of that RED run. Baseline application tree was the tree of remote `e85c984d079b3f5f4bb62a76affbba4a00764d68` (local `e4952eb8f7bda447dd45dac4afaa077d0aede96e`).

Original local TypeScript attempt was SIGKILLed without a TypeScript diagnostic. It was not retried under unchanged conditions; independent cloud typecheck/build verification is required before claiming those checks passed for this version. The preceding SQL36 and browser8 results apply to the earlier application and are not evidence for this new endpoint version. Current logs and exact-version independent results will be recorded under `docs/qa/status-receipt-20261102/`.

Real payment sandbox/3DS/webhook acceptance, native PostgreSQL concurrency, production credentials, public activation, fiscal issuance and fulfillment authorization remain outside the verified boundary.
