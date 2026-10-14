#!/usr/bin/env bash
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to the local PostgreSQL bin directory}"
[[ ${PGHOST:-} == 127.0.0.1 && ${PGDATABASE:-} == bagelito_test ]]
STATUS_RACE_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
STATUS_RACE_WORK=$(mktemp -d /tmp/bagelito-status-charge-races.XXXXXX)
holder_pid=''
trap 'if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi' EXIT
export PGOPTIONS="${PGOPTIONS:?Explicit local test mode is required} -c statement_timeout=15000 -c lock_timeout=12000"
for scenario in 1 2 3 4 5 6; do
  "$PG_BIN/psql" -v ON_ERROR_STOP=1 \
    -f "$STATUS_RACE_ROOT/tests/payments/sql/status-charge-recovery-race-setup.sql" \
    > "$STATUS_RACE_WORK/setup-$scenario.log" 2>&1
  signal=$((99000+scenario))
  "$PG_BIN/psql" -v ON_ERROR_STOP=1 -v scenario="$scenario" -v signal="$signal" \
    -f "$STATUS_RACE_ROOT/tests/payments/sql/status-charge-recovery-race-holder.sql" \
    > "$STATUS_RACE_WORK/holder-$scenario.log" 2>&1 &
  holder_pid=$!
  ready=false
  for attempt in $(seq 1 100); do
    observed=$("$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "select exists(select 1 from pg_locks where locktype='advisory' and granted and classid=0 and objid=$signal and objsubid=1);")
    if [[ "$observed" == t ]]; then ready=true; break; fi
    kill -0 "$holder_pid" 2>/dev/null || { cat "$STATUS_RACE_WORK/holder-$scenario.log"; exit 1; }
    sleep .02
  done
  [[ "$ready" == true ]] || { cat "$STATUS_RACE_WORK/holder-$scenario.log"; exit 1; }
  PGAPPNAME=bagelito_status_charge_waiter "$PG_BIN/psql" -v ON_ERROR_STOP=1 -v scenario="$scenario" \
    -f "$STATUS_RACE_ROOT/tests/payments/sql/status-charge-recovery-race-waiter.sql" \
    > "$STATUS_RACE_WORK/waiter-$scenario.log" 2>&1 \
    || { cat "$STATUS_RACE_WORK/waiter-$scenario.log"; exit 1; }
  wait "$holder_pid" || { cat "$STATUS_RACE_WORK/holder-$scenario.log"; exit 1; }
  holder_pid=''
  "$PG_BIN/psql" -v ON_ERROR_STOP=1 -v scenario="$scenario" \
    -f "$STATUS_RACE_ROOT/tests/payments/sql/status-charge-recovery-race-assert.sql"
done
echo 'PASS: generic status GET duplicate, expiry, replacement capacity, stale claim, original attempt deadline and persisted refund race'
