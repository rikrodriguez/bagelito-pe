# Reservation reliability regression — 2026-10-31

Base: PR #23, `integration/culqi-release-candidate-20261026`,
`085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca`.
Fix branch: `fix/reservation-rpc-capacity-20261031`; draft PR targets that base.
This change does not integrate PR #27/#40.

## Reproductions and correction

The tests execute `src/lib/reservations/service.ts` with its real schema,
catalog, pricing and batch rules. Only environment checks, database/storage I/O
and monitoring are replaced with synthetic fixtures. No provider or remote DB is
contacted by these tests.

- `reservation-rpc-atomicity.test.mjs`: before the fix, 10 pass / 7 fail.
  The mutable DB fixture intentionally permits the three legacy writes. A barrier
  makes two concurrent requests read zero usage in a batch with capacity one pack
  and six bagels. RPC errors `42883`, `PGRST202` and `42501` each lead to two orders
  and twelve bagels. The permission error mentions `create_reservation_order` and
  is incorrectly treated as a missing function by the original fallback.
- The fix removes the non-atomic order/items/history insert path and its rollback.
  Every reservation RPC error or incomplete response now rejects the reservation
  and attempts deletion of the uploaded proof. Success, amount, consent, upload
  errors, transport rejection and cleanup warnings are also covered.
- `reservation-batch-capacity.test.mjs`: before the fix, 13 pass / 3 fail.
  Zero capacity in either or both fields returns `accepting: true` and null
  remaining capacity. Explicit null/undefined checks now preserve zero as a
  limit, preserve null as unlimited, and clamp remaining capacity to zero.
  Positive limits, exact fit, exhausted limits, expired holds, cancelled/paid
  orders and opening/closing guards remain covered.

The SQL RPC in `supabase/add-public-api-hardening.sql` locks the batch with
`FOR UPDATE`, applies capacity limits with `IS NOT NULL` and creates all three
row types in one transaction. The checkout safety trigger checks the ordering
window; it does not make the legacy inserts atomic or enforce their capacity.

These are local synthetic reproductions. The real production RPC state was not
inspected, and this report does not assert an incident occurred in production.

## Reproduce locally

With Node 24 and locked dependencies installed:

```sh
npm ci --ignore-scripts --cache /tmp/bagelito-npm-cache
node --test tests/reservation-rpc-atomicity.test.mjs tests/reservation-batch-capacity.test.mjs
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 CULQI_ENABLED=false npm run build
npx tsc --noEmit --incremental false
```

To reproduce the original defects, create a detached worktree at the base SHA
above, copy only the two new test files into its `tests/` directory, install its
locked dependencies, and run the same focused command. Expect 23 pass / 10 fail,
including `Unsafe fallback wrote 2 orders / 12 bagels`. The fixed version passes
all 33 focused tests and all 803 Node tests, without changing existing financial
assertions.

Lint has zero errors and the preexisting warning in
`tests/payments/culqi-readonly-adapter.test.mjs:99`. Next build and TypeScript pass.

Both existing SQL profiles pass in an isolated PostgreSQL 17.11 container using
the workflow-pinned image
`postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df`.
Use a readable fixture copy if the checkout has private file modes:

```sh
mkdir -p /tmp/bagelito-reservation-sql-fixture
cp -R supabase tests /tmp/bagelito-reservation-sql-fixture/
chmod -R a+rX /tmp/bagelito-reservation-sql-fixture
docker run --rm --platform linux/amd64 --network none --read-only \
  --tmpfs /tmp:rw,mode=1777 --user postgres \
  --env PG_BIN=/usr/lib/postgresql/17/bin \
  --volume /tmp/bagelito-reservation-sql-fixture:/workspace:ro \
  --workdir /workspace --entrypoint bash \
  postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df \
  tests/run-sql-tests.sh
```

Repeat with `--core-only` after `tests/run-sql-tests.sh`. Each run initializes its
own temporary cluster and runs the existing transaction/capacity/payment race
fixtures. No SQL migration files changed and no remote migrations are needed.

## Publication boundary and limits

`vercel.json` already contains `git.deploymentEnabled: false`; it is preserved.
The new branch and PR base are absent from the existing workflow trigger
allowlists. No workflow triggers are broadened and no jobs are retried while
[Actions run 40361963771](https://github.com/rikrodriguez/bagelito-pe/actions/runs/40361963771)
remains blocked by account billing. Local checks do not establish GitHub CI success.

Current PR #23 notes document the financial core as installed. This task does not
reinstall it or access live providers, credentials or production data. It does not
merge, deploy or alter legal/commercial settings. Storage cleanup remains best
effort: returned cleanup errors produce a warning, and a transport failure does
not establish whether a remote transaction committed. Those existing distributed
failure limits are outside these two corrections.
