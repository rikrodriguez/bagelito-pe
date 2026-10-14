#!/usr/bin/env bash
set -euo pipefail
# Requires existing local PostgreSQL 17+ binaries; never uses a configured remote DB.
: "${PG_BIN:?Set PG_BIN to the local PostgreSQL bin directory}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d /tmp/bagelito-sql.XXXXXX)
export PGHOST=127.0.0.1 PGPORT=55438 PGDATABASE=bagelito_test PGUSER="$(id -un)"
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
"$PG_BIN/initdb" -D "$WORK/data" --auth=trust > "$WORK/init.log" 2>&1
"$PG_BIN/postgres" -D "$WORK/data" -k '' -h 127.0.0.1 -p "$PGPORT" > "$WORK/server.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
for n in $(seq 1 50); do "$PG_BIN/pg_isready" -q -d postgres && break; sleep .1; done
"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 > "$WORK/bootstrap.log" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create database bagelito_test;
SQL
"$PG_BIN/psql" -v ON_ERROR_STOP=1 >> "$WORK/bootstrap.log" <<'SQL'
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
SQL
for file in setup-bagelito-reservations.sql add-public-api-hardening.sql add-payment-provider.sql; do
 # Fixture adaptation only: PG17 provides gen_random_uuid natively; no tested RPC uses pgcrypto.
 sed '/create extension if not exists pgcrypto;/d' "$ROOT/supabase/$file" | "$PG_BIN/psql" -v ON_ERROR_STOP=1 >> "$WORK/schema.log" 2>&1
done
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/legacy-attempt.sql"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-checkout-safety.sql" >> "$WORK/schema.log" 2>&1
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-session-expiry.sql" >> "$WORK/schema.log" 2>&1
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-culqi-charge-get-reconciliation.sql" >> "$WORK/schema.log" 2>&1
export PGOPTIONS='-c bagelito.test_mode=on'
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/admin-login-rate-limit.sql"
for file in reservation-window.sql charge-claim.sql charge-concurrency.sql prepare-concurrency.sql; do
 "$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/$file"
done
query="select (public.claim_culqi_charge((select id from orders where order_code='BAG-CONCURRENCY'),'tkn_test_concurrency','device_synthetic',false)->>'claimed')::boolean;"
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "begin; $query select pg_sleep(0.2); commit;" > "$WORK/one" & a=$!
yape_query="select (public.claim_culqi_charge((select id from orders where order_code='BAG-CONCURRENCY'),'ype_test_concurrency','',false)->>'claimed')::boolean;"
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "$yape_query" > "$WORK/two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/one" "$WORK/two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/one" "$WORK/two" | grep -c '^f$') -eq 1 ]]
prepare="select public.prepare_culqi_token_session((select id from orders where order_code='BAG-CONCURRENCY-PREP'))->>'sessionId';"
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "begin; $prepare select pg_sleep(0.2); commit;" > "$WORK/prepare-one" & a=$!
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "$prepare" > "$WORK/prepare-two" & b=$!
wait "$a"; wait "$b"
# Both concurrent callers receive the same local session; only one attempt exists.
[[ $(cat "$WORK/prepare-one" "$WORK/prepare-two" | grep -E '^[0-9a-f-]{36}$' | wc -l) -eq 2 ]]
[[ $(cat "$WORK/prepare-one" "$WORK/prepare-two" | grep -E '^[0-9a-f-]{36}$' | sort -u | wc -l) -eq 1 ]]
[[ $("$PG_BIN/psql" -At -c "select count(*) from payment_attempts where order_id=(select id from orders where order_code='BAG-CONCURRENCY-PREP') and provider_order_id is null") -eq 1 ]]
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/transaction-fixtures.sql"
winning_source=$("$PG_BIN/psql" -At -c "select payment_charge_source_id from orders where order_code='BAG-CONCURRENCY'")
webhook="select coalesce((public.apply_culqi_payment_event('evt_test_concurrent12','charge.creation.succeeded','{\"id\":\"chr_test_concurrent12\",\"amount\":5800,\"currency\":\"PEN\",\"metadata\":{\"bagelito_order_code\":\"BAG-CONCURRENCY\"},\"source\":{\"id\":\"$winning_source\"}}'::jsonb,'{}'::jsonb)->>'duplicate')::boolean,false);"
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "begin; $webhook select pg_sleep(0.2); commit;" > "$WORK/webhook-one" & a=$!
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "$webhook" > "$WORK/webhook-two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/webhook-one" "$WORK/webhook-two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/webhook-one" "$WORK/webhook-two" | grep -c '^f$') -eq 1 ]]
[[ $("$PG_BIN/psql" -At -c "select count(*) from order_status_history where order_id=(select id from orders where order_code='BAG-CONCURRENCY') and new_status='payment_confirmed'") -eq 1 ]]
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/early-failure-race.sql"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/transaction-expiry-clock.sql"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/session-expiry.sql"
bash "$ROOT/tests/payments/sql/session-expiry-races.sh"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/charge-get-reconciliation.sql"
echo 'PASS: charge GET disabled policy, typed evidence, role isolation, atomic history, already-paid and webhook preservation'
bash "$ROOT/tests/payments/sql/charge-get-reconciliation-races.sh"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-setup.sql"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-webhook.sql" > "$WORK/capacity-webhook" & a=$!
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-reserve.sql" > "$WORK/capacity-reserve" & b=$!
wait "$a"; wait "$b"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/capacity-race-assert.sql"
# Seed one persistent global counter, then race both connections for the last slot.
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -c "select * from consume_api_rate_limit('admin_login_concurrency','fixture',2,900);" > "$WORK/admin-seed"
admin="select allowed from consume_api_rate_limit('admin_login_concurrency','fixture',2,900);"
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "begin; $admin select pg_sleep(0.2); commit;" > "$WORK/admin-one" & a=$!
"$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "$admin" > "$WORK/admin-two" & b=$!
wait "$a"; wait "$b"
[[ $(cat "$WORK/admin-one" "$WORK/admin-two" | grep -c '^t$') -eq 1 ]]
[[ $(cat "$WORK/admin-one" "$WORK/admin-two" | grep -c '^f$') -eq 1 ]]
echo 'PASS: persistent admin limits, expiry recovery, role restrictions and concurrent last slot'
echo 'PASS: verified failure wins over late response; wall-clock expiry enforced; payment race cannot oversell capacity'
echo 'PASS: atomic rollback after history failure; metadata/source binding; duplicate event race; fulfillment preservation; late-payment quarantine'
echo 'PASS: scheduled opening; legacy lane blocked; reusable token-only session; single charge claim; 3DS binding; concurrent card/Yape sessions allow exactly one claim'
echo "Fixture logs: $WORK"
