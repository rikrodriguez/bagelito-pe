# Reject observed terminal payment retries — 3 November 2026

**Partial HTTP admission protection only. The financial race is not resolved.**
This draft-only change starts from PR47 HEAD
`ab0565e4a8209d04b0a241f9203e6249c718da9e`. No payment gate is enabled,
no schema is installed, and no provider request, charge or external database
write is performed.

## Reproduced HTTP defect and correction

Both token preparation and charge routes previously proceeded when their order
read already returned `payment_status: failed`. The same happened for expired,
refunded, unknown, null or absent status. The new route tests use the actual
handlers with in-memory dependencies. Before the fix, 12 new rejection cases
failed because the route returned HTTP 200 instead of 409 (`before.log`). This
is evidence of incorrect admission, not a real provider charge or database
transition.

The routes now require `pending` before preparing or coordinating a payment.
They fail closed for all other states, without invoking the preparation RPC,
charge coordinator or provider. Existing already-paid handling is preserved:
the charge route returns its existing paid observation, and the order route
rejects preparing another session. Existing pending, 3DS and environment gates
remain unchanged. There is no automatic retry or new checkout flow.

## Verification

- Focused route suite: **26/26 PASS**, including 14 added cases (`focused.log`).
- Independent read-only review: **26/26 PASS**, subprocess exit 0, and no blocking
  regression found in this HTTP-only diff. Source/test whitespace checks passed.
- Complete Node suite: **352/352 PASS**, zero failures, cancellations or skips,
  subprocess exit 0 (`node-full.log`). The focused 26 cases are included, not
  added again. Node ran serially with a 384 MiB old-space heap limit and the
  already-approved local HDR fixture.
- Build and TypeScript: **PASS**, subprocess exit 0 (`build.log`), using a
  512 MiB old-space heap limit. Structural QA 11/11, manual fallback 4/4 and
  movement 14/14 passed; repeated subsets are not added to the Node total.
- Installed dependencies were reused without package or lockfile changes.

Commands and subprocess outcomes are recorded in `node-full-result.json` and
`build-result.json`. No environment/payment configuration was supplied. This
Raw logs retain their original whitespace. This patch does not add CI workflows;
no remote CI success is inferred from a local
pass or an absence of runs/checks.

The before/after cases mock the database and provider. They do not prove SQL
locking, financial settlement, browser behavior or real Culqi acceptance.

## Unresolved financial and capacity risks

1. A verified failed event can arrive after the HTTP order read and before the
   core claim RPC. The current SQL claim does not enforce the same pending-only
   state gate atomically. This HTTP guard does **not** close that race.
2. Inspection of the existing SQL indicates that another claim after a failed
   event can reach the provider, while confirmation requires pending order and
   attempt state. That end-to-end transition still requires executable SQL and
   concurrent-event evidence. Do not label it fixed by these route tests.
3. The browser's failed-state recovery suggests a fresh checkout, but failed,
   non-expired reservations still hold batch capacity. A last-slot retry can
   remain blocked until expiry. Simply excluding failed reservations from the
   capacity calculation would be unsafe when a late paid event arrives.

The local PGlite audit was killed before fixture initialization (exit 137), so
it produced no SQL scenario PASS. A smaller WASM memory experiment could not
initialize the module either. These failures are not counted as successful
tests. A separate task was opened in a saved cloud environment for isolated
PGlite investigation; its pending results are not evidence for this patch. The prior
native PostgreSQL/socket permission denial was not bypassed.

No SQL wrapper or migration is added. An atomic claim gate, defined
failure/reconciliation transitions and last-slot capacity recovery remain open.
Those changes need SQL and concurrency tests before approval. Store operation,
real sandbox acceptance and production readiness remain unconfirmed.

## Unchanged scope

Only two HTTP handlers and their route tests change, plus this evidence.
Coordinator, provider, webhook, SQL, catalog/prices, UI, SDK scripts, deployment
configuration and all enablement gates remain unchanged. No commercial prices
are invented, and no merge, deployment, external data mutation or charge occurs.
