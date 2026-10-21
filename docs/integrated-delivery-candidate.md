# Integrated delivery candidate (isolated validation)

This draft combines three reviewed work branches without merging their PRs or changing main or the serving Preview:

| Input | Exact preserved head | Review |
| --- | --- | --- |
| Culqi expiry/core/recovery work | `80233bcb4624eedb0e9e428bc6f358ef11b23300` | [PR4](https://github.com/rikrodriguez/bagelito-pe/pull/4) |
| Waitlist campaign attribution | `145001f03ad636c0231c0f8322f7b089cca10b53` | [PR6](https://github.com/rikrodriguez/bagelito-pe/pull/6) |
| Operator batch/export/cost fixes | `afdb0ae6b6b6ca991247d68d98e6767c7d90607f` | [PR7](https://github.com/rikrodriguez/bagelito-pe/pull/7) |

The new branch is `integration/delivery-candidate-20261016`. It starts at PR7, which already contains PR4, and merges PR6 with both parents retained (`d7e020cadebdf3c8c97f204c02986d1f467557a5`). Both import sets in the admin page survive. `vercel.json` retains every input deployment exclusion and disables deployment of this branch before its first push. No dependency, lockfile or migration bytes change relative to PR4; the locked Next version remains 15.5.27.

## Combined regression

- All 549 existing Node tests pass, including the 21 attribution cases and the operator regression tests. Lint has zero errors and the existing `culqi-readonly-adapter.test.mjs:99` warning; build/types pass.
- Native diagnostic HTTP tests cover unauthenticated requests, origin/CSRF, production and missing configuration; no configuration values are exposed.
- Reconciliation HTTP tests exercise the real parser with synthetic upstream responses. Native status recovery and the administrative status action run against disposable real SQL, retaining environment, idempotency, capability, late-payment and privacy boundaries.
- Core-only and full PostgreSQL profiles validate preflight, immutable migration replay rejection, forward guard idempotency, authorization, transaction rollback, concurrent capacity/claim/event races and compatible intake closure. The full profile additionally tests the existing QA-only recovery modules; their presence in a fixture does not authorize installing them elsewhere.
- Six local Chromium scenarios cover Instagram/TikTok/direct links on desktop/mobile, pack/language preservation, explicit consent and decoded admin attribution. All form POSTs are intercepted; external requests are blocked. Screenshots go to a caller-selected local directory rather than overwriting the reviewed images.
- The restored operator journey checks native authentication, batch opening/closure, positive/zero costs, current-batch exports/admin delivery, unpaid fulfillment rejection, tracking privacy, all fulfillment stages, idempotent history, capacity and finance. Synthetic totals remain two paid orders, 18 production bagels, S/189 sales and S/122 net profit; pending occupancy remains included in capacity.

## Logical backup and restored-code test

`node tests/integrated-backup-restore.mjs` requires actual `pg_dump -Fc` and `pg_restore --exit-on-error --single-transaction` inside an owned networkless PostgreSQL17.11 container. A fresh `bagelito_restored_test` database receives the dump. The native operator application then uses that restored database, not the original fixture.

Before and after restore, the test compares complete synthetic rows/timestamps, nonempty order-code sequence, table/column/constraint/index definitions, function definitions/owners/ACLs/config, relation owners/ACLs/RLS, triggers, policies, schema privileges and default ACLs. Database-name fields and object OIDs are excluded because a logical restore replaces them. Advancing the restored sequence must return 42 after 41. The final output contains booleans, aggregate synthetic totals and a snapshot digest; the dump stays in container tmpfs and is removed with the container.

The fixture includes both legacy direct waitlist rows and canonical UTM source text. Native admin HTML and CSV must decode the restored campaign and preserve legacy columns, appended UTM fields and consent. This checks the interaction between attribution, the merged admin page and the existing database contract without a schema change.

It does not validate hosted PostgREST, production data volume/extensions/roles, storage objects or bucket contents, backup scheduling/retention/encryption, PITR, actual recovery time, real provider delivery, a deployed binary or external communications. A successful synthetic logical restore is not production disaster-recovery certification.

## Reproduction and CI

With Node24, locked dependencies, Docker and the pinned image available:

```bash
npm ci
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 CULQI_ENABLED=false npm run build
node tests/culqi-readonly-http.mjs
node tests/culqi-reconciliation-http.mjs
docker pull --platform linux/amd64 postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df
node tests/culqi-status-recovery-http.mjs
node tests/culqi-admin-status-http.mjs
node tests/integrated-backup-restore.mjs
```

Run each SQL profile in its own read-only, networkless container (append `--core-only` for that profile):

```bash
docker run --rm --platform linux/amd64 --network none --read-only \
  --tmpfs /tmp:rw,mode=1777 --user postgres \
  --env PG_BIN=/usr/lib/postgresql/17/bin \
  --volume "$PWD:/workspace:ro" --workdir /workspace --entrypoint bash \
  postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df \
  tests/run-sql-tests.sh
```

The optional browser check uses already installed Python Playwright and `/usr/bin/chromium`. Start the compiled app with an explicit environment and no credentials in one terminal, then run the script in another; stop that owned server afterward:

```bash
env -i PATH="$PATH" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
  node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107
python tests/browser-waitlist-attribution.py --output-dir /tmp/bagelito-integrated-screenshots
```

The local six-scenario browser check is reported separately from CI. `.github/workflows/integrated-delivery.yml` checks the exact candidate SHA on push and draft PR, with read-only GitHub permissions, pinned actions and no app credentials or deployment steps. Its application job runs Node/lint/build plus all native HTTP/restored-operator checks; the SQL matrix runs both profiles independently. Other draft workflows may correctly be skipped for this branch.

## Migration and rollback boundary

The existing [core migration/rollback review](culqi-core-migrations-and-compatible-rollback.md) remains authoritative. Original core SHA256 values remain `f5fc23551be00ac1eb869e8997e33df9ea7dadc34821cbcc87ed1fbfba1e2292` and `40e87814e92edc5f5e199202ee827692fafab99140fb3cd266c265486e378dee`. Do not replay core installation scripts on an installed schema. Target inventory and reviewed forward changes are still required.

The synthetic compatible rollback closes intake for one explicitly selected batch while retaining the current settlement handlers and core objects. New reservations are rejected; in-flight claim/finish/event/replay continue; another batch remains untouched. This candidate changes no SQL. PR4 is an earlier same-schema application checkpoint, but reverting to it would remove the operator fixes and attribution and is not a certified deployment rollback. Old main `1e6e2a6ff5270cb1221dcb8a6c25f87e4e1e3335` is unsafe for in-flight token payments. A global `CULQI_ENABLED=false` also disables status/webhook, so it is not a selective intake rollback. Restoring a stale financial snapshot must never be an automatic rollback of active payments.

## Concrete launch blockers

1. Sandbox webhook event lookup still returns upstream HTTP400 `parameter_error`; callbacks have not established a verified event/transaction. A legitimate event/delivery trace and provider-side parameter explanation remain missing while the provider panel is blank. This task neither retries callbacks nor bypasses controls or contacts support.
2. Actual card/3DS/rejection/expiry and provider acceptance gates remain incomplete. Synthetic HTTP/SQL checks do not certify them.
3. Production schema/contracts/ACLs/backfill inventory and a reviewed migration manifest are outstanding. QA recovery modules must not be promoted to live by inference from fixture success.
4. A real destination backup/restore, storage/access verification and compatible binary/operational rollback still require a separately approved rehearsal.
5. Target environment/origin/project/key/RSA bindings, protected admin readiness, commercial/live approval and the final release/deployment decision remain separate gates. This work changes no remote configuration or flag.
6. A deployed integrated Preview and its approved smoke checks have not been requested or performed. All original PRs remain unmerged; this draft is a review candidate, not launch authorization.
