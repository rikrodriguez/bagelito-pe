// Native Next.js POST /status + actual PostgreSQL transaction. Only transport
// capabilities are replaced: Supabase HTTP is bridged to isolated local SQL,
// and Culqi GET returns synthetic observations. No source or parser is changed.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const host = new URL(origin).host;
const image = "postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df";
const container = `bagelito-status-http-${randomBytes(8).toString("hex")}`;
const temporary = await mkdtemp(path.join(tmpdir(), "bagelito-status-http-"));
const dockerConfig = path.join(temporary, "docker-config");
await mkdir(dockerConfig);
const dockerEnv = { PATH: process.env.PATH, DOCKER_HOST: "unix:///var/run/docker.sock" };
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function docker(args, input = undefined, allowFailure = false) {
  const result = spawnSync("docker", ["--config", dockerConfig, ...args], {
    input, encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, env: dockerEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0 && !allowFailure) throw new Error("Isolated PostgreSQL fixture operation failed");
  return result;
}
function sql(statement, { json = false, allowFailure = false } = {}) {
  const result = docker(["exec", "-i", container, "/usr/lib/postgresql/17/bin/psql", "-X", "-qAt",
    "-h", "/tmp", "-U", "postgres", "-d", "bagelito_test", "-v", "ON_ERROR_STOP=1", "-f", "-"], statement, allowFailure);
  if (!json) return result;
  try { return JSON.parse(result.stdout.trim()); }
  catch { throw new Error("Isolated fixture returned invalid JSON"); }
}
async function bootDatabase() {
  // Cached immutable image only. CI explicitly pulls the image before this
  // fixture; this process does not contact a registry or expose a TCP port.
  docker(["run", "--rm", "--pull=never", "--platform", "linux/amd64", "--name", container,
    "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,mode=1777", "--user", "postgres",
    "--entrypoint", "bash", "-d", image, "-ceu", `
      /usr/lib/postgresql/17/bin/initdb -D /tmp/data --auth=trust >/tmp/init.log 2>&1
      exec /usr/lib/postgresql/17/bin/postgres -D /tmp/data -h '' -k /tmp
    `]);
  const deadline = Date.now() + 10_000;
  while (docker(["exec", container, "/usr/lib/postgresql/17/bin/pg_isready", "-q", "-h", "/tmp", "-U", "postgres"],
    undefined, true).status !== 0) {
    if (Date.now() >= deadline) throw new Error("Isolated PostgreSQL fixture did not become ready");
    await pause(50);
  }
  docker(["exec", "-i", container, "/usr/lib/postgresql/17/bin/psql", "-X", "-q", "-h", "/tmp", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], `
      create role anon; create role authenticated; create role service_role bypassrls;
      create database bagelito_test;
    `);
  sql(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of ["setup-bagelito-reservations.sql", "add-public-api-hardening.sql", "add-payment-provider.sql",
    "add-checkout-safety.sql", "add-culqi-session-expiry.sql", "add-culqi-status-charge-recovery.sql"]) {
    // PG17 provides gen_random_uuid natively. This is the existing fixture-only
    // pgcrypto adaptation, not a change to any RPC implementation.
    const source = (await readFile(path.join(root, "supabase", file), "utf8"))
      .replace(/^create extension if not exists pgcrypto;\s*$/gm, "");
    sql(source);
  }
  // Simulate Supabase project default service SELECT privileges for orders.
  // Runtime operations use SET ROLE service_role; policy/receipt access and
  // function EXECUTE still obey the actual migration's revoked/granted ACLs.
  sql("grant usage on schema public to service_role; grant select on public.orders,public.payment_attempts to service_role;");
  const policy = sql(`select jsonb_build_object('enabled',(select enabled from public.culqi_status_charge_recovery_policy),
    'serviceCannotApprove',not has_table_privilege('service_role','public.culqi_status_charge_recovery_policy','UPDATE'),
    'serviceCannotReadReceipts',not has_table_privilege('service_role','public.culqi_status_charge_receipts','SELECT'),
    'anonCannotConfirm',not has_function_privilege('anon','public.confirm_culqi_status_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','EXECUTE'));`, { json: true });
  assert.deepEqual(policy, { enabled: false, serviceCannotApprove: true, serviceCannotReadReceipts: true, anonCannotConfirm: true });
  sql("update public.culqi_status_charge_recovery_policy set enabled=true;"); // Local synthetic owner approval only.
}

let sequence = 0;
function seed({ state = "pending", expired = false } = {}) {
  sequence++;
  const tag = String(sequence).padStart(3, "0");
  const code = `BAG-HTTP-${tag}`;
  const charge = `chr_test_SYNTHETICHttp${tag}`;
  const source = `ype_test_SYNTHETICHttp${tag}`;
  return sql(`
    do $$ declare b uuid; o uuid; claim jsonb; begin
      insert into public.batches(name,status,capacity_packs,capacity_bagels)
        values('SYNTHETIC HTTP','orders_open',1,6) returning id into b;
      insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
        customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
        payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
      values(b,gen_random_uuid(),${quote(code)},'6-single','6 single',6,'single','Synthetic','000000000',
        'synthetic@example.invalid','Synthetic','Lince',66,'culqi','pending','token',6600,'PEN',
        clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into o;
      perform public.prepare_culqi_token_session(o);
      claim:=public.claim_culqi_charge(o,${quote(source)},'',false);
      if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic claim failed'; end if;
      perform public.finish_culqi_charge(o,(claim->>'attempt_id')::uuid,'submitted',${quote(charge)},'yape','{}');
      ${expired ? "update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o; update public.payment_attempts set expires_at=clock_timestamp()-interval '1 minute' where order_id=o;" : ""}
      ${state === "cancelled" ? "update public.orders set status='cancelled',payment_reconciliation_required=true,payment_reconciliation_reason='payment_after_reservation_release' where id=o;" : ""}
      ${state === "fulfilled" ? "update public.orders set status='in_production',payment_status='paid',payment_paid_at=clock_timestamp() where id=o; update public.payment_attempts set status='paid',paid_at=clock_timestamp() where order_id=o;" : ""}
    end $$;
    select jsonb_build_object('id',id,'session',checkout_session_id,'code',order_code,'charge',payment_charge_id,
      'source',payment_charge_source_id,'batch',batch_id) from public.orders where order_code=${quote(code)};
  `, { json: true });
}
function state(row) {
  return sql(`select jsonb_build_object('payment',o.payment_status,'status',o.status,
    'review',o.payment_reconciliation_required,'reason',o.payment_reconciliation_reason,
    'attemptPaid',(select count(*) from public.payment_attempts where order_id=o.id and status='paid'),
    'receipts',(select count(*) from public.culqi_status_charge_receipts where order_id=o.id),
    'history',(select count(*) from public.order_status_history where order_id=o.id and changed_by='culqi status charge GET'),
    'events',(select count(*) from public.payment_webhook_events),
    'capacity',(select count(*) from public.orders x where x.batch_id=o.batch_id and x.status<>'cancelled'
      and (x.payment_status='paid' or x.payment_status='pending' and x.payment_expires_at>clock_timestamp())))
    from public.orders o where id=${quote(row.id)}::uuid;`, { json: true });
}
const baseEnv = {
  PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: "https://qaahskendqdkynwtylho.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-status-http-service", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_test_SYNTHETICHttp", CULQI_SECRET_KEY: "sk_test_SYNTHETICHttp",
  NEXT_PUBLIC_CULQI_RSA_ID: "synthetic-http-rsa", NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: "synthetic-http-rsa-public",
  PAYMENT_PROVIDER: "culqi", CULQI_MODE: "sandbox", CULQI_ENABLED: "true", CULQI_LIVE_APPROVED: "false",
  CULQI_STATUS_RECOVERY_APPROVED: "true", // Explicit local child only; never a hosting change.
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
  VERCEL_GIT_COMMIT_REF: "fix/culqi-payment-coordination-20261012",
  VERCEL_GIT_REPO_OWNER: "rikrodriguez", VERCEL_GIT_REPO_SLUG: "bagelito-pe", VERCEL_BRANCH_URL: host,
  CULQI_HTTP_FIXTURE_CONTAINER: container, CULQI_HTTP_FIXTURE_DIRECTORY: temporary,
};
async function setMode(mode = "normal") {
  await writeFile(path.join(temporary, "control.json"), JSON.stringify({ mode }), { mode: 0o600 });
  await writeFile(path.join(temporary, "audit.jsonl"), "", { mode: 0o600 });
}
async function audit() {
  const text = await readFile(path.join(temporary, "audit.jsonl"), "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line).kind);
}
async function runtime(overrides, run) {
  const cwd = await mkdtemp(path.join(temporary, "next-"));
  await symlink(path.join(root, ".next"), path.join(cwd, ".next"));
  await symlink(path.join(root, "node_modules"), path.join(cwd, "node_modules"));
  await writeFile(path.join(cwd, "package.json"), '{"private":true}');
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  // Next's request URL is based on its configured public hostname/port. Model
  // the trusted HTTPS proxy metadata while the HTTP listener stays loopback.
  // This uses the unmodified native framework handler and the actual build.
  const runner = path.join(cwd, "native-next.cjs");
  await writeFile(runner, `
    const http = require('node:http');
    const next = require(${JSON.stringify(path.join(root, "node_modules/next"))});
    const application = next({dev:false,dir:${JSON.stringify(cwd)},hostname:${JSON.stringify(host)},port:443});
    application.prepare().then(() => {
      http.createServer(application.getRequestHandler()).listen(${port},'127.0.0.1',() => {
        process.stdout.write('STATUS_HTTP_NATIVE_READY\\n');
      });
    }).catch(() => { process.stderr.write('Local native fixture start failed\\n'); process.exit(1); });
  `);
  const child = spawn(process.execPath, [runner], {
    cwd, env: { ...baseEnv, ...overrides,
      NODE_OPTIONS: `--import=${path.join(root, "tests/fixtures/culqi-status-local-bridge.mjs")}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; }); child.stderr.on("data", (chunk) => { logs += chunk; });
  try {
    const deadline = Date.now() + 15_000;
    while (!logs.includes("STATUS_HTTP_NATIVE_READY")) {
      if (child.exitCode !== null || Date.now() >= deadline) throw new Error("Native Next HTTP fixture failed to start");
      await pause(25);
    }
    await run(port);
    assert.equal([baseEnv.CULQI_SECRET_KEY, baseEnv.SUPABASE_SERVICE_ROLE_KEY, "PRIVATE_SYNTHETIC_HTTP_ERROR"]
      .some((value) => logs.includes(value)), false, "Native runtime logs must not reveal fixture secrets or raw errors");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once("exit", resolve));
    await rm(cwd, { recursive: true, force: true });
  }
}
function call(port, row, { headers = {}, body, method = "POST" } = {}) {
  return new Promise((resolve, reject) => {
    const fields = { host, origin, "x-forwarded-host": host, "x-forwarded-proto": "https", "sec-fetch-site": "same-origin",
      "content-type": "application/json", ...headers };
    const request = httpRequest({ hostname: "127.0.0.1", port, path: "/api/payments/culqi/status", method,
      headers: Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null)), timeout: 15_000 }, (response) => {
      let text = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text,
        data: text ? JSON.parse(text) : null }));
    });
    request.on("error", () => reject(new Error("Native loopback HTTP fixture failed")));
    request.on("timeout", () => request.destroy(new Error("Native loopback HTTP fixture timed out")));
    request.end(method === "POST" ? body ?? JSON.stringify({ orderCode: row.code, checkoutSessionId: row.session }) : undefined);
  });
}
function privateResponse(response, row) {
  assert.match(response.headers["cache-control"] ?? "", /no-store/, "Every status response must disable caching");
  assert.equal([baseEnv.CULQI_SECRET_KEY, baseEnv.SUPABASE_SERVICE_ROLE_KEY, row.session, row.charge, row.source,
    "PRIVATE_SYNTHETIC_HTTP_ERROR", "captureEvidenceVerified", "contract_marker", "payment_charge_attempt_id"]
    .some((value) => response.text.includes(value)), false, "Status response must not expose capability or provider evidence");
}
let started = false;
try {
  await bootDatabase(); started = true;
  await setMode();
  // Test execution below deliberately waits for a build containing the actual
  // recovery implementation; an old /status build must fail its positive case.
  await runtime({}, async (port) => {
    const row = seed();
    const response = await call(port, row); privateResponse(response, row);
    assert.equal(response.status, 200); assert.equal(response.data.paymentStatus, "paid",
      "The actual route and parser must commit the real local recovery transaction");
    assert.equal(response.data.orderStatus, "payment_confirmed");
    const persisted = state(row);
    assert.equal(persisted.payment, "paid"); assert.equal(persisted.status, "payment_confirmed");
    assert.equal(persisted.receipts, 1); assert.equal(persisted.history, 1); assert.equal(persisted.attemptPaid, 1);
    assert.equal(persisted.events, 0); assert.equal(persisted.capacity, 1);
    const operations = await audit();
    assert.equal(operations.filter((kind) => kind === "provider_get").length, 1);
    assert.equal(operations.filter((kind) => kind === "confirm").length, 1); assert.equal(operations.includes("denied"), false);
    await setMode();
    const again = await call(port, row); privateResponse(again, row);
    assert.equal(again.data.paymentStatus, "paid"); assert.deepEqual(state(row), persisted);
    assert.equal((await audit()).filter((kind) => kind === "provider_get").length, 0);

    for (const headers of [
      { origin: undefined }, { origin: "null" }, { origin: "https://wrong.invalid" },
      { host: "wrong.invalid" }, { "x-forwarded-host": "wrong.invalid" },
      { "x-forwarded-host": `${host}, wrong.invalid` }, { "x-forwarded-proto": "http" },
      { "x-forwarded-proto": "https, http" }, { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "none" }, { referer: "https://wrong.invalid/admin" }, { referer: "::invalid" },
    ]) {
      await setMode();
      const blocked = await call(port, row, { headers }); privateResponse(blocked, row);
      assert.equal(blocked.status, 403); assert.deepEqual(await audit(), [], "Origin/CSRF gate must precede all transports");
    }
    for (const body of ["[", "[]", "null", "{}", "x".repeat(2049),
      JSON.stringify({ orderCode: row.code, checkoutSessionId: 1 }),
      JSON.stringify({ orderCode: {}, checkoutSessionId: row.session }),
      JSON.stringify({ orderCode: row.code, checkoutSessionId: row.session, approved: true })]) {
      await setMode();
      const blocked = await call(port, row, { body }); privateResponse(blocked, row);
      assert.equal(blocked.status, 400); assert.deepEqual(await audit(), [], "Invalid body must precede all transports");
    }
    await setMode();
    const wrongType = await call(port, row, { headers: { "content-type": "text/plain" } });
    privateResponse(wrongType, row); assert.equal(wrongType.status, 400); assert.deepEqual(await audit(), []);
    for (const body of [
      JSON.stringify({ orderCode: row.code, checkoutSessionId: "00000000-0000-4000-8000-000000000099" }),
      JSON.stringify({ orderCode: "BAG-HTTP-WRONG", checkoutSessionId: row.session }),
    ]) {
      await setMode();
      const missing = await call(port, row, { body }); privateResponse(missing, row);
      assert.equal(missing.status, 404); assert.deepEqual(await audit(), ["select"], "Wrong owned pair cannot reach expiry or provider");
    }

    for (const mode of ["refund", "dispute", "capture_false", "missing_financial", "source_mismatch", "amount_mismatch", "provider_fail", "provider_oversized", "provider_malformed", "rpc_fail", "stale_attempt"]) {
      const pending = seed(); const before = state(pending); await setMode(mode);
      const observed = await call(port, pending); privateResponse(observed, pending);
      assert.equal(observed.status, 200); assert.equal(observed.data.paymentStatus, "pending");
      assert.deepEqual(state(pending), before, "Adverse/unavailable evidence cannot change financial or reservation state");
      const operations = await audit();
      assert.equal(operations.filter((kind) => kind === "provider_get").length, 1);
      assert.equal(operations.filter((kind) => kind === "confirm").length, mode === "rpc_fail" ? 1 : 0);
      assert.equal(operations.includes("denied"), false);
    }
    const unavailableRate = seed(); const beforeRate = state(unavailableRate); await setMode("rate_fail");
    const rateResponse = await call(port, unavailableRate); privateResponse(rateResponse, unavailableRate);
    assert.equal(rateResponse.data.paymentStatus, "pending"); assert.equal(rateResponse.data.recoveryState, "unavailable");
    assert.deepEqual(state(unavailableRate), beforeRate); assert.equal((await audit()).includes("provider_get"), false);
    assert.equal((await audit()).includes("confirm"), false);

    const rollback = seed(); const beforeRollback = state(rollback);
    sql(`create function public.synthetic_http_history_failure() returns trigger language plpgsql as $$
      begin if new.order_id=${quote(rollback.id)}::uuid then raise exception 'Synthetic local transaction failure'; end if;
        return new; end $$;
      create trigger synthetic_http_history_failure before insert on public.order_status_history
        for each row execute function public.synthetic_http_history_failure();`);
    await setMode();
    const failedCommit = await call(port, rollback); privateResponse(failedCommit, rollback);
    assert.equal(failedCommit.data.paymentStatus, "pending"); assert.deepEqual(state(rollback), beforeRollback,
      "Actual SQL rollback must undo receipt, payment, attempt and history changes");
    assert.equal((await audit()).includes("confirm"), true); assert.equal((await audit()).includes("denied"), false);
    sql("drop trigger synthetic_http_history_failure on public.order_status_history; drop function public.synthetic_http_history_failure();");
    for (const reason of ["known_pending_refund", "known_completed_refund", "known_refund_unknown"]) {
      const pending = seed();
      sql(`update public.orders set payment_reconciliation_required=true,payment_reconciliation_reason=${quote(reason)} where id=${quote(pending.id)}::uuid;`);
      const before = state(pending); await setMode();
      const observed = await call(port, pending); privateResponse(observed, pending);
      assert.equal(observed.data.paymentStatus, "pending"); assert.equal(observed.data.recoveryState, "review_required");
      assert.deepEqual(state(pending), before); assert.equal((await audit()).includes("confirm"), false);
    }
    const lateRefund = seed(); const beforeLateRefund = state(lateRefund); await setMode("sql_known_refund");
    const refundRace = await call(port, lateRefund); privateResponse(refundRace, lateRefund);
    assert.equal(refundRace.data.paymentStatus, "pending"); assert.equal(refundRace.data.recoveryState, "review_required");
    assert.deepEqual(state(lateRefund), { ...beforeLateRefund, review: true, reason: "known_pending_refund" },
      "Known refund committed after the second SELECT must block SQL confirmation without changing capacity or financial state");
    assert.equal((await audit()).includes("confirm"), true); assert.equal((await audit()).includes("denied"), false);
    const throttled = seed(); const beforeThrottle = state(throttled); await setMode("provider_fail");
    const first = await call(port, throttled); privateResponse(first, throttled);
    assert.equal(first.data.recoveryState, "deferred"); assert.equal((await audit()).includes("provider_get"), true);
    await setMode();
    const second = await call(port, throttled); privateResponse(second, throttled);
    assert.equal(second.data.recoveryState, "deferred"); assert.equal((await audit()).includes("provider_get"), false);
    assert.equal((await audit()).includes("confirm"), false); assert.deepEqual(state(throttled), beforeThrottle);

    const race = seed(); await setMode("parallel");
    const raced = await Promise.all([call(port, race), call(port, race)]);
    for (const response of raced) privateResponse(response, race);
    const afterRace = state(race);
    assert.equal(afterRace.payment, "paid"); assert.equal(afterRace.receipts, 1); assert.equal(afterRace.history, 1);
    assert.equal((await audit()).filter((kind) => kind === "provider_get").length, 1);
    assert.equal((await audit()).filter((kind) => kind === "confirm").length, 1);
    assert.equal((await audit()).includes("provider_wait"), true);
    assert.equal((await audit()).includes("parallel_budget_rejected"), true,
      "A second request must hit the real rejected SQL budget while the first provider GET remains pending");

    const expired = seed({ expired: true }); await setMode();
    const late = await call(port, expired); privateResponse(late, expired);
    const lateState = state(expired);
    assert.equal(late.data.paymentStatus, "paid"); assert.equal(late.data.orderStatus, "cancelled");
    assert.equal(late.data.reconciliationRequired, true); assert.equal(lateState.capacity, 0);
    assert.equal(lateState.reason, "payment_after_reservation_release"); assert.equal(lateState.receipts, 1);
    const cancelled = seed({ state: "cancelled" }); await setMode();
    const cancelledResponse = await call(port, cancelled); privateResponse(cancelledResponse, cancelled);
    assert.equal(cancelledResponse.data.paymentStatus, "paid"); assert.equal(cancelledResponse.data.orderStatus, "cancelled");
    assert.equal(cancelledResponse.data.reconciliationRequired, true); assert.equal(state(cancelled).capacity, 0);

    const fulfilled = seed({ state: "fulfilled" }); const beforeFulfilled = state(fulfilled); await setMode();
    const fulfilledResponse = await call(port, fulfilled); privateResponse(fulfilledResponse, fulfilled);
    assert.equal(fulfilledResponse.data.paymentStatus, "paid"); assert.equal(fulfilledResponse.data.orderStatus, "in_production");
    assert.deepEqual(state(fulfilled), beforeFulfilled); assert.equal((await audit()).includes("provider_get"), false);
    assert.equal((await audit()).includes("confirm"), false);

    sql("update public.culqi_status_charge_recovery_policy set enabled=false;");
    const disabledPolicy = seed(); const beforePolicy = state(disabledPolicy); await setMode();
    const policyResponse = await call(port, disabledPolicy); privateResponse(policyResponse, disabledPolicy);
    assert.equal(policyResponse.data.paymentStatus, "pending"); assert.deepEqual(state(disabledPolicy), beforePolicy);
    assert.equal((await audit()).includes("confirm"), true);
    sql("update public.culqi_status_charge_recovery_policy set enabled=true;");
  });

  for (const overrides of [
    { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" },
    { VERCEL_PROJECT_ID: "" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: "" }, { CULQI_SECRET_KEY: "sk_live_SYNTHETICHttp" },
  ]) await runtime(overrides, async (port) => {
    const row = seed(); const before = state(row); await setMode();
    const blocked = await call(port, row); privateResponse(blocked, row);
    assert.equal(blocked.status, 503); assert.deepEqual(await audit(), []); assert.deepEqual(state(row), before);
  });
  for (const CULQI_STATUS_RECOVERY_APPROVED of ["false", ""]) {
    await runtime({ CULQI_STATUS_RECOVERY_APPROVED }, async (port) => {
      const row = seed(); const before = state(row); await setMode();
      const legacy = await call(port, row); privateResponse(legacy, row);
      assert.equal(legacy.status, 200); assert.equal(legacy.data.paymentStatus, "pending");
      assert.deepEqual(state(row), before); assert.deepEqual(await audit(), ["select", "expiry"]);
    });
  }
  console.log("PASS: native Next status HTTP + actual local PostgreSQL confirmation; real parser, synthetic provider GET, no external network.");
} finally {
  // Cleanup remains local even when setup/assertions fail. No workers, ports,
  // persisted database, credentials or cookies survive this fixture.
  if (started || container) docker(["rm", "-f", container], undefined, true);
  await rm(temporary, { recursive: true, force: true });
}
