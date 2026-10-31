# Manual reservation operations v1 — proposed, not deployed

This change is stacked on PR41 (`9b7ba2049341a20ba52b7600145c908431663d8e`).
It changes only the manual `/api/reservations` protocol. The current UI uses the
Culqi route and is unchanged. No SQL in this change has been installed remotely.

## Identity and compatibility

A caller must generate a cryptographically random UUID v4 `operationId` for each
deliberate new purchase, and preserve it and the exact form/proof across retries.
The server rejects missing or invalid IDs before external I/O. It never creates
a new identity to disguise a failed retry. A different key is a different
operation even when all fields and the bank reference are identical. There is no
new policy that groups purchases by contact, contents or bank transfer reference.

The server binds the key to SHA-256 hashes of the declared contact and normalized
request v1, including the proof bytes, canonical MIME type and size. The frozen
`manual-request-v1.ts` contract parses structure without reading the current
catalog. Fields retain the published v1 trimming, defaults and coercion; email is
lowercased, phone country codes are not reinterpreted, item order is preserved,
and proof filename is ignored. Field order and the `{version:1,...}` hash envelope
are explicit. Golden vectors from the initial PR42 commit verify compatibility.
`image/jpg` is canonicalized to `image/jpeg` both for identity and the uploaded
Blob. An exact replay requires the full validated form and the original proof.

The owner comparison binds declared email/WhatsApp, not an authenticated identity.
The random key is a bearer capability combined with matching contents/proof;
there is no UUID-only lookup endpoint. Do not put it in URLs or analytics.
Different owner, request or proof for a reused key returns HTTP409 without
revealing the original order or quote.

Old manual clients that omit `operationId` now receive HTTP400. This is an
intentional fail-closed compatibility break. There is no active manual UI to
migrate in this candidate. Existing Culqi callers and contracts are unaffected.

## Database protocol

`supabase/add-manual-reservation-idempotency-v1.sql` is a proposed forward
migration. It adds a private RLS table and three versioned RPCs. They are executable
only by the already trusted service role; callers have no direct table access.
It does not replace existing financial, Culqi or legal functions/triggers.

1. `read_manual_reservation_v1` is a private, bound-identity read before current
   catalog validation. It requires UUID, contact/request hashes and proof
   hash/MIME/size; a UUID alone cannot retrieve an order. It serializes with
   prepare/finalize, returns zero rows for an unknown valid identity and never
   creates or updates an operation. A matching completed operation returns its
   original order even if the pack/flavor was removed or its units changed.
   Missing RPC or unconfirmed reads fail closed; there is no public UUID lookup.
2. For an unknown or pending operation, the service applies the full current
   reservation schema, catalog, pack quantities, delivery and affirmative consent
   rules before preparation or upload. `prepare_manual_reservation_v1` then
   serializes the operation UUID and either
   creates its pending record or checks the existing identity. It allocates one
   order code, batch reference and immutable proof path. Pending operations do
   not reserve capacity and are not orders.
  New closed/full/outside-window batches are rejected before allocation or
  upload. Code allocation skips occupied historical codes in a bounded loop;
  exhaustion fails closed without binding a new operation.
3. Upload uses that stable path and `upsert:false`. Concurrent replays cannot
   overwrite the object. If upload fails or its response is lost, the server
   downloads the object and verifies its SHA-256, MIME and length. Only a matching
   object permits finalization. An unavailable or mismatched download leaves the
   same operation pending; it does not create another path or remove evidence.
4. `finalize_manual_reservation_v1` locks the operation and returns a completed
   order first. Otherwise it invokes the existing atomic manual reservation RPC
   and links the resulting order in the same DB transaction. Batch locking,
   capacity checks, window checks, items and history remain atomic. Failed SQL
   leaves no partial order/items/history or completed operation.

The pending operation stores the initial server-derived quote and terms version.
It is not a price hold: pending replays whose current server snapshot differs
return `manual_reservation_quote_changed` (409), preserving the original record
for review. They are not rebound to a new batch or silently repriced. Completed
replays recover the original order before consulting the current catalog, quote,
capacity or window. Changing the submitted original contents to match a new
catalog is a conflict, not a way to rewrite the completed purchase. No new
consent text, legal version or terms acceptance policy is set.

Operations retain their order reference; deleting a referenced order or batch
is restricted. Do not prune identity records and then allow their UUIDs to be
reused. No automatic expiry, cancellation, grouping or retention policy is added.
Normal callers of the shared sequence do not reuse an allocated code. A writer
that later inserts an arbitrary reserved code outside this protocol can still
cause a uniqueness rejection and require reconciliation. This change does not
alter other writers or claim to deduplicate purchases made through legacy
unkeyed producers.

## HTTP outcomes and uncertain results

| Outcome | HTTP | Body |
| --- | --- | --- |
| First completion or recovered/replayed completion | 200 | `ok:true, operationId, orderCode` |
| Result cannot be confirmed | 202 | `ok:false, code:manual_reservation_pending, state:pending, operationId, error` |
| Key bound to other owner/content/proof | 409 | `ok:false, code:operation_conflict, operationId, error` |
| Pending quote/terms changed | 409 | `ok:false, code:manual_reservation_quote_changed, operationId, error` |
| New RPC absent or execution denied | 503 | `ok:false, code:manual_reservation_unavailable, operationId, error` |
| Validation, definite SQL rejection, rate limit | 400 / 429 | Error; retain the caller's operation ID |

Responses use `Cache-Control:no-store`. HTTP202 is an explicit unknown outcome,
not proof that no order exists. The caller must retain the same operation and
form; it must not generate a new UUID, submit another payment or infer rollback.

Unknown initial reads allow one bounded read retry. Unknown prepare results
allow one bounded replay of the keyed prepare RPC. Unknown finalization results
allow one private read reconciliation. A committed order
is returned with its original identity; an unconfirmed/in-flight result remains
202 and can be retried safely with the same operation. A failed/negative lookup
is never taken as proof that a delayed transaction cannot commit.

## Evidence, cleanup, retries and logs

No operation-bound proof is deleted by this request flow, including definite SQL
rejection, quote conflict, lost response or an exception from a potential cleanup
adapter. This preserves evidence referenced by committed or in-flight orders.
Uploads with lost responses use the same path and content verification on retry.

Pending proofs/operations may remain when an order is not created. A future
explicit reconciliation/retention workflow must check operation and order state
before deletion. No unreviewed automatic cleanup or retention period is invented
here. This tradeoff consumes storage rather than risking deletion of evidence.

Rate limits remain unchanged: requester 6/10 minutes, contact 4/12 hours. Every
HTTP retry consumes quota before the service, so recovery can be delayed by a
429. Each allowed submission adds one private read before any preparation; a
completed replay needs no prepare, upload or finalize. SDK POST/storage operations
are not blindly retried. Recovery calls are bounded and keyed; there is no polling
loop or new external provider call.

Backend logs include operation ID, stage, outcome (`unknown`, `rejected` or
`recovered`) and error code; route logs correlate the same ID with request ID.
They do not log the form, proof bytes, contact values or recovery key in analytics.
Manual observability is best effort: its local boundary contains synchronous
throws and rejected promises and does not await observers. Broken or permanently
pending analytics/loggers cannot change a confirmed200 or a domain202/409/503/400,
including errors inside the catch path. Observer failures are not recursively
logged through the same failing dependency. Global monitoring and Culqi are not
changed. The shared rate-limit guard accepts an internal optional observer used
only by this manual route, so a missing-rate-RPC warning cannot replace its503
domain error. Other callers retain their existing default behavior; no limits or
security decisions are wrapped or relaxed. Telemetry may be dropped after a
response; it is not a delivery guarantee.
`Reservation Created` analytics are skipped on replay to avoid counting a replay
as another purchase. Lost-response recovery can omit that event; this change does
not claim exactly-once analytics or introduce an outbox.

## Installation and release boundary

The new service requires all three RPCs and the operation table, including the
private read added during review. The initial two-RPC proposal alone is not
sufficient. An absent migration fails before proof upload, with no legacy
fallback. Review and test
the forward migration against the exact installed core before any future
installation; do not rerun the broad original foundation scripts.

No remote migration, merge or deployment is authorized by this PR. A future
coordinated rollout must install the reviewed migration before exposing the new
manual contract to compatible clients. Keep the operation table/RPCs during any
application rollback that must recover in-flight operations; rolling back to an
unkeyed manual client would lose retry protection. Existing historical orders are
not inferred into operations or deduplicated.

Autodeploy remains disabled in `vercel.json`. GitHub workflow allowlists are not
broadened and billing-blocked jobs are not retried.

## Future normalization versions

Existing operations in this proposal use the published v1 fingerprint. Preserve
the v1 parser, field serialization, proof conventions, limits and dependencies'
normalization behavior when adding new purchase rules or a later contract. The
frozen v1 district/method/handoff values are not taken from mutable configuration.
Current purchase validation can restrict new/pending requests further, but cannot
be used to reinterpret the contents of a completed v1 operation.

A later normalization version must have an explicit dispatch/storage contract and
retain a v1 recovery path for existing operations. Do not replace v1 in place,
recompute persisted hashes, guess versions from UUIDs, or fall back to UUID-only
lookup. Golden vectors constrain compatibility but do not implement arbitrary
future versions. Retired v1 inputs can recover completed orders; they do not gain
permission to create/finalize a purchase no longer allowed by current rules.

## Local verification

```sh
node --test tests/reservation-rpc-atomicity.test.mjs tests/manual-reservation-idempotency.test.mjs tests/manual-reservation-recovery-catalog.test.mjs tests/manual-reservation-observation.test.mjs tests/reservation-batch-capacity.test.mjs
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 CULQI_ENABLED=false npm run build
npx --no-install tsc --noEmit --incremental false
# Existing PostgreSQL 17 isolated runner, both profiles:
PG_BIN=/path/to/postgresql/17/bin bash tests/run-sql-tests.sh --core-only
PG_BIN=/path/to/postgresql/17/bin bash tests/run-sql-tests.sh
```

Node fixtures execute the real route/service/schema/catalog/pricing and installed
SDK, replacing only external I/O. SQL fixtures exercise the original transaction
and the new operation functions in PostgreSQL with separate concurrent sessions.
They do not contact providers, real Storage, production or a remote DB. Results
do not establish the current production schema or prove any production incident.
