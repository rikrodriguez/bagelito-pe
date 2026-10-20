# Culqi webhook: bounded lookup and confirmation checkpoint

**Evidence update, 20 October 2026:** the upstream 400 below remains a historical attribution whose original runtime result has not been recovered. The complete provider API list supplied by the owner shows 201 / 201 / 200, while webhook history shows 500. See [current provenance and limits](culqi-webhook-evidence-recovery.md); the offline timeout fixes remain independently reproduced.

This purchase/confirmation change starts at `8015614875aa8bce787f849b8d0cce9ed018795e`, preserving the completed campaign/operator/integrated work. Its draft branch `fix/culqi-webhook-event-deadline-20261016` has automatic deployment disabled. No deployment, live activation or new provider transaction is part of this review.

## Observed failure and proven correction

The existing saved sandbox evidence contains three webhook handler executions at 16 October 2026 03:50:11.104/12.485/13.865 UTC. Each stopped at event_lookup with upstream HTTP 400/parameter_error, local HTTP 500, eventVerified=false and transactionAttempted=false. Those logs deliberately omit IDs and cannot establish which event/cargo/account caused them. The contemporaneous paid order was confirmed through authenticated charge GET, with no persisted webhook event at the recorded observation. These remain historical observations; no new provider/panel/database query is claimed here.

The current event client already sends explicit GET to `/v2/events/{encoded-id}`, Bearer authentication, JSON Accept/Content-Type, APIversion 2 and provider environment test. The original 400 does not prove a missing header, a bad key, a URL/slash defect, an invalid ID or an account mismatch. No speculative change is made to those contracts or to identity/SQL verification.

A separate reproducible purchase-confirmation defect was found: the event GET and its JSON body had no owned deadline. A transport that never completes either phase leaves the handler pending. Three new tests fail before the fix: stalled headers, a stalled JSON body after six seconds of headers, and cancellation lifecycle on a completed lookup.

`fetchCulqiEvent` now has one 10-second budget for headers and JSON together. Its owned AbortController is aborted on expiry; Promise.race also bounds transports that ignore cancellation. The timer clears after every completion/failure. Timeout becomes the existing bounded timeout diagnostic and retryable HTTP 500 before identity verification or database access. A late response cannot resume settlement. This is an application time budget, not a documented Culqi requirement, and it does not fix or explain the observed 400. Charge POST and all financial RPCs remain unchanged.

## Official sources and remaining contract uncertainty

Reviewed public documentation and immutable official SDK sources:

- [Webhook guide](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/): server notifications, event categories and CulqiPanel > Eventos > Webhooks.
- [Official Python resource](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/culqi/resources/base.py): read constructs the event resource URL and GET. [Event resource](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/culqi/resources/event.py) inherits that read path.
- [Python client](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/culqi/client.py) and [constants](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/culqi/utils/constants.py): Bearer/JSON, version 2, test/live headers. SDK client/version/User-Agent metadata also exists; its necessity for this account's rejected event is not documented by these sources and is not invented or impersonated.
- [Official Python tests](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/tests/test_event.py) assert `/v2/events/{id}` without a required trailing slash, but the actual individual retrieval test is commented out. [PHP client](https://github.com/culqi/culqi-php/blob/2c7fbd7a984142a3febec2664c4005f1364d5087/lib/Culqi/Client.php) supplies the same relevant headers. These code snapshots do not prove current remote acceptance.

The public API reference is a client-rendered shell through the available web reader; one ordinary direct read failed at transport. No alternate account, proxy/protection bypass or authenticated API call was used to obtain missing details. The legitimate event ID, its merchant/test binding, existing delivery history and the rejected parameter/contract explanation are still needed from normal authorized account evidence.

## Local verification

```bash
npm ci
node --test tests/payments/culqi-event-lookup.test.mjs tests/payments/culqi-webhook.test.mjs
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
docker pull --platform linux/amd64 postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df
node tests/culqi-status-recovery-http.mjs
```

The existing native Next/isolated PostgreSQL fixture now covers status and webhook in the same unmodified compiled app. Only transport capabilities are replaced. It uses synthetic IDs/keys/contacts, no hosted connection, no published database port and a networkless pinned container. Unknown transports fail instead of falling back to real fetch. The application still executes the real event client, identity/resource parser, handler, permissions and SQL transaction.

The new native scenarios seed 12300/PEN, 12 units and Yape-token bindings, then:

1. Confirm through the real local status-GET recovery and retain its receipt/history, analogous only to the recorded money/lane/provenance.
2. Return a synthetic400/parameter_error, mismatched event identity or stalled transport. Native HTTP 500 must leave settlement, receipts, history, events and capacity unchanged, with no application DB operation.
3. Return a correctly identified but wrong-money event. The real SQL function must roll back its marker and preserve settlement.
4. Supply a correctly verified synthetic event to an already-paid order: exactly one processed marker, no second confirmation/history or capacity change. Repeat the same event idempotently.
5. Confirm a fresh pending synthetic order through the actual webhook transaction with one attempt and one webhook history transition.
6. Reject Production, missing public key and live secret in sandbox before either provider transport or database operation.

These fixtures establish application behavior only. They are not receipt of a real webhook, provider certification or permission to replace an unverified event with caller claims. The deadlines tests also verify a response arriving after timeout cannot call SQL. The existing charge contract tests ensure the event-only budget does not modify charge requests.

Integrated exact-head CI runs the full Node/lint/build, native HTTP/restore/operator checks and core-only/full SQL profiles. No app secret, permission change or deployment step is added.

## Minimum conditions to finish

1. Resolve the concrete external blocker using an existing event: normal authorized CulqiPanel > Eventos/Webhooks for the same sandbox merchant, correlated to the already-paid charge/time. Read ID/type, exact target URL and delivery timestamps/statuses, merchant/test access and the parameter rejected by GET. Do not save settings, resend, create a charge or export credentials. If the panel remains blank, this step remains blocked; contacting support is not authorized by this change.
2. After a separately approved Preview deployment of the reviewed SHA, certify one legitimate existing event delivery to the canonical `/api/webhooks/culqi`: authenticated identity, stage=transaction, eventVerified=true, transactionAttempted=true, HTTP 200, applied/duplicate and a matching unique processed marker. A duplicate requires evidence of its earlier valid application. Any resend is a separate write-capable action requiring approval; the current task does not execute it. Preserve the existing paid receipt/history and capacity.
3. Before release, close the already-documented target configuration/schema/backup/compatible-rollback gates and any still-offered card/3DS/rejection/expiry certification. See [release gates](culqi-validation-and-release-gates.md) and [core/rollback review](culqi-core-migrations-and-compatible-rollback.md). Synthetic success and a paid charge GET cannot certify those gates or enable live.
