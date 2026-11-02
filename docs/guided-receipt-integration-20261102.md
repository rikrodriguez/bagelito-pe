# Validated reservation → payment detail → UI — 2026-11-02

**Draft code, review-only storefront. No new public route, live database/migration, SDK/provider request, credentials, charges, price changes or deployment.**

> Historical report for application `d0997a54`. The subsequent default-closed sandbox status integration is documented in [Gated status receipt](guided-status-receipt-20261102.md); the older endpoint boundary below describes the earlier version.

## Concrete defects corrected

The previous receipt used the editable current cart after `onPaid(orderCode, amount)`. Recovering an older payment could therefore display a different selection under that older order code. Pending reservation/status/device callbacks could also continue after leaving the payment view or changing the order/customer.

- `paid-order-receipt.ts` now binds payment observations to the expected order code and, when known, the reserved amount. It requires affirmative transport/application success, a recognized state, an eligible paid order status and no reconciliation flag. Failed/expired observations are also identity-bound before clearing a recovery reference.
- Supplied product snapshots must pass the existing V1 parser and match order, paid state and total. Missing products remain explicitly **unavailable**, never reconstructed from the current cart. Historical amounts, quantities and pot grams are preserved.
- `GuidedCommerce` stores that receipt evidence separately and renders `PaidOrderReceiptDetails`. Only the explicitly labeled, non-payment QA preview retains cart-derived example lines. The real detail is non-fiscal and never authorizes preparation or dispatch.
- `CulqiBrowserCheckout` guards asynchronous work by an operation generation tied to order, customer/consent and configuration. Unmount or changed context prevents late widget opening, token continuation, polling and `onPaid`. Equal-content re-renders remain valid. Recovery uses a synchronous in-flight guard; clearing recovery is conditional on matching its original reference.
- Reservation/preparation responses must agree on checkout UUID, valid order code, positive integer minor-unit amount, payment-attempt UUID and the same future expiry. A mismatched or extended expiry cannot open the widget.

Invalidation does **not** cancel or roll back a server transaction or a provider request already submitted. Pending payment recovery is deliberately retained; an abandoned UI cannot declare a charge failed or make a second charge safe.

## Isolated integration boundary

`readGuidedPaidOrderReceipt` is a **private, injected reader**, not an HTTP endpoint. Its caller must first authenticate/authorize the order and obtain trusted payment/order/reconciliation state. It validates that state before reading, then requires the complete stored snapshot and matching money. It performs one read RPC, no reservation/charge/repricing, and returns the same UI contract used above.

No route imports this bridge, and no browser module imports a server/service-role reader. The current legacy status endpoint has **not** been extended to expose product snapshots. Consequently a legitimate legacy payment response without snapshot can show its verified code/total with an explicit missing-detail notice, but cannot claim a complete product receipt. Public route authorization/cutover and complete snapshot delivery remain a separate reviewed integration step.

`fulfillmentAuthorized` and `isFiscalReceipt` are always false. Snapshot `createdAt` is not presented as payment time, no delivery date is promised, and no stock/margin or new combo price is inferred.

## Verification scope

The added lifecycle harness executes the actual TSX with simulated hooks, deferred requests and React's real JSX runtime. It uses fabricated windows, storage, SDK objects and fetch callbacks. Contract tests exercise the actual parser/private reader, and React server rendering checks the actual detail component. These are **not** a browser, React concurrent-render, bank3DS, processor, or screenshot-fidelity certification.

Two additional PGlite scenarios connect the actual stored reservation/financial coordinator to the new private UI receipt reader using only fabricated charge observations. They require the separate functional in-memory environment; the original executor's previous SIGKILL and native socket limits are not retried here. Exact results are recorded separately under `docs/qa/receipt-integration-20261102/`.

Subsequent verification of this unchanged application passed **36/36 serialized in-memory SQL cases**, including both new bridge cases, plus a separate **8/8 actual Chrome/ReactDOM component fixture** with permanently intercepted fetches and inert SDK objects. The historical receipt was visibly inspected; the fixture is not the production storefront or a real payment flow. These results remain separate from the **228/228 Node tests and full build**. [Evidence, hashes and remaining boundaries](qa/receipt-integration-20261102/README.md). Native database concurrency and real Culqi/3DS/webhook acceptance remain unverified; no public snapshot endpoint or payment cutover was enabled.
