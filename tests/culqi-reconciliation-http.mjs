import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { isIP } from "node:net";
import { createServer, request as httpRequest } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { getCulqiReadonlyDiagnosticScope } from "../src/lib/payments/culqi-readonly-diagnostic.ts";
import { validateCulqiCapturedCharge } from "../src/lib/payments/culqi-capture-evidence.ts";

// Isolated HTTP/proxy fixture for an UNWIRED factory, not a Next route test.
// Only loopback HTTP is real. Auth, cookies and CSRF are synthetic in memory;
// config, SELECT and provider GET capabilities are mocks. No application gate
// or capture contract is replaced: the actual engine and parser run unchanged.
globalThis.fetch = () => { throw new Error("Unexpected external fetch"); };
const ROOT = new URL("../", import.meta.url);
async function load(file, imports, name) {
  const source = await readFile(new URL(file, ROOT), "utf8");
  const syntaxOnly = stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?;\s*/gm, ""))
    .replace(/^export /gm, "");
  return { source, value: new Function(...Object.keys(imports), `${syntaxOnly}; return ${name};`)(...Object.values(imports)) };
}
const login = await load("src/lib/admin/login-security.ts", { createHash, isIP }, "hasStrongAdminPassword");
const session = await load("src/lib/admin/session-security.ts", {
  createHmac, randomBytes, timingSafeEqual, hasStrongAdminPassword: login.value,
}, "({issueAdminSession, verifyAdminSession})");
const engine = await load("src/lib/payments/culqi-charge-reconciliation.ts", {
  getCulqiReadonlyDiagnosticScope, validateCulqiCapturedCharge,
}, "createCulqiChargeReconciliation");
const adapter = await load("src/lib/payments/culqi-reconciliation-http-adapter.ts", {
  createCulqiChargeReconciliation: engine.value,
}, "createCulqiReconciliationHttpHandler");
assert.ok(/APPLICATION_APPROVED\s*=\s*false/.test(engine.source), "Application approval must remain closed");
assert.ok(/parse:\s*validateCulqiCapturedCharge/.test(engine.source), "Real capture parser must remain installed");
assert.equal(/export\s+(?:async\s+)?function\s+(?:GET|POST)|["']use server["']/.test(adapter.source), false,
  "The factory must stay unwired");

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const PATH = "/unwired-http-fixture";
const codes = ["BAG-000001", "BAG-000002", "BAG-000004"];
const labels = ["qa_yape", "qa_visa", "qa_3ds"];
const chargeIds = ["chr_test_WIu0Hn7e9r2MqEue", "chr_test_BGmSf0LA6lKdxdcz", "chr_test_SA3U26iSk7KDn0BI"];
const password = `LocalFixture-${randomBytes(24).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const adminToken = session.value.issueAdminSession(password, secret, ORIGIN);
const csrfToken = randomBytes(32).toString("hex");
const secretSentinel = `sk_test_${randomBytes(24).toString("hex")}`;
const privateSentinel = "PRIVATE_FIXTURE_ERROR_EMAIL_CARD_PAYLOAD";
const uuid = (group, i) => `${group.repeat(8)}-${group.repeat(4)}-4${group.repeat(3)}-8${group.repeat(3)}-${String(i + 1).padStart(12, "0")}`;
function envFixture() {
  return {
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
    VERCEL_GIT_COMMIT_REF: "fix/culqi-payment-coordination-20261012",
    VERCEL_GIT_REPO_OWNER: "rikrodriguez", VERCEL_GIT_REPO_SLUG: "bagelito-pe",
    VERCEL_BRANCH_URL: HOST, NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: "https://qaahskendqdkynwtylho.supabase.co",
    CULQI_MODE: "sandbox", CULQI_LIVE_APPROVED: "false", CULQI_ENABLED: "true",
    PAYMENT_PROVIDER: "culqi", NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_test_OFFLINEPublicKey",
    CULQI_SECRET_KEY: secretSentinel,
  };
}
function snapshotFixture(i) {
  return {
    order: {
      id: uuid("1", i), checkout_session_id: uuid("2", i), order_code: codes[i],
      payment_provider: "culqi", payment_lane: "token", payment_order_id: null,
      payment_charge_id: chargeIds[i], payment_charge_attempt_id: uuid("3", i),
      payment_charge_source_id: `${i === 0 ? "ype" : "tkn"}_test_OFFLINESource${i}`,
      payment_amount_minor: 6600, payment_currency: "PEN", payment_charge_state: "submitted",
      payment_status: "pending", status: "payment_pending_review",
      payment_reconciliation_required: false, payment_reconciliation_reason: null,
    },
    attempt: {
      id: uuid("4", i), order_id: uuid("1", i), provider: "culqi", provider_order_id: null,
      provider_charge_id: chargeIds[i], amount_minor: 6600, currency_code: "PEN", status: "pending",
    },
  };
}
function chargeFixture(i) {
  return {
    object: "charge", id: chargeIds[i], amount: 6600, currency_code: "PEN",
    source: { id: snapshotFixture(i).order.payment_charge_source_id, customer: privateSentinel },
    metadata: { bagelito_order_code: codes[i], other: privateSentinel },
    capture: true, current_amount: 6600, amount_refunded: 0, dispute: false,
    capture_date: "opaque-units", paid: false,
    operations: [{ arbitrary: privateSentinel }], outcome: { user_message: privateSentinel },
  };
}
function harness(options = {}) {
  const state = { auth: 0, csrf: 0, config: 0, keyReads: 0, reads: [], gets: [], rpc: 0,
    logs: [], escaped: false, rawRequest: null, requestURL: options.requestURL ?? `${ORIGIN}${PATH}` };
  const environment = { ...envFixture(), ...options.env };
  const deps = {
    requireAdmin: async (request) => {
      state.auth++; state.rawRequest = request;
      if (options.authThrows) throw new Error(privateSentinel);
      const token = /(?:^|;\s*)bagelito_admin=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
      if (!session.value.verifyAdminSession(token, password, secret, ORIGIN)) throw new Error(privateSentinel);
    },
    verifyActionCsrf: async (request) => {
      state.csrf++;
      assert.equal(request === state.rawRequest, true, "CSRF must receive the original Request");
      if (options.csrfThrows) throw new Error(privateSentinel);
      const value = request.headers.get("x-fixture-csrf") ?? "";
      const actual = Buffer.from(value); const expected = Buffer.from(csrfToken);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
    readConfig: async () => {
      state.config++;
      if (options.configThrows) throw new Error(privateSentinel);
      return new Proxy(environment, { get(target, prop) {
        if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") state.keyReads++;
        return target[prop];
      } });
    },
    readPersistedOrder: async (code) => {
      state.reads.push(code);
      if (options.readThrows) throw new Error(privateSentinel);
      const index = codes.indexOf(code);
      assert.ok(index >= 0, "Only fixed persisted QA references may be read");
      const row = snapshotFixture(index);
      options.mutateRow?.(row, index, state.reads.filter((value) => value === code).length);
      return row;
    },
    fetch: async (url, init) => {
      state.gets.push({ url, init });
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(init.signal instanceof AbortSignal, true);
      assert.equal(init.headers.Authorization === `Bearer ${secretSentinel}`, true, "Only synthetic test credentials may be used");
      const index = chargeIds.findIndex((id) => url === `https://api.culqi.com/v2/charges/${id}`);
      assert.ok(index >= 0, "Only the three fixed provider GET paths may be used");
      if (options.fetchThrows) throw new Error(privateSentinel);
      const charge = chargeFixture(index); options.mutateCharge?.(charge, index);
      return Response.json(charge);
    },
    applyVerifiedCharge: async () => { state.rpc++; throw new Error("Closed application barrier reached"); },
    safeLog: (label, report) => {
      state.logs.push({ label, report });
      if (options.logThrows) throw new Error(privateSentinel);
    },
  };
  return { state, handler: adapter.value(deps) };
}

let active;
const server = createServer(async (incoming, outgoing) => {
  try {
    assert.equal(incoming.socket.remoteAddress === "127.0.0.1", true);
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.ok(body.length <= 8192, "Fixture request must remain bounded");
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const request = new Request(active.state.requestURL, {
      method: incoming.method, headers,
      ...(!["GET", "HEAD"].includes(incoming.method) && body.length > 0 ? { body } : {}),
    });
    const response = await active.handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch {
    if (active) active.state.escaped = true;
    outgoing.writeHead(500, { "Content-Type": "application/json" }); outgoing.end('{"ok":false}');
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
after(async () => { await new Promise((resolve) => server.close(resolve)); });
const port = server.address().port;
function invoke(h, { method = "POST", headers = {}, body = "", authenticated = true } = {}) {
  active = h;
  const outgoing = {
    host: HOST, origin: ORIGIN, "x-forwarded-host": HOST, "x-forwarded-proto": "https",
    "sec-fetch-site": "same-origin", referer: `${ORIGIN}/admin`,
    "x-fixture-csrf": csrfToken,
    ...(authenticated ? { cookie: `bagelito_admin=${adminToken}` } : {}),
    ...headers,
  };
  for (const key of Object.keys(outgoing)) if (outgoing[key] === null) delete outgoing[key];
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path: PATH, method, headers: outgoing }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", () => reject(new Error("Loopback fixture transport failed")));
    request.end(body);
  });
}
function safeOutput(response, h, expectedOk = false, head = false) {
  assert.equal(response.text === (head ? "" : JSON.stringify({ ok: expectedOk })), true,
    "HTTP response must contain only the safe boolean (HEAD has no body)");
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.equal(response.headers["pragma"], "no-cache");
  assert.equal(response.headers["expires"], "0");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(h.state.escaped, false); assert.equal(h.state.rpc, 0);
  const output = JSON.stringify({ response, logs: h.state.logs });
  const forbidden = [password, secret, adminToken, csrfToken, secretSentinel, privateSentinel,
    ...codes, ...chargeIds, "opaque-units", "Bearer", "culqi_charge_get_reviewed_net_v1",
    ...codes.flatMap((_, i) => [uuid("1", i), uuid("2", i), uuid("3", i), uuid("4", i),
      snapshotFixture(i).order.payment_charge_source_id])];
  assert.equal(forbidden.some((value) => output.includes(value)), false, "Response/private report must exclude payloads and identifiers");
  for (const { label, report } of h.state.logs) {
    assert.equal(label, "culqi_charge_reconciliation");
    assert.equal(report.applicationApproved, false); assert.equal(report.merchantAssociationVerified, false);
    for (const result of Object.values(report.results)) {
      assert.equal(result.transactionAttempted, false); assert.equal(result.transactionApplied, false);
      for (const [key, value] of Object.entries(result)) if (key !== "status") assert.equal(typeof value, "boolean");
    }
  }
}
function noReads(h, { config = 0, logs = 0 } = {}) {
  assert.equal(h.state.config, config); assert.equal(h.state.keyReads, 0);
  assert.equal(h.state.reads.length, 0); assert.equal(h.state.gets.length, 0);
  assert.equal(h.state.logs.length, logs); assert.equal(h.state.rpc, 0);
}

test("unauthenticated HTTP is rejected before CSRF, configuration, SELECT, provider and logs", async () => {
  const h = harness(); const response = await invoke(h, { authenticated: false });
  assert.equal(response.status, 401); assert.equal(h.state.auth, 1); assert.equal(h.state.csrf, 0);
  noReads(h); safeOutput(response, h);
});
test("forged synthetic cookie and raw auth exception remain private", async () => {
  for (const options of [{}, { authThrows: true }]) {
    const h = harness(options); const response = await invoke(h, { headers: { cookie: "bagelito_admin=forged" } });
    assert.equal(response.status, 401); assert.equal(h.state.csrf, 0); noReads(h); safeOutput(response, h);
  }
});
test("direct denied auth never accesses Request metadata", async () => {
  let accessed = 0;
  const request = new Proxy({}, { get() { accessed++; throw new Error(privateSentinel); } });
  const h = harness({ authThrows: true }); const response = await h.handler(request);
  assert.equal(response.status, 401); assert.equal(accessed, 0); noReads(h);
});
test("authenticated GET and HEAD reject before CSRF/config with no-store", async () => {
  for (const method of ["GET", "HEAD"]) {
    const h = harness(); const response = await invoke(h, { method });
    assert.equal(response.status, 405); assert.equal(response.headers.allow, "POST");
    assert.equal(h.state.csrf, 0); noReads(h);
    safeOutput(response, h, false, method === "HEAD");
  }
});
for (const [name, headers] of [
  ["missing Origin", { origin: null }], ["null Origin", { origin: "null" }],
  ["wrong Origin", { origin: "https://foreign.invalid" }], ["HTTP Origin", { origin: ORIGIN.replace("https:", "http:") }],
  ["wrong Host despite canonical forwarded Host", { host: "foreign.invalid" }],
  ["missing canonical Host", { host: null }], ["wrong forwarded Host", { "x-forwarded-host": "foreign.invalid" }],
  ["forwarded Host list", { "x-forwarded-host": `${HOST}, foreign.invalid` }],
  ["HTTP forwarded protocol", { "x-forwarded-proto": "http" }], ["forwarded protocol list", { "x-forwarded-proto": "https, http" }],
  ["cross-site", { "sec-fetch-site": "cross-site" }], ["Fetch-Site none", { "sec-fetch-site": "none" }],
  ["wrong Referer", { referer: "https://foreign.invalid/admin" }], ["malformed Referer", { referer: "::invalid" }],
  ["Referer userinfo", { referer: ORIGIN.replace("https://", "https://user:pass@") }],
]) test(`${name} rejects before configuration and diagnostic logs`, async () => {
  const h = harness(); const response = await invoke(h, { headers });
  assert.equal(response.status, 403); assert.equal(h.state.csrf, 0);
  noReads(h); safeOutput(response, h);
});
for (const requestURL of [`http://${HOST}${PATH}`, `https://foreign.invalid${PATH}`]) {
  test("destination URL cannot be replaced by trusted-looking headers", async () => {
    const h = harness({ requestURL }); const response = await invoke(h);
    assert.equal(response.status, 403); noReads(h); safeOutput(response, h);
  });
}
test("missing, wrong and throwing raw-request CSRF fail before config", async () => {
  for (const options of [{ headers: { "x-fixture-csrf": null } }, { headers: { "x-fixture-csrf": "forged" } }, { csrfThrows: true }]) {
    const h = harness(options); const response = await invoke(h, options);
    assert.equal(response.status, 403); assert.equal(h.state.csrf, 1); noReads(h, { logs: 1 }); safeOutput(response, h);
    assert.equal(h.state.logs[0].report.stage, "csrf");
  }
});
for (const [name, env] of [
  ["production", { VERCEL_ENV: "production" }], ["production target", { VERCEL_TARGET_ENV: "production" }],
  ["missing environment", { VERCEL: undefined }], ["wrong project", { VERCEL_PROJECT_ID: "other" }],
  ["wrong branch", { VERCEL_GIT_COMMIT_REF: "main" }], ["wrong repository", { VERCEL_GIT_REPO_SLUG: "other" }],
  ["wrong branch origin", { VERCEL_BRANCH_URL: "foreign.invalid" }], ["wrong site origin", { NEXT_PUBLIC_SITE_URL: "https://bagelito.pe" }],
  ["wrong QA project", { NEXT_PUBLIC_SUPABASE_URL: "https://foreign.supabase.co" }],
  ["live mode", { CULQI_MODE: "live" }], ["live approval", { CULQI_LIVE_APPROVED: "true" }],
  ["disabled flag", { CULQI_ENABLED: "false" }], ["wrong provider", { PAYMENT_PROVIDER: "manual" }],
]) test(`${name} stops before payment key reads, SELECT and GET`, async () => {
  const h = harness({ env }); const response = await invoke(h);
  assert.equal(response.status, 503); noReads(h, { config: 1, logs: 1 }); safeOutput(response, h);
  assert.equal(h.state.logs[0].report.stage, "scope");
});
for (const [name, env] of [
  ["missing secret", { CULQI_SECRET_KEY: undefined }], ["missing public key", { NEXT_PUBLIC_CULQI_PUBLIC_KEY: undefined }],
  ["live secret", { CULQI_SECRET_KEY: "sk_live_OFFLINEInvalid" }], ["live public key", { NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_live_OFFLINEInvalid" }],
  ["header-injected secret", { CULQI_SECRET_KEY: "sk_test_bad\r\nX-Test: injected" }],
]) test(`${name} stops before SELECT and provider GET`, async () => {
  const h = harness({ env }); const response = await invoke(h);
  assert.equal(response.status, 503); assert.equal(h.state.reads.length, 0); assert.equal(h.state.gets.length, 0);
  safeOutput(response, h); assert.equal(h.state.logs[0].report.stage, "test_keys");
});
test("real parser verifies all three captured charges while actual application remains closed", async () => {
  const h = harness(); const response = await invoke(h, {
    body: JSON.stringify({ applicationApproved: true, contractVerified: true, chargeId: "chr_live_forbidden", orderCode: "BAG-FORBIDDEN" }),
  });
  assert.equal(response.status, 200); safeOutput(response, h, true);
  assert.equal(h.state.gets.length, 3); assert.equal(h.state.reads.length, 6); assert.equal(h.state.logs.length, 1);
  const report = h.state.logs[0].report;
  assert.equal(report.contractVerified, true); assert.equal(report.automaticConfirmationContractVerified, true);
  assert.equal(report.completed, true); assert.equal(report.applicationApproved, false);
  for (const label of labels) {
    assert.equal(report.results[label].captureEvidenceVerified, true);
    assert.equal(report.results[label].status, "approval_required");
  }
});
test("same-origin without optional proxy/Fetch/Referer headers still uses raw CSRF", async () => {
  const h = harness(); const response = await invoke(h, { headers: {
    "x-forwarded-host": null, "x-forwarded-proto": null, "sec-fetch-site": null, referer: null,
  } });
  assert.equal(response.status, 200); assert.equal(h.state.csrf, 1); safeOutput(response, h, true);
});
test("real parser permits unknown capture_date units and no paid/operations fields", async () => {
  const h = harness({ mutateCharge: (charge) => { delete charge.capture_date; delete charge.paid; delete charge.operations; } });
  const response = await invoke(h); assert.equal(response.status, 200); safeOutput(response, h, true);
  for (const result of Object.values(h.state.logs[0].report.results)) {
    assert.equal(result.captureEvidenceVerified, true); assert.equal(result.captureDatePresent, false);
    assert.equal(result.captureDateContractVerified, false); assert.equal(result.operationsVerified, false);
  }
});
for (const [name, mutateCharge] of [
  ["refund", (charge) => { charge.amount_refunded = 1; }],
  ["current amount mismatch", (charge) => { charge.current_amount = 6599; }],
  ["dispute", (charge) => { charge.dispute = true; }],
  ["missing financial fields", (charge) => { delete charge.amount_refunded; }],
  ["wrong source", (charge) => { charge.source.id = "tkn_test_OTHERSource"; }],
  ["wrong order metadata", (charge) => { charge.metadata.bagelito_order_code = "BAG-OTHER"; }],
]) test(`${name} cannot produce verified capture evidence or any RPC`, async () => {
  const h = harness({ mutateCharge }); const response = await invoke(h);
  assert.equal(response.status, 200); safeOutput(response, h, true);
  for (const result of Object.values(h.state.logs[0].report.results)) assert.equal(result.captureEvidenceVerified, false);
});
test("post-GET identity race and known pending refund fail the real policy", async () => {
  for (const mutateRow of [
    (row, index, read) => { if (read === 2) row.order.payment_charge_attempt_id = uuid("9", index); },
    (row) => { row.knownRefund = { chargeId: row.order.payment_charge_id, state: "pending" }; },
  ]) {
    const h = harness({ mutateRow }); const response = await invoke(h);
    assert.equal(response.status, 200); safeOutput(response, h, true);
    for (const result of Object.values(h.state.logs[0].report.results)) assert.equal(result.captureEvidenceVerified, false);
  }
});
test("raw config, SELECT, provider and private logger errors never escape HTTP", async () => {
  for (const options of [{ configThrows: true }, { readThrows: true }, { fetchThrows: true }, { logThrows: true }]) {
    const h = harness(options); const response = await invoke(h);
    const ok = options.configThrows !== true;
    assert.equal(response.status, ok ? 200 : 503); safeOutput(response, h, ok);
  }
});
