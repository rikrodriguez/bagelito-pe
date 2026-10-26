#!/usr/bin/env bash
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to the local PostgreSQL bin directory}"
[[ ${PGHOST:-} == 127.0.0.1 && ${PGDATABASE:-} == bagelito_test ]]
GET_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
GET_WORK=$(mktemp -d /tmp/bagelito-charge-get-races.XXXXXX)
holder_pid=''
trap 'if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi' EXIT
export PGOPTIONS="${PGOPTIONS:?Explicit local test mode is required} -c statement_timeout=15000 -c lock_timeout=12000"
for scenario in 1 2 3 4; do
  "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -f "$GET_ROOT/tests/payments/sql/charge-get-reconciliation-race-setup.sql" > "$GET_WORK/setup-$scenario.log" 2>&1
  signal=$((92000+scenario))
  "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" -v signal="$signal" \
    -f "$GET_ROOT/tests/payments/sql/charge-get-reconciliation-race-holder.sql" > "$GET_WORK/holder-$scenario.log" 2>&1 &
  holder_pid=$!
  ready=false
  for attempt in $(seq 1 100); do
    observed=$("$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "select exists(select 1 from pg_locks where locktype='advisory' and granted and classid=0 and objid=$signal and objsubid=1);")
    if [[ "$observed" == t ]]; then ready=true; break; fi
    kill -0 "$holder_pid" 2>/dev/null || { cat "$GET_WORK/holder-$scenario.log"; exit 1; }
    sleep .02
  done
  [[ "$ready" == true ]] || { cat "$GET_WORK/holder-$scenario.log"; exit 1; }
  PGAPPNAME=bagelito_charge_get_waiter "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" \
    -f "$GET_ROOT/tests/payments/sql/charge-get-reconciliation-race-waiter.sql" > "$GET_WORK/waiter-$scenario.log" 2>&1 \
    || { cat "$GET_WORK/waiter-$scenario.log"; exit 1; }
  wait "$holder_pid" || { cat "$GET_WORK/holder-$scenario.log"; exit 1; }
  holder_pid=''
  "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -v scenario="$scenario" \
    -f "$GET_ROOT/tests/payments/sql/charge-get-reconciliation-race-assert.sql"
done
echo 'PASS: charge GET concurrent duplicate, post-lock expiry, reused capacity and stale claim binding'
