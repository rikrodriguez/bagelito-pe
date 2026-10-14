#!/usr/bin/env bash
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to the local PostgreSQL bin directory}"
[[ ${PGHOST:-} == 127.0.0.1 && ${PGDATABASE:-} == bagelito_test ]]
EXPIRY_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
EXPIRY_WORK=$(mktemp -d /tmp/bagelito-expiry-races.XXXXXX)
holder_pid=''
trap 'if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi' EXIT
export PGOPTIONS="${PGOPTIONS:?Explicit local test mode is required} -c statement_timeout=15000 -c lock_timeout=10000"
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$EXPIRY_ROOT/tests/payments/sql/session-expiry-race-setup.sql" > "$EXPIRY_WORK/setup.log" 2>&1
for scenario in 1 2 3 4 5 6; do
  signal=$((90000 + scenario))
  "$PG_BIN/psql" -v ON_ERROR_STOP=1 -v scenario="$scenario" -v signal="$signal" \
    -f "$EXPIRY_ROOT/tests/payments/sql/session-expiry-race-holder.sql" > "$EXPIRY_WORK/holder-$scenario.log" 2>&1 &
  holder_pid=$!
  ready=false
  for attempt in $(seq 1 100); do
    observed=$("$PG_BIN/psql" -At -v ON_ERROR_STOP=1 -c "select exists(select 1 from pg_catalog.pg_locks where locktype='advisory' and granted and classid=0 and objid=$signal and objsubid=1);")
    if [[ "$observed" == t ]]; then ready=true; break; fi
    kill -0 "$holder_pid" 2>/dev/null || { cat "$EXPIRY_WORK/holder-$scenario.log"; exit 1; }
    sleep .02
  done
  [[ "$ready" == true ]] || { cat "$EXPIRY_WORK/holder-$scenario.log"; exit 1; }
  "$PG_BIN/psql" -v ON_ERROR_STOP=1 -v scenario="$scenario" \
    -f "$EXPIRY_ROOT/tests/payments/sql/session-expiry-race-waiter.sql" > "$EXPIRY_WORK/waiter-$scenario.log" 2>&1 \
    || { cat "$EXPIRY_WORK/waiter-$scenario.log"; exit 1; }
  wait "$holder_pid" || { cat "$EXPIRY_WORK/holder-$scenario.log"; exit 1; }
  holder_pid=''
done
"$PG_BIN/psql" -v ON_ERROR_STOP=1 -f "$EXPIRY_ROOT/tests/payments/sql/session-expiry-race-assert.sql"
echo 'PASS: expiry serializes claims, duplicate calls and paid webhooks; re-reads wall time; preserves capacity and quarantines late payments'
