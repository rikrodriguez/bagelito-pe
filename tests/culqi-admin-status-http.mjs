// Native compiled Next Server Action + /status + actual PostgreSQL transaction. Only transport
// capabilities are replaced: Supabase HTTP is bridged to isolated local SQL,
// and Culqi GET returns synthetic observations. No source or parser is changed.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
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
const container = `bagelito-admin-status-http-${randomBytes(8).toString("hex")}`;
const manifest = JSON.parse(await readFile(path.join(root, ".next/server/server-reference-manifest.json"), "utf8"));
const compiledAction = Object.entries(manifest.node).find(([, entry]) =>
  entry.filename === "app/admin/culqi-status-actions.ts" && entry.exportedName === "runCulqiExistingOrderStatus");
assert.ok(compiledAction, "Build must contain the actual administrative existing-order status action");
const actionId = compiledAction[0];
const password = `SyntheticLocalAdmin-${randomBytes(20).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
// Build the real v1 HMAC session format without importing .env or storing a cookie.
// requireAdmin and verifyAdminSession remain the compiled production implementation.
const issued = Math.floor(Date.now() / 1000);
const sessionBody = `v1.${issued}.${issued + 8 * 60 * 60}.${randomBytes(24).toString("base64url")}`;
const signingKey = createHmac("sha256", secret).update(password).digest();
const cookie = `${sessionBody}.${createHmac("sha256", signingKey).update(`bagelito-admin:${origin}:${sessionBody}`).digest("base64url")}`;
const temporary = await mkdtemp(path.join(tmpdir(), "bagelito-admin-status-http-"));
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
    "add-checkout-safety.sql", "add-culqi-session-expiry.sql", "add-culqi-retry-pending-state.sql", "add-culqi-status-charge-recovery.sql"]) {
    // PG17 provides gen_random_uuid natively. This is the existing fixture-only
    // pgcrypto adaptation, not a change to any RPC implementation.
    const source = (await readFile(path.join(root, "supabase", file), "utf8"))
      .replace(/^create extension if not exists pgcrypto;\s*$/gm, "");
    sql(source);
  }
  // Simulate Supabase project default service SELECT privileges for orders.
  // Runtime operations use SET ROLE service_role; policy/receipt access and
  // function EXECUTE still obey the actual migration's revoked/granted ACLs.
  sql("grant usage on schema public to service_role; grant select on public.batches,public.orders,public.payment_attempts,public.order_items,public.order_status_history to service_role;");
  const policy = sql(`select jsonb_build_object('enabled',(select enabled from public.culqi_status_charge_recovery_policy),
    'serviceCannotApprove',not has_table_privilege('service_role','public.culqi_status_charge_recovery_policy','UPDATE'),
    'serviceCannotReadReceipts',not has_table_privilege('service_role','public.culqi_status_charge_receipts','SELECT'),
    'anonCannotConfirm',not has_function_privilege('anon','public.confirm_culqi_status_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','EXECUTE'));`, { json: true });
  assert.deepEqual(policy, { enabled: false, serviceCannotApprove: true, serviceCannotReadReceipts: true, anonCannotConfirm: true });
  sql("update public.culqi_status_charge_recovery_policy set enabled=true;"); // Local synthetic owner approval only.
}

const approvedCodes = ["BAG-000001", "BAG-000002", "BAG-000004"];
function seed(code, chargePresent = true) {
  assert.match(code, /^BAG-00000[1-4]$|^BAG-000099$/);
  const tag = code.slice(4);
  const charge = `chr_test_SYNTHETICHttp${tag}`;
  const source = `ype_test_SYNTHETICHttp${tag}`;
  return sql(`do $$ declare b uuid; o uuid; claim jsonb; begin
    insert into public.batches(name,status,capacity_packs,capacity_bagels)
      values('SYNTHETIC ADMIN HTTP','orders_open',1,6) returning id into b;
    insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
      payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values(b,gen_random_uuid(),${quote(code)},'6-single','6 single',6,'single','Synthetic','000000000',
      'synthetic@example.invalid','Synthetic','Lince',66,'culqi','pending','token',6600,'PEN',
      clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into o;
    perform public.prepare_culqi_token_session(o);
    ${chargePresent ? `claim:=public.claim_culqi_charge(o,${quote(source)},'',false);
      if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic claim failed'; end if;
      perform public.finish_culqi_charge(o,(claim->>'attempt_id')::uuid,'submitted',${quote(charge)},'yape','{}');` : ""}
    update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
    update public.payment_attempts set expires_at=clock_timestamp()-interval '1 minute' where order_id=o;
  end $$;
  select jsonb_build_object('id',id,'session',checkout_session_id,'code',order_code,'charge',payment_charge_id,
    'source',payment_charge_source_id,'batch',batch_id) from public.orders where order_code=${quote(code)};`, { json: true });
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
const snapshotTables = ["batches", "orders", "order_items", "payment_attempts", "order_status_history",
  "culqi_status_charge_receipts", "payment_webhook_events", "api_rate_limits", "culqi_status_charge_recovery_policy"];
function databaseSnapshot() {
  return sql(`select jsonb_build_object(${snapshotTables.map((table) =>
    `${quote(table)},(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from public.${table} r)`
  ).join(",")});`, { json: true });
}
function protectedSnapshot(rows) {
  const snapshot = databaseSnapshot();
  const ids = new Set(rows.map((row) => row.id));
  const batches = new Set(rows.map((row) => row.batch));
  return {
    batches: snapshot.batches.filter((row) => batches.has(row.id)),
    orders: snapshot.orders.filter((row) => ids.has(row.id)),
    ...Object.fromEntries(["order_items", "payment_attempts", "order_status_history", "culqi_status_charge_receipts"]
      .map((table) => [table, snapshot[table].filter((row) => ids.has(row.order_id))])),
    events: snapshot.payment_webhook_events,
    policy: snapshot.culqi_status_charge_recovery_policy,
  };
}
const baseEnv = {
  PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret,
  NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: "https://qaahskendqdkynwtylho.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-admin-status-http-service", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_test_SYNTHETICHttp", CULQI_SECRET_KEY: "sk_test_SYNTHETICHttp",
  NEXT_PUBLIC_CULQI_RSA_ID: "synthetic-http-rsa", NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: "synthetic-http-rsa-public",
  PAYMENT_PROVIDER: "culqi", CULQI_MODE: "sandbox", CULQI_ENABLED: "true", CULQI_LIVE_APPROVED: "false",
  CULQI_STATUS_RECOVERY_APPROVED: "true", // Local synthetic child only.
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
  VERCEL_GIT_COMMIT_REF: "fix/culqi-payment-coordination-20261012",
  VERCEL_GIT_REPO_OWNER: "rikrodriguez", VERCEL_GIT_REPO_SLUG: "bagelito-pe", VERCEL_BRANCH_URL: host,
  CULQI_HTTP_FIXTURE_CONTAINER: container, CULQI_HTTP_FIXTURE_DIRECTORY: temporary,
};
async function resetAudit() {
  await writeFile(path.join(temporary, "audit.jsonl"), "", { mode: 0o600 });
}
async function audit() {
  return (await readFile(path.join(temporary, "audit.jsonl"), "utf8"))
    .split("\n").filter(Boolean).map((line) => JSON.parse(line).kind);
}
async function assertPageAudit(pageReads) {
  const entries = (await readFile(path.join(temporary, "audit.jsonl"), "utf8"))
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(entries.filter((entry) => entry.kind === "page_select").length, pageReads);
  assert.ok(entries.every((entry) => ["layout_select", "page_select"].includes(entry.kind)),
    `Page rendering may only read synthetic records; transport entries: ${JSON.stringify(entries)}`);
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
  const runner = path.join(cwd, "native-next.cjs");
  // Model the trusted canonical HTTPS proxy while listening only on loopback.
  // Neither application source nor the Next handler is rewritten or replaced.
  await writeFile(runner, `
    const http = require('node:http');
    const next = require(${JSON.stringify(path.join(root, "node_modules/next"))});
    const application = next({dev:false,dir:${JSON.stringify(cwd)},hostname:${JSON.stringify(host)},port:443});
    application.prepare().then(() => {
      http.createServer(application.getRequestHandler()).listen(${port},'127.0.0.1',() => {
        process.stdout.write('ADMIN_STATUS_HTTP_NATIVE_READY\\n');
      });
    }).catch(() => { process.stderr.write('Local native fixture start failed\\n'); process.exit(1); });
  `);
  const child = spawn(process.execPath, [runner], {
    cwd, env: { ...baseEnv, ...overrides,
      NODE_OPTIONS: `--import=${path.join(root, "tests/fixtures/culqi-admin-status-local-bridge.mjs")}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; }); child.stderr.on("data", (chunk) => { logs += chunk; });
  try {
    const deadline = Date.now() + 15_000;
    while (!logs.includes("ADMIN_STATUS_HTTP_NATIVE_READY")) {
      if (child.exitCode !== null || Date.now() >= deadline) throw new Error("Native Next administrative HTTP fixture failed to start");
      await pause(25);
    }
    await run(port);
    assert.equal([cookie, password, secret, baseEnv.CULQI_SECRET_KEY, baseEnv.SUPABASE_SERVICE_ROLE_KEY,
      "PRIVATE_SYNTHETIC_HTTP_ERROR"].some((value) => logs.includes(value)), false,
    "Native runtime logs must not reveal fixture sessions, secrets or raw transport errors");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once("exit", resolve));
    await rm(cwd, { recursive: true, force: true });
  }
}
function call(port, row, { authenticated = true, headers = {}, payload = { orderCode: row.code },
  previousState = null, method = "POST", rsc = false } = {}) {
  return new Promise((resolve, reject) => {
    const fields = { host, origin, "x-forwarded-host": host, "x-forwarded-proto": "https", "sec-fetch-site": "same-origin",
      ...(method === "POST" ? { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" } : {}),
      ...(rsc ? { rsc: "1" } : {}), ...(authenticated ? { cookie: `bagelito_admin=${cookie}` } : {}), ...headers };
    const request = httpRequest({ hostname: "127.0.0.1", port, path: `/admin/orders/${row.code}`, method,
      headers: Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null)), timeout: 15_000 }, (response) => {
      let text = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        const dto = text.split("\n").flatMap((line) => {
          const match = /^[0-9a-f]+:(\{.*\})$/.exec(line);
          if (!match) return [];
          try { const value = JSON.parse(match[1]); return typeof value.ok === "boolean" ? [value] : []; }
          catch { return []; }
        });
        resolve({ status: response.statusCode, headers: response.headers, text, data: dto[0] });
      });
    });
    request.on("error", () => reject(new Error("Native loopback administrative HTTP fixture failed")));
    request.on("timeout", () => request.destroy(new Error("Native loopback administrative HTTP fixture timed out")));
    request.end(method === "POST" ? JSON.stringify([previousState, payload]) : undefined);
  });
}
function privateAction(response, rows) {
  assert.match(response.headers["cache-control"] ?? "", /no-store/);
  assert.equal([cookie, password, secret, baseEnv.CULQI_SECRET_KEY, baseEnv.SUPABASE_SERVICE_ROLE_KEY,
    ...rows.flatMap((row) => [row.session, row.id, row.charge, row.source].filter(Boolean)),
    "PRIVATE_SYNTHETIC_HTTP_ERROR", "captureEvidenceVerified", "contract_marker", "payment_charge_attempt_id"]
    .some((value) => response.text.includes(value)), false, "Action response cannot expose capabilities or provider evidence");
  if (response.status === 200) {
    assert.match(response.text, /"f":""/, "Fetch action must skip administrative page rendering");
    assert.ok(response.data, "Native response must contain a closed action result");
    assert.ok(Object.keys(response.data).every((key) => ["ok", "paymentStatus", "orderStatus", "reconciliationRequired",
      "recoveryState", "retryAfterSeconds"].includes(key)), "Action DTO has an unapproved field");
  }
}
function closedSuccess(response) {
  assert.equal(response.status, 200); assert.equal(response.data.ok, true);
  assert.equal(response.data.paymentStatus, "paid"); assert.equal(response.data.orderStatus, "cancelled");
  assert.equal(response.data.reconciliationRequired, true);
  assert.ok(["confirmed", "already_paid", "review_required", "deferred", "unavailable", "skipped"]
    .includes(response.data.recoveryState), "Recovery state must be closed");
  assert.ok(response.data.retryAfterSeconds === undefined || Number.isSafeInteger(response.data.retryAfterSeconds));
}

try {
  await bootDatabase();
  const rows = [...approvedCodes.map((code) => seed(code)), seed("BAG-000003", false), seed("BAG-000099")];
  const target = rows[0];
  const protectedRows = rows.filter((row) => !approvedCodes.includes(row.code));
  const protectedState = protectedSnapshot(protectedRows);
  await resetAudit();
  await runtime({}, async (port) => {
    const before = databaseSnapshot();
    const unauthenticatedPage = await call(port, target, { method: "GET", authenticated: false });
    assert.equal(unauthenticatedPage.status, 307); assert.match(unauthenticatedPage.headers.location ?? "", /\/admin\/login/);
    await assertPageAudit(0); assert.deepEqual(databaseSnapshot(), before);
    for (const row of rows) {
      await resetAudit();
      const page = await call(port, row, { method: "GET" });
      assert.equal(page.status, 200, "Real administrative detail GET must render synthetic relational records");
      assert.equal(page.text.includes("Consultar estado Culqi"), approvedCodes.includes(row.code),
        "Only the three approved order details may render the status button");
      if (approvedCodes.includes(row.code)) assert.match(page.text, /<button[^>]*type="button"[^>]*>Consultar estado Culqi<\/button>/);
      assert.equal(rows.some((record) => page.text.includes(record.session)), false, "Checkout capability cannot enter page HTML or inline RSC");
      await assertPageAudit(2);
      assert.deepEqual(databaseSnapshot(), before);
      await resetAudit();
      const flight = await call(port, row, { method: "GET", rsc: true });
      assert.equal(flight.status, 200); assert.match(flight.headers["content-type"] ?? "", /text\/x-component/);
      assert.equal(flight.text.includes("CulqiExistingStatusButton"), approvedCodes.includes(row.code),
        "Only approved RSC navigation responses may reference the status control");
      assert.equal(rows.some((record) => flight.text.includes(record.session)), false, "Checkout capability cannot enter an RSC navigation response");
      await assertPageAudit(2); assert.deepEqual(databaseSnapshot(), before);
    }
    const blockers = [
      { authenticated: false }, { headers: { cookie: "bagelito_admin=invalid" } },
      { headers: { origin: undefined } }, { headers: { origin: "null" } },
      { headers: { origin: "https://wrong.invalid" } }, { headers: { host: "wrong.invalid" } },
      { headers: { "x-forwarded-host": "wrong.invalid" } },
      { headers: { "x-forwarded-host": `${host}, wrong.invalid` } },
      { headers: { "x-forwarded-proto": "http" } }, { headers: { "x-forwarded-proto": "https, http" } },
      { headers: { "sec-fetch-site": "cross-site" } }, { headers: { "sec-fetch-site": "none" } },
      { headers: { referer: "https://wrong.invalid/admin" } }, { headers: { referer: "::invalid" } },
      ...[null, [], {}, { orderCode: 1 }, { orderCode: {} }, { orderCode: "BAG-000003" },
        { orderCode: "BAG-000099" }, { orderCode: "BAG-999999" }, { orderCode: "bag-000001" },
        { orderCode: " BAG-000001" }, { orderCode: target.code, checkoutSessionId: target.session },
        { orderCode: target.code, approved: true }].map((payload) => ({ payload })),
    ];
    for (const options of blockers) {
      await resetAudit();
      const blocked = await call(port, target, options); privateAction(blocked, rows);
      if (blocked.status === 200) assert.equal(blocked.data.ok, false);
      else assert.ok(blocked.status >= 400, "Framework rejection must not succeed");
      assert.deepEqual(await audit(), [], "Auth, CSRF, payload and allowlist gates must precede every transport");
      assert.deepEqual(databaseSnapshot(), before, "Blocked request must preserve every fixture row, receipt, rate bucket and timestamp");
    }
    for (const row of rows.filter((record) => approvedCodes.includes(record.code))) {
      await resetAudit();
      // Caller state is display state only and cannot supply a checkout capability.
      const recovered = await call(port, row, { previousState: { checkoutSessionId: protectedRows[0].session, approved: true } });
      privateAction(recovered, rows); closedSuccess(recovered);
      assert.deepEqual(state(row), { payment: "paid", status: "cancelled", review: true,
        reason: "payment_after_reservation_release", attemptPaid: 1, receipts: 1, history: 1, events: 0, capacity: 0 });
      const operations = await audit();
      assert.equal(operations.filter((kind) => kind === "admin_pair_select").length, 1);
      assert.equal(operations.filter((kind) => kind === "provider_get").length, 1);
      assert.equal(operations.filter((kind) => kind === "confirm").length, 1);
      assert.equal(operations.includes("denied"), false); assert.equal(operations.includes("page_select"), false);
      const persisted = databaseSnapshot();
      await resetAudit();
      const repeated = await call(port, row); privateAction(repeated, rows); closedSuccess(repeated);
      assert.deepEqual(databaseSnapshot(), persisted, "Repeated paid action must preserve all SQL rows and timestamps");
      assert.equal((await audit()).includes("provider_get"), false); assert.equal((await audit()).includes("confirm"), false);
      assert.equal((await audit()).includes("rate"), false); assert.equal((await audit()).includes("page_select"), false);
      assert.deepEqual(protectedSnapshot(protectedRows), protectedState,
        "BAG-000003, other codes, related rows, policy, webhooks and all their timestamps cannot change");
    }
  });
  for (const overrides of [
    { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" }, { VERCEL_PROJECT_ID: "" },
    { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_GIT_REPO_OWNER: "wrong" }, { VERCEL_GIT_REPO_SLUG: "wrong" },
    { VERCEL_BRANCH_URL: "wrong.invalid" }, { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" },
    { NEXT_PUBLIC_SITE_URL: "https://wrong.invalid" }, { CULQI_MODE: "production" }, { CULQI_LIVE_APPROVED: "true" },
    { PAYMENT_PROVIDER: "manual" }, { CULQI_ENABLED: "false" }, { NEXT_PUBLIC_CULQI_PUBLIC_KEY: "" },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_live_SYNTHETICHttp" }, { CULQI_SECRET_KEY: "" },
    { CULQI_SECRET_KEY: "sk_live_SYNTHETICHttp" }, { CULQI_STATUS_RECOVERY_APPROVED: "false" },
    { CULQI_STATUS_RECOVERY_APPROVED: undefined }, { ADMIN_PASSWORD: undefined }, { ADMIN_SESSION_SECRET: undefined },
  ]) await runtime(overrides, async (port) => {
    const before = databaseSnapshot(); await resetAudit();
    const blocked = await call(port, target); privateAction(blocked, rows);
    assert.equal(blocked.status, 200); assert.equal(blocked.data.ok, false);
    assert.deepEqual(await audit(), []); assert.deepEqual(databaseSnapshot(), before);
  });
  console.log("PASS: native compiled Next administrative action + real status POST/parser + isolated PostgreSQL; three approved late payments, private HTML/RSC/DTO, zero-effect gates, idempotent retries, no external network.");
} finally {
  docker(["rm", "-f", container], undefined, true);
  await rm(temporary, { recursive: true, force: true });
}
