#!/usr/bin/env bash
set -euo pipefail
# Requires existing local PostgreSQL 17+ binaries; never uses a configured remote DB.
SQL_PROFILE=full
if [[ $# -gt 1 || ( $# -eq 1 && ${1:-} != --core-only ) ]]; then
  echo 'Usage: tests/run-sql-tests.sh [--core-only]' >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then SQL_PROFILE=core-only; fi
: "${PG_BIN:?Set PG_BIN to the local PostgreSQL bin directory}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d /tmp/bagelito-sql.XXXXXX)
export PGHOST=127.0.0.1 PGPORT=55438 PGDATABASE=bagelito_test PGUSER="$(id -un)"
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGPASSFILE
"$PG_BIN/initdb" -D "$WORK/data" --auth=trust > "$WORK/init.log" 2>&1
"$PG_BIN/postgres" -D "$WORK/data" -k '' -h 127.0.0.1 -p "$PGPORT" > "$WORK/server.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
ready=false
for n in $(seq 1 50); do
 kill -0 "$pid" 2>/dev/null || { echo 'Owned fixture PostgreSQL process exited before startup' >&2; exit 1; }
 if [[ -r "$WORK/data/postmaster.pid" ]] && [[ $(head -n 1 "$WORK/data/postmaster.pid") == "$pid" ]] \
   && "$PG_BIN/pg_isready" -q -d postgres; then ready=true; break; fi
 sleep .1
done
[[ "$ready" == true ]] || { echo 'Owned fixture PostgreSQL did not become ready' >&2; exit 1; }
[[ $("$PG_BIN/psql" -X -At -d postgres -v ON_ERROR_STOP=1 -c 'show data_directory') == "$WORK/data" ]] \
  || { echo 'Fixture PostgreSQL data directory does not match the owned cluster' >&2; exit 1; }
"$PG_BIN/psql" -X -d postgres -v ON_ERROR_STOP=1 > "$WORK/bootstrap.log" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create database bagelito_test;
SQL
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 >> "$WORK/bootstrap.log" <<'SQL'
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
SQL
expect_sql_failure() {
 local sql_file="$1" expected_state="$2" log_name="$3" expected_message="${4:-}" psql_status
 if "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f "$sql_file" > "$WORK/$log_name" 2>&1; then
  echo "Expected SQL failure did not occur: $log_name" >&2
  return 1
 else psql_status=$?; fi
 [[ "$psql_status" -eq 3 ]] && grep -Eq "ERROR:[[:space:]]+$expected_state:" "$WORK/$log_name" \
   || { echo "Unexpected SQL failure classification: $log_name" >&2; return 1; }
 if [[ -n "$expected_message" ]]; then
  grep -Fq "$expected_message" "$WORK/$log_name" \
    || { echo "Expected local SQL rejection was not observed: $log_name" >&2; return 1; }
 fi
}
reset_preflight_database() {
 "$PG_BIN/psql" -X -d postgres -v ON_ERROR_STOP=1 -c 'drop database if exists bagelito_preflight_test;' >> "$WORK/preflight-bootstrap.log" 2>&1
 "$PG_BIN/psql" -X -d postgres -v ON_ERROR_STOP=1 -c 'create database bagelito_preflight_test template bagelito_test;' >> "$WORK/preflight-bootstrap.log" 2>&1
}
assert_core_only_catalog() {
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 >> "$WORK/core-only-catalog.log" <<'SQL'
do $$ begin
 if current_database() <> 'bagelito_test'
   or current_setting('bagelito.test_mode',true) is distinct from 'on' then
  raise exception 'Exact isolated database and explicit test mode are required';
 end if;
 if to_regclass('public.culqi_charge_get_confirmation_policy') is not null
   or to_regclass('public.culqi_charge_get_receipts') is not null
   or to_regclass('public.culqi_status_charge_recovery_policy') is not null
   or to_regclass('public.culqi_status_charge_receipts') is not null
   or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('confirm_culqi_charge_get','confirm_culqi_status_charge_get')) then
  raise exception 'Core regression phase must not contain QA recovery objects';
 end if;
end $$;
SQL
}
for file in setup-bagelito-reservations.sql add-public-api-hardening.sql add-payment-provider.sql; do
 # Fixture adaptation only: PG17 provides gen_random_uuid natively; no tested RPC uses pgcrypto.
 sed '/create extension if not exists pgcrypto;/d' "$ROOT/supabase/$file" | "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 >> "$WORK/schema.log" 2>&1
done
export PGOPTIONS='-c bagelito.test_mode=on'
# Keep negative preflight states outside the populated upgrade fixture. Both
# databases are freshly owned by this isolated local cluster, never an app DB.
reset_preflight_database
(
 export PGDATABASE=bagelito_preflight_test
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/preflight-culqi-checkout-core.sql" >> "$WORK/preflight-fresh.log" 2>&1
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-checkout-safety.sql" >> "$WORK/preflight-empty-schema.log" 2>&1
 expect_sql_failure "$ROOT/supabase/preflight-culqi-checkout-core.sql" 55000 preflight-partial.log \
  'Checkout safety core is already present; use forward migrations'
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-session-expiry.sql" >> "$WORK/preflight-empty-schema.log" 2>&1
 expect_sql_failure "$ROOT/supabase/preflight-culqi-checkout-core.sql" 55000 preflight-installed-empty.log \
  'Checkout safety core is already present; use forward migrations'
)
reset_preflight_database
(
 export PGDATABASE=bagelito_preflight_test
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/checkout-preflight-boolean.sql" >> "$WORK/preflight-boolean-seed.log" 2>&1
 expect_sql_failure "$ROOT/supabase/preflight-culqi-checkout-core.sql" 55000 preflight-boolean.log \
  'Checkout safety preflight found an incompatible prior claim contract'
)
for collision_kind in order charge; do
 reset_preflight_database
 (
  export PGDATABASE=bagelito_preflight_test
  "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v fixture_collision_kind="$collision_kind" \
   -f "$ROOT/tests/payments/sql/checkout-preflight-collision.sql" >> "$WORK/preflight-collision-$collision_kind-seed.log" 2>&1
  expect_sql_failure "$ROOT/supabase/preflight-culqi-checkout-core.sql" 55000 "preflight-collision-$collision_kind.log" \
   'Checkout safety preflight found duplicate Culqi payment identities'
 )
done
"$PG_BIN/psql" -X -d postgres -v ON_ERROR_STOP=1 -c 'drop database bagelito_preflight_test;' >> "$WORK/preflight-bootstrap.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/legacy-attempt.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/preflight-culqi-checkout-core.sql" >> "$WORK/preflight-populated.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-checkout-safety.sql" >> "$WORK/schema.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-session-expiry.sql" >> "$WORK/schema.log" 2>&1
expect_sql_failure "$ROOT/supabase/preflight-culqi-checkout-core.sql" 55000 preflight-installed-populated.log \
 'Checkout safety core is already present; use forward migrations'
assert_core_only_catalog
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-checkout-replay-guard.sql" >> "$WORK/schema.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/checkout-replay-guard.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/checkout-replay-guard-seed.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-checkout-replay-guard.sql" >> "$WORK/guard-reapply.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/checkout-replay-guard-assert.sql"
# Replay the complete immutable original, including its own BEGIN/COMMIT. The
# failed psql session disconnects and rolls back before the snapshot is checked.
expect_sql_failure "$ROOT/supabase/add-checkout-safety.sql" 23514 protected-original-replay.log \
 'Checkout safety replay would overwrite reconciliation evidence'
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/checkout-replay-guard-assert.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/compatible-intake-rollback.sql"
echo 'PASS: core preflight rejects installed state; original replay aborts atomically; forward guard is idempotent; closed intake retains settlement'
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-charge-confirmation.sql" >> "$WORK/schema.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/admin-login-rate-limit.sql"
for file in reservation-window.sql charge-claim.sql charge-concurrency.sql prepare-concurrency.sql; do
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/$file"
done
query="select (public.claim_culqi_charge((select id from orders where order_code='BAG-CONCURRENCY'),'tkn_test_concurrency','device_synthetic',false)->>'claimed')::boolean;"
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "begin; $query select pg_sleep(0.2); commit;" > "$WORK/one" & a=$!
yape_query="select (public.claim_culqi_charge((select id from orders where order_code='BAG-CONCURRENCY'),'ype_test_concurrency','',false)->>'claimed')::boolean;"
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "$yape_query" > "$WORK/two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/one" "$WORK/two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/one" "$WORK/two" | grep -c '^f$') -eq 1 ]]
prepare="select public.prepare_culqi_token_session((select id from orders where order_code='BAG-CONCURRENCY-PREP'))->>'sessionId';"
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "begin; $prepare select pg_sleep(0.2); commit;" > "$WORK/prepare-one" & a=$!
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "$prepare" > "$WORK/prepare-two" & b=$!
wait "$a"; wait "$b"
# Both concurrent callers receive the same local session; only one attempt exists.
[[ $(cat "$WORK/prepare-one" "$WORK/prepare-two" | grep -E '^[0-9a-f-]{36}$' | wc -l) -eq 2 ]]
[[ $(cat "$WORK/prepare-one" "$WORK/prepare-two" | grep -E '^[0-9a-f-]{36}$' | sort -u | wc -l) -eq 1 ]]
[[ $("$PG_BIN/psql" -X -At -c "select count(*) from payment_attempts where order_id=(select id from orders where order_code='BAG-CONCURRENCY-PREP') and provider_order_id is null") -eq 1 ]]
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/transaction-fixtures.sql"
winning_source=$("$PG_BIN/psql" -X -At -c "select payment_charge_source_id from orders where order_code='BAG-CONCURRENCY'")
webhook="select coalesce((public.apply_culqi_payment_event('evt_test_concurrent12','charge.creation.succeeded','{\"id\":\"chr_test_concurrent12\",\"amount\":5800,\"currency\":\"PEN\",\"metadata\":{\"bagelito_order_code\":\"BAG-CONCURRENCY\"},\"source\":{\"id\":\"$winning_source\"}}'::jsonb,'{}'::jsonb)->>'duplicate')::boolean,false);"
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "begin; $webhook select pg_sleep(0.2); commit;" > "$WORK/webhook-one" & a=$!
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "$webhook" > "$WORK/webhook-two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/webhook-one" "$WORK/webhook-two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/webhook-one" "$WORK/webhook-two" | grep -c '^f$') -eq 1 ]]
[[ $("$PG_BIN/psql" -X -At -c "select count(*) from order_status_history where order_id=(select id from orders where order_code='BAG-CONCURRENCY') and new_status='payment_confirmed'") -eq 1 ]]
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/early-failure-race.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/transaction-expiry-clock.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/session-expiry.sql"
bash "$ROOT/tests/payments/sql/session-expiry-races.sh"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-setup.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-webhook.sql" > "$WORK/capacity-webhook" & a=$!
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-reserve.sql" > "$WORK/capacity-reserve" & b=$!
wait "$a"; wait "$b"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-assert.sql"
# Seed one persistent global counter, then race both connections for the last slot.
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -c "select * from consume_api_rate_limit('admin_login_concurrency','fixture',2,900);" > "$WORK/admin-seed"
admin="select allowed from consume_api_rate_limit('admin_login_concurrency','fixture',2,900);"
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "begin; $admin select pg_sleep(0.2); commit;" > "$WORK/admin-one" & a=$!
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "$admin" > "$WORK/admin-two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/admin-one" "$WORK/admin-two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/admin-one" "$WORK/admin-two" | grep -c '^f$') -eq 1 ]]
echo 'PASS: persistent admin limits, expiry recovery, role restrictions and concurrent last slot'
echo 'PASS: verified failure wins over late response; wall-clock expiry enforced; payment race cannot oversell capacity'
echo 'PASS: atomic rollback after history failure; metadata/source binding; duplicate event race; fulfillment preservation; late-payment quarantine'
echo 'PASS: scheduled opening; legacy lane blocked; reusable token-only session; single charge claim; 3DS binding; concurrent card/Yape sessions allow exactly one claim'
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-confirmation.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-confirmation-finish-sticky.sql"
for scenario in 1 2 3 4 5 6 7; do
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-confirmation-race-setup.sql" > "$WORK/confirmation-setup-$scenario.log" 2>&1
 confirmation_signal=$((94000+scenario))
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" -v signal="$confirmation_signal" \
  -f "$ROOT/tests/payments/sql/charge-confirmation-race-holder.sql" > "$WORK/confirmation-holder-$scenario.log" 2>&1 & confirmation_holder=$!
 confirmation_ready=false
 for attempt in $(seq 1 100); do
  observed=$("$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "select exists(select 1 from pg_locks where locktype='advisory' and granted and classid=0 and objid=$confirmation_signal and objsubid=1);")
  if [[ "$observed" == t ]]; then confirmation_ready=true; break; fi
  kill -0 "$confirmation_holder" 2>/dev/null || { cat "$WORK/confirmation-holder-$scenario.log"; exit 1; }
  sleep .02
 done
 [[ "$confirmation_ready" == true ]] || { cat "$WORK/confirmation-holder-$scenario.log"; exit 1; }
 PGAPPNAME=bagelito_confirmation_waiter PGOPTIONS="$PGOPTIONS -c statement_timeout=15000 -c lock_timeout=12000" \
  "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" \
  -f "$ROOT/tests/payments/sql/charge-confirmation-race-waiter.sql" > "$WORK/confirmation-waiter-$scenario.log" 2>&1 \
  || { cat "$WORK/confirmation-waiter-$scenario.log"; exit 1; }
 wait "$confirmation_holder" || { cat "$WORK/confirmation-holder-$scenario.log"; exit 1; }
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" -f "$ROOT/tests/payments/sql/charge-confirmation-race-assert.sql"
done
echo 'PASS: charge result duplicate/webhook races, post-lock expiry, reused capacity, refund, claim and freshness guards'
assert_core_only_catalog
if [[ "$SQL_PROFILE" == full ]]; then
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-charge-get-reconciliation.sql" >> "$WORK/schema.log" 2>&1
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-status-charge-recovery.sql" >> "$WORK/schema.log" 2>&1
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-confirmation-qa-recovery.sql"
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-get-reconciliation.sql"
 echo 'PASS: charge GET disabled policy, typed evidence, role isolation, atomic history, already-paid and webhook preservation'
 bash "$ROOT/tests/payments/sql/charge-get-reconciliation-races.sh"
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/status-charge-recovery.sql"
 echo 'PASS: generic QA status recovery defaults disabled; capability/money binding; original reservation deadline; typed receipts; atomic rollback and webhook preservation'
 bash "$ROOT/tests/payments/sql/status-charge-recovery-races.sh"
fi
echo "PASS: isolated SQL profile $SQL_PROFILE"
echo "Fixture logs: $WORK"
