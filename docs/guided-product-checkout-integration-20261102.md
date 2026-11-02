# Complete-product checkout bridge — draft, closed by default

This candidate connects the existing product persistence adapter to the actual
quote/session routes and provides a separate `/sandbox-checkout` entry. It does
**not** enable a deployment, change credentials, install SQL, change a price,
authorize production, or establish a real purchase. `/` and `/playable` still use
the unchanged `ReferenceStorefront` with `reviewOnly` explicitly set.

## What now connects

1. A server-only GET function returns a single availability boolean for the
   sandbox entry. Disabled entry renders a closed notice, without mounting the
   commerce journey or Culqi. The page is noindex and private/no-store.
   The entry explicitly opts into sandbox presentation: cashier and Culqi buttons
   identify a test, and commercial WhatsApp links/contact blocks are neither
   constructed nor rendered. Other entries retain their default presentation.
2. The quote route derives complete-product capability from the private request
   gate, never browser JSON. It recognizes regular large packs of 6/12, optional
   120 g pot, and standalone 120/180/240 g pots using existing canonical prices.
   A quote is a read-only capacity projection, not a reservation/stock guarantee.
3. The session route selects the new service only under that same gate. The
   service rechecks it, validates UUID v4, customer fields and current explicit
   legal acceptance before remote side effects, and enforces the existing limiter.
4. The service reads any prior session first and keeps its original batch ID.
   New reservations select the current batch. The existing additive JSONB RPC
   independently validates policy, exact products/money, legal evidence, replay,
   expiry and batch capacity while storing the entire order atomically. No
   `.single()` is applied to that JSONB RPC. No legacy fallback exists on failure.
5. The public response contains only the browser reservation contract and totals;
   no internal order ID, private product snapshot or new customer details escape.
   Existing token preparation, charge coordination and gated historical receipt
   can consume this reservation. Both token and charge routes now also inspect
   the persisted product namespace before starting payment work.

The current two-bagel combo, extras, minis and premium selections remain blocked.
No historical combo price, unit-price multiplication or new promotion is inferred.
Pot flavor/size stock remains unimplemented: batch capacity is not pot inventory.
This sandbox bridge does not certify commercial availability or fulfillment.

## Independent gates and environment separation

`BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED` defaults to false in `.env.example`.
The new lane additionally requires coherent **sandbox** configuration with all
existing intake gates, non-production environment, no active reference-review
guard, exact configured request origin, explicit matching Origin on write requests
and absent/same-origin Fetch Metadata. Live is deliberately unsupported.

The SQL owner-only policy still defaults to disabled and cannot be flipped by the
service role. An application flag is not evidence that the migration/policy is
installed or authorized. Receipt disclosure keeps its separate default-off flag.
No actual environment variable was changed by this implementation.

At token preparation and charge, `guided-v1:` reservations require the new sandbox
gate again. Unknown guided versions/compositions fail closed. Thus a copied/shared
database cannot silently send these draft orders through the live payment lane.
Legacy order behavior retains its existing payment guards. Status/reconciliation
remain separate; closing intake does not disable observation of existing payments.

## Replay and failures

New-capability UUIDs must be v4, compatible with the existing minimized receipt.
The complete commercial/customer replay is checked in SQL, not by a bagel-only
projection. A valid reservation may replay after its last slot fills capacity or
after the current batch rotates; its original order code and expiry are returned.
Changed same-price products, changed customer/delivery and incompatible legacy
sessions do not silently reuse the reservation.

Database observations and the write share a **monotonic 5 s budget**, with at most
2 s per operation, separate from the limiter/body budgets. Abort is best effort,
not rollback. A failed/lost response can follow a committed reservation. There is
no automatic retry, no regenerated client capability and no permission to start a
payment after an unconfirmed reservation. Preserve the same session for recovery.

## Validation status before independent verification

- Local complete Node suite: **311/311 PASS**, including 14 new session-service
  cases and 12 config/token/charge cases. Transport/provider boundaries use doubles.
- New route-to-SQL test code exercises the actual quote/session handlers, new
  service and existing RPC in an owned in-memory PGlite. Local execution was
  **blocked by SIGKILL before any case completed**. A second materially different
  attempt (single-process isolation, smaller heap) also exited 137. No native
  socket workaround, real database or migration was attempted.
- Vite generated client/SSR/Nitro bundles, but the local aggregate build exited
  137 afterward. No full build/typecheck PASS is claimed from that partial run.
- A local server reported listening; a probe from a separate execution context
  could not connect. That is not a successful HTTP smoke test. The server was
  explicitly stopped. Exact-candidate verification must use a single owned
  execution context or the isolated coding environment.

Final independent verification/evidence must be recorded before moving PR47.
The candidate is implementation for review, not a launched store or completed
Culqi/3DS/Yape/webhook acceptance. Real isolated credentials/schema verification,
stock, outstanding commercial prices and explicit release approval remain open.
