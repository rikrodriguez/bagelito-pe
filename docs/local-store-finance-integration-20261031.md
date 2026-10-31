# Local recovery integration: simple storefront and financial checkout

This local branch starts at PR42 `b562e4ba00f13a3154ba73dad7154b150c6a80c7`
(which contains PR23/41) and integrates storefront PR40
`17f6732678550d415bf6eb59870fdc59d1be450d`. It is independent of the earlier
integration thread. It is not permission to publish, merge to main, deploy,
activate payments, or install any remote migration.

## Resulting contract

The simple storefront keeps the catalog photos, exact pack/flavor URL selection,
queued quantity bounds, totals, delivery and extra-pack calculation. It retains
the financial token/session protocol, affirmative versioned terms, preparation
ownership, deadlines, uncertain-payment locks and durable recovery. No 3D store
or additional real payment methods are introduced.

Changing a selection query does not remount the checkout owner. The flow applies
a new selection only after checking durable recovery and only without an active
preparation/payment/recovery. A disposed flow cannot continue a preparation or
consume a late charge result; recovery remains available to the next instance.
This does not claim that every full-page navigation preserves an unpaid hold.

### Closing intake and preserving private recovery

`BAGELITO_MERCHANT_REVIEW_ONLY=true` disables public payment presentation and
rejects the new-reservation Culqi endpoint before creation. It does not disable
the private financial configuration shared by status/webhook and previously
authorized token sessions. Those endpoints retain all mode, origin, ownership,
evidence and transactional guards from PR42. The existing
`supabase/operations/close-culqi-intake.sql` contract remains the operational
reference; this branch does not execute that script or change flags remotely.

The manual reservation route still parses the request and enforces its public
security/rate limits. In review mode it calls a separate read-only helper:

- Frozen v1 normalization and full UUID/owner/request/proof identity are required.
- Only `read_manual_reservation_v1` is invoked. There is no new prepare, upload,
  finalize, order insert or proof cleanup from this path.
- Matching completed operations return their original result, independent of
  today's catalog. Matching awaiting operations return pending202 and do not
  advance or promise that their quote/catalog is still valid. An unknown
  operation fails closed503; conflicting content/owner/proof
  fails409 without exposing another order.
- Missing/denied RPCs fail503. Uncertain reads preserve the same identity; at
  most two reads are attempted. This is a retry-count bound, not a per-request
  transport deadline. Best-effort observation cannot change the business result.

New/pending creation outside review mode retains the entire existing validation
and transaction service. The frozen v1 normalization and financial SQL are not
rewritten. No public UUID-only lookup or commercial deduplication is introduced.

## Conflict resolution boundaries

The original merge had 14 files and 28 conflict blocks: package manifest, Culqi
reservation route, global CSS, ReservationFlow, five storefront CTA components,
CulqiCheckoutButton, payment config, TypeScript test loader, merchant catalog
tests and Vercel config. The loader preserves both storefront `loadTs` and
financial `sourceModule` interfaces. The manifest retains Node/SQL runners and
adds the storefront/browser runners while preserving financial dependency pins.
The image config combines quality75 with financial build-identity logic.

Global Vercel git autodeploy remains false. No remote CI job is reattempted while
the documented billing block remains unresolved.

## Local verification

Use Node24. The manifest and lockfile must agree; the local dependency install
uses `npm ci --ignore-scripts --no-audit --no-fund`.

```sh
npm test
npm run lint
npm run build
npx --no-install tsc --noEmit --incremental false
PG_BIN=/path/to/local/postgresql/17/bin bash tests/run-sql-tests.sh --core-only
PG_BIN=/path/to/local/postgresql/17/bin bash tests/run-sql-tests.sh
```

The SQL runner creates its own disposable local cluster, verifies process/data
directory ownership, and never uses a configured remote database. Both profiles
can run in the pinned local PostgreSQL17 image with `--network none` and a
read-only fixture mount. Keep the manual operation ACL/RLS, replay, rollback and
last-slot concurrency tests, plus all existing financial assertions.

Browser checks run against a local production build only. Use explicitly
synthetic test-key strings and a loopback sandbox URL, without Supabase/provider
credentials. Run the storefront journeys with review=true, then the financial
journeys with review=false. The latter intercept API writes and SDK content
synthetically, validate real request schemas/pricing, block external requests and
assert exact reservation/session/charge counts across URL changes and reload.

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium BAGELITO_TEST_URL=http://127.0.0.1:3107 npm run test:checkout-browser
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium BAGELITO_TEST_URL=http://127.0.0.1:3107 npm run test:checkout-financial-browser
npm run test:browser-network-guard
```

For a reproducible local build/server, the following function supplies only
synthetic values and explicitly empties database credentials. No real provider
or database credential is needed. Build once; start/stop the owned loopback
server between the two runtime review modes:

```sh
synthetic_checkout() {
  env NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3107 \
    PAYMENT_PROVIDER=culqi CULQI_MODE=sandbox CULQI_ENABLED=true \
    CULQI_SECRET_KEY=sk_test_synthetic NEXT_PUBLIC_CULQI_PUBLIC_KEY=pk_test_synthetic \
    NEXT_PUBLIC_CULQI_RSA_ID=synthetic NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY=synthetic \
    VERCEL_ENV=preview NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= \
    NEXT_PUBLIC_SUPABASE_ANON_KEY= "$@"
}
synthetic_checkout env BAGELITO_MERCHANT_REVIEW_ONLY=true npm run build
synthetic_checkout env BAGELITO_MERCHANT_REVIEW_ONLY=true npm run start -- --hostname 127.0.0.1 --port 3107
# After stopping that owned server, use false for the financial browser tests:
synthetic_checkout env BAGELITO_MERCHANT_REVIEW_ONLY=false npm run start -- --hostname 127.0.0.1 --port 3107
```

Do not run these browser probes against a public or deployed server. They are
not real-card, Yape, provider webhook, or 3DS certification.

## Compatibility and remaining rollout gates

PR23's notes document the already installed financial core. Do not reinstall
historical migrations just because this branch contains them. Legal evidence is
documented in QA and remains subject to its UI cutover; no legal version/text is
invented by this integration. PR42 proposes the three manual v1 read/prepare/
finalize RPCs; clients need a stable operation UUID. Those RPCs must be reviewed
and available before an independently authorized rollout of that route.

No remote schema, actual provider state, credentials or production incident was
inspected or inferred. QA-only GET/status-recovery proposals do not become live
requirements through a code integration. Publishing this local branch remains
blocked pending explicit reconciliation with the main thread.
