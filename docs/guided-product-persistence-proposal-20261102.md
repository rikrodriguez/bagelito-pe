# Proposed complete-product persistence — 2026-11-02

**Draft code only. Not installed, not connected to the public checkout, not enabled for charges.** The storefront remains review-only. This closes local implementation work, not merchant launch acceptance.

## Implementation

- Additive `supabase/add-guided-product-lines.sql`: `create_guided_product_reservation`, a complete commercial snapshot keyed to the existing order, an owner-only policy defaulting to **disabled**, and service-only `read_guided_product_reservation` for later fulfillment/reconciliation.
- `src/server/guided-product-reservation.server.ts`: injected-RPC adapter; no default database client, credentials or provider. It prepares canonical lines from the existing server contract, computes delivery and totals, and checks the complete persisted result. No current API route imports it.
- Supported **persistence candidates**: existing non-premium large packs of 6/12, optionally one 120 g schmear; standalone schmears of all five recorded flavors in 120/180/240 g. All confirmed schmear prices are unchanged.
- Current two-bagel combo, extras, minis and premium packs remain rejected: no price/rule is invented. Historical combo prices are not reassigned to the current two-bagel composition.
- SQL independently recalculates supported product prices and every existing delivery tariff. Client amounts, malformed quantities, unknown SKUs, duplicate lines and unsupported compositions cannot lower the persisted total.
- Snapshots retain every product, flavor, quantity, grams, reference amount and legal version, without duplicating customer PII or payment tokens. `order_items` still contains actual bagels only. A standalone pot has `pack_units=0`, zero bagel items and one order-capacity slot; its required legacy `pack_type='single'` is only compatibility metadata, not a fictitious bagel. No pot/flavor stock ledger is claimed.

## Integrity boundaries

Same checkout-session advisory lock as the legacy function; batch row lock for capacity; current time re-read after waiting; fresh payment expiry limited to 30 minutes. Order, bagel items, product snapshot, legal evidence and status history commit together or roll back together.

Exact commercial retries compare canonical product lines, totals, delivery, customer fields, batch and legal version. Same-price substitutions are rejected. Generated replacement order codes and expiry timestamps are ignored on an exact replay; the original values are returned without extending a hold or creating another payment attempt. Expired, cancelled, paid, in-flight, reconciliation-required or provider-ID-bearing orders cannot restart intake.

Existing financial RPC definitions, constraints and payment state machines are not replaced. Missing prerequisites fail closed. The migration rejects unknown object-name collisions and definition drift using versioned definition fingerprints; replay preserves policy/data instead of reenabling or rewriting orders. These fingerprints are accidental-drift checks, not protection against a database owner deliberately rewriting code and its marker.

The **raw legacy RPC** trusts its service-role caller and returns an existing session before validating its contents. It must never be exposed directly to consumers. All new records use `pack_slug='guided-v1:…'`: the current legacy HTTP session adapter rejects that contract during its existing post-RPC re-read even when bagels and amount match (regression tested). New v2 calls also reject a legacy reservation without the snapshot. Future integration must retain both HTTP and RPC validation; this is not a reason to weaken or blindly replay the financial core.

Snapshot reads are separately available to a trusted backend after intake closes or payment is recorded, without creating a new order or repricing historical lines. Anonymous/authenticated consumer roles cannot execute these RPCs, read snapshots or change policy; the service role cannot flip policy or directly write snapshots.

## Source and isolated fixtures

Financial source: [PR23 commit085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca](https://github.com/rikrodriguez/bagelito-pe/tree/085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca). Seven immutable SQL copies, original Git blob and SHA-256 identities are under `tests/sql/fixtures/financial-core/SOURCE.json`. **Those copies are fixture data, not an installation plan for an existing database.** Tests load the current PR47 legal-evidence version separately. The sole baseline fixture adaptation removes `CREATE EXTENSION pgcrypto`; PostgreSQL already provides `gen_random_uuid`, and no tested RPC uses pgcrypto.

PGlite0.5.12 is pinned with registry integrity in the separate `tests/sql/package-lock.json`; it reports PostgreSQL18.6. It was installed from the existing local npm cache, with lifecycle scripts disabled. No runtime dependency was added to the storefront.

```sh
npm ci --prefix tests/sql --ignore-scripts
npm run qa:product-lines
# A separate authorized environment with working local PostgreSQL17+ sockets:
npm run qa:product-lines:postgres -- /path/to/postgresql/bin
```

The native harness creates and verifies its own temporary cluster/PID/data directory, ignores ambient database URLs/PG settings and stops only its owned process. On this executor, PostgreSQL17.11 accepted loopback TCP but **Unix socket creation returned EPERM**; startup aborted and cleanup removed only its temporary data. **Zero concurrent scenarios ran. No retry, privilege escalation or transport fallback was used.** The native test code is supplied for an environment that permits the required sockets; passing serialized PGlite tests does not certify lock races.

Locking and security-definer design references: [PostgreSQL17 locking](https://www.postgresql.org/docs/17/explicit-locking.html), [CREATE FUNCTION security guidance](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Still required before a complete checkout

1. Execute the native concurrent matrix in an authorized functional environment: exact retries, conflicting same-price selections, last capacity slot, rollback, expiry while waiting, and cross-version sessions.
2. Verify the actual installed schema, approve a forward migration and rollback/cutover plan. **No database inspection or migration was performed here.** Do not reapply the financial-core fixture files.
3. Resolve current combo composition/prices, extra offers, premium/mini rules and actual pot availability. Confirmed pot prices alone do not establish stock.
4. Integrate the new reservation and snapshot reader into reviewed server routes, receipt and fulfillment/admin views while preserving payment-config, origin/rate-limit/legal guards. Keep legacy/v2 contract separation. The policy remains closed until separately authorized.
5. Perform isolated Culqi sandbox checkout/3DS/webhook/failure/refund tests, then obtain separate production activation approval. No credential, deployment or charge was performed for this proposal.

## Read-only packing layer (subsequent draft)

`readGuidedPackingPreview` composes the injected snapshot reader with a strict V1 parser and a pure commercial packing preview. It retains every supported bagel/pot flavor, quantity, grams and historical stored amount, while stripping unknown fields. A paid observation **never** sets `fulfillmentAuthorized`: the value remains `false` for every payment state. This is neither a fiscal receipt nor permission to prepare/deliver goods. There is still no public/admin route integration, PII lookup or outgoing notification.

The parser now rejects numeric-string grams, absent pots, unknown/mismatched SKUs, duplicate bagels, invalid pack totals, unsupported multi-line compositions and malformed metadata. Proposed SQL reader hardening also cross-checks bagel rows, `pack_units` and the versioned pack slug against the stored commercial detail, without repricing.

**Validation boundary for this later draft:** Node tests and full application build pass; the revised SQL and six new synthetic coordinator/reader scenarios are **not runtime-verified**. The PGlite process was killed by SIGKILL before per-case results, including a single-engine diagnostic and a resource-coordinated final attempt. Native concurrency remains separately blocked. Do not reuse the previous 28-case SQL pass as evidence for these new changes. See `docs/qa/packing-preview-20261102/README.md` for exact results.

[Recovered combo/extra sources](combo-extra-source-reconciliation-20261102.md) support the published bundles, but the current two-plus-one UI and conditional upsell still require explicit reconciliation. No offer or price changed in this layer.
