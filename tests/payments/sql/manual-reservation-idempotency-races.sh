#!/usr/bin/env bash
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to the isolated local PostgreSQL bin directory}"
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=$(mktemp -d /tmp/bagelito-manual-races.XXXXXX)
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/manual-idempotency-helpers.sql" > "$WORK/setup.log"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 >> "$WORK/setup.log" <<'SQL'
create function bagelito_manual_fixture.wait_for_waiter(waiter_name text)
returns void language plpgsql as $$
begin
 for attempt in 1..500 loop
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity where datname=current_database()
    and application_name=waiter_name and wait_event_type='Lock') then
   raise notice 'Observed overlapping waiter blocked on transaction lock: %',waiter_name;
   return;
  end if;
  perform pg_sleep(0.02);
 end loop;
 raise exception 'Concurrent waiter did not block before holder commit: %',waiter_name;
end $$;
insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
values('00000000-0000-4000-8000-000000000910','Synthetic manual exact races','orders_open',20,120,'2999-02-01');
SQL

held_case() {
 local label="$1" signal="$2" holder_query="$3" waiter_query="$4" expected_state="${5:-}"
 "$PG_BIN/psql" -X -At -F '|' -v ON_ERROR_STOP=1 -c \
  "begin; $holder_query; select pg_advisory_xact_lock($signal); select bagelito_manual_fixture.wait_for_waiter('$label'); commit;" \
  > "$WORK/$label-holder.log" 2>&1 & holder=$!
 local ready=false
 for attempt in $(seq 1 200); do
  if [[ $("$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c \
    "select exists(select 1 from pg_locks where locktype='advisory' and granted and classid=0 and objid=$signal and objsubid=1)") == t ]]; then
   ready=true
   break
  fi
  kill -0 "$holder" 2>/dev/null || { cat "$WORK/$label-holder.log"; exit 1; }
  sleep .02
 done
 [[ "$ready" == true ]] || { cat "$WORK/$label-holder.log"; exit 1; }
 if PGAPPNAME="$label" PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=15000 -c lock_timeout=12000" \
   "$PG_BIN/psql" -X -At -F '|' -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "$waiter_query" \
   > "$WORK/$label-waiter.log" 2>&1; then
  [[ -z "$expected_state" ]] || { echo "Expected $expected_state from $label" >&2; exit 1; }
 else
  result=$?
  [[ -n "$expected_state" && "$result" -eq 1 ]] \
   && grep -Eq "ERROR:[[:space:]]+$expected_state:" "$WORK/$label-waiter.log" \
   || { cat "$WORK/$label-waiter.log"; exit 1; }
 fi
 wait "$holder" || { cat "$WORK/$label-holder.log"; exit 1; }
 grep -Fq "Observed overlapping waiter blocked on transaction lock: $label" "$WORK/$label-holder.log"
}

held_case bagelito_manual_prepare_waiter 989101 \
 "select order_code,state,replayed from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000910')" \
 "select order_code,state,replayed from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000910')"
[[ $(grep -Ec '^BAG-[^|]+\|awaiting_proof\|f$' "$WORK/bagelito_manual_prepare_waiter-holder.log") -eq 1 ]]
[[ $(grep -Ec '^BAG-[^|]+\|awaiting_proof\|t$' "$WORK/bagelito_manual_prepare_waiter-waiter.log") -eq 1 ]]
[[ $(cat "$WORK/bagelito_manual_prepare_waiter-holder.log" "$WORK/bagelito_manual_prepare_waiter-waiter.log" \
 | grep -E '^BAG-[^|]+\|awaiting_proof\|' | cut -d '|' -f 1 | sort -u | wc -l) -eq 1 ]]

held_case bagelito_manual_conflict_waiter 989102 \
 "select order_code,state,replayed from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000911')" \
 "select order_code,state,replayed from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000911',bagelito_manual_fixture.payload(),repeat('1',64),repeat('4',64))" P4090
grep -Fq 'Manual reservation operation conflict.' "$WORK/bagelito_manual_conflict_waiter-waiter.log"

held_case bagelito_manual_finalize_waiter 989103 \
 "select order_code,state,replayed from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000910')" \
 "select order_code,state,replayed from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000910')"
[[ $(grep -Ec '^BAG-[^|]+\|completed\|f$' "$WORK/bagelito_manual_finalize_waiter-holder.log") -eq 1 ]]
[[ $(grep -Ec '^BAG-[^|]+\|completed\|t$' "$WORK/bagelito_manual_finalize_waiter-waiter.log") -eq 1 ]]

"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 >> "$WORK/setup.log" <<'SQL'
insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
values('00000000-0000-4000-8000-000000000912','Synthetic manual last slot','orders_open',1,6,'2999-02-02');
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000912');
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000913');
SQL
held_case bagelito_manual_last_slot_waiter 989104 \
 "select order_code,state,replayed from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000912')" \
 "select order_code,state,replayed from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000913')" P0001
grep -Fq 'This Bagelito batch is full. Join the waitlist.' "$WORK/bagelito_manual_last_slot_waiter-waiter.log"

"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/manual-idempotency-race-assert.sql"
# Reapplying this additive migration must leave completed and pending bindings
# intact and must not replay any historical financial core migration.
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/add-manual-reservation-idempotency-v1.sql" > "$WORK/reapply.log" 2>&1
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/tests/payments/sql/manual-idempotency-race-assert.sql"
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 > "$WORK/cleanup.log" <<'SQL'
with removed as (
 delete from public.manual_reservation_operations where operation_id in (
  '00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000911',
  '00000000-0000-4000-8000-000000000912','00000000-0000-4000-8000-000000000913') returning order_id
)
delete from public.orders where id in (select order_id from removed);
delete from public.batches where id in (
 '00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000912');
drop schema bagelito_manual_fixture cascade;
SQL
echo 'PASS: overlapping manual prepare/finalize replay; conflicting hash; exactly one last-slot order; pending proof retained; additive reapply'
echo "Manual concurrency logs: $WORK"
