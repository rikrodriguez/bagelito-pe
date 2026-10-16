# Isolated operator runbook verification

This fixture exercises the existing monthly batch runbook through compiled Next.js Server Actions and HTTP routes backed by a disposable PostgreSQL 17.11 database. It has no hosted database, customer records, provider calls, GPS, SMS, messaging integration or deployment step.

The operator branch starts at `80233bcb4624eedb0e9e428bc6f358ef11b23300` and targets the existing work branch in a separate draft PR. Its own automatic Vercel deployment is disabled. No merge or deployment is requested.

Two reproduced defects are corrected:

- Delivery ops and the delivery/driver CSVs now use the current batch, consistently with Production CSV. A previous unarchived batch stays available in the full backup and individual tracking, without entering the current delivery run.
- Saving an explicit zero ingredient or packaging cost preserves zero. Previously the action replaced zero with the default through a truthiness fallback, while the finance reader already treated zero as valid.

The three targeted regression tests failed before the fixes and pass afterward.

## Scenario

All fixture order codes start with `BAG-OPS-`; all contacts and addresses are synthetic. There are two batches and six orders: two paid current orders, one current pending order, one expired pending order, one cancelled order and one paid previous-batch order. No payment is submitted: financial states are seeded only inside the disposable database.

The current paid orders are a 12 mixed pack in Lince (S/123) and a 6 single pack in Miraflores (S/66), with 18 bagels total and S/189 collected. The production flavor total must be 18 at every stage. Costs are ingredient S/2 per bagel, packaging S/3 per order/pack, actual delivery S/20 and other costs S/5: net profit must remain S/122 across fulfillment states. The active pending order occupies capacity but does not enter production or confirmed sales; expired/cancelled orders do not occupy capacity. Reserved capacity stays 3/6 orders and 24/60 bagels across the paid-order fulfillment transitions.

The fixture:

1. Checks authentication before exports and administrative mutation.
2. Saves positive costs, explicit zero costs, then restores the positive scenario.
3. Opens/closes the current batch using native forms and validates intake state.
4. Reads full backup, production, delivery and driver CSV routes. The full backup spans batches; operational exports exclude unrelated, pending, expired and cancelled orders. Driver quoting and front-desk handoff are checked.
5. Renders native admin delivery and checks that it agrees with current-batch exports.
6. Advances paid orders through baking, packing, delivery and received, using native administrative actions. An unpaid Culqi order is rejected.
7. Reads the independent tracking API after each stage and checks the public response excludes contacts, address, internal IDs and provider charge identifiers.
8. Verifies all stages retain capacity and financial totals, both orders are received, and repeating an unchanged status creates no duplicate history.
9. Closes the batch as delivered and checks driver received marks and tracking not-found behavior.

## Reproduction

With locked Node dependencies, Node24 and Docker available:

```
npm ci
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
docker pull --platform linux/amd64 postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df
node tests/operator-flow-http.mjs
```

The runner reuses the established native HTTP/isolated PostgreSQL test pattern. PostgreSQL has no network, no published port, a read-only container filesystem and an ephemeral data directory. Node talks to it through Docker exec and a local PostgREST transport adapter. The adapter restricts tables, projections, filters and writes and executes application operations under `service_role`; migration/fixture setup is local owner work. Real application authentication, forms, Next handlers, query/financial modules and SQL constraints/triggers remain active.

The Next child receives only an explicit environment of generated fixture credentials and loopback endpoints. Its fetch transport rejects every external origin; no environment file, hosted session or key is imported or exported. The synthetic HMAC admin cookie exists only in process memory. All temporary processes, files and the uniquely named container are removed in `finally`.

Limits: the adapter is not a live Supabase/PostgREST server, and these fixtures do not validate a deployed service, real courier handoff, provider payment, bank, communications delivery or production permissions. They validate the integrated application/runbook contracts with isolated SQL. CI checks the exact requested commit, has read-only GitHub permissions, and contains no app credentials or deploy step.
