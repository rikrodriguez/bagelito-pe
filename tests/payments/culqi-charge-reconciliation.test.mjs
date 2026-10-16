import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { getCulqiReadonlyDiagnosticScope } from "../../src/lib/payments/culqi-readonly-diagnostic.ts";
import { validateCulqiCapturedCharge } from "../../src/lib/payments/culqi-capture-evidence.ts";

// All capabilities are mocks. Neither loader reads configuration nor performs I/O
// other than reading the source under test. Unexpected network is a test failure.
globalThis.fetch = () => { throw new Error("Unexpected real network call"); };
const source = await readFile(new URL("../../src/lib/payments/culqi-charge-reconciliation.ts", import.meta.url), "utf8");
const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const request = { method: "POST", origin: ORIGIN, host: new URL(ORIGIN).host, referer: `${ORIGIN}/admin`, fetchSite: "same-origin" };
const codes = ["BAG-000001", "BAG-000002", "BAG-000004"];
const labels = ["qa_yape", "qa_visa", "qa_3ds"];
const chargeIds = ["chr_test_WIu0Hn7e9r2MqEue", "chr_test_BGmSf0LA6lKdxdcz", "chr_test_SA3U26iSk7KDn0BI"];
const secretSentinel = "sk_test_OFFLINESecretSentinel";
const piiSentinel = "fixturePERSONALPRIVATEcard1234";
const marker = "culqi_charge_get_reviewed_net_v1";
const uuid = (group, i) => `${group.repeat(8)}-${group.repeat(4)}-4${group.repeat(3)}-8${group.repeat(3)}-${String(i + 1).padStart(12, "0")}`;
const envFixture = () => ({
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
  VERCEL_GIT_COMMIT_REF: "fix/culqi-payment-coordination-20261012",
  VERCEL_GIT_REPO_OWNER: "rikrodriguez", VERCEL_GIT_REPO_SLUG: "bagelito-pe",
  VERCEL_BRANCH_URL: new URL(ORIGIN).host, NEXT_PUBLIC_SITE_URL: ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: "https://qaahskendqdkynwtylho.supabase.co",
  CULQI_MODE: "sandbox", CULQI_LIVE_APPROVED: "false", CULQI_ENABLED: "true",
  PAYMENT_PROVIDER: "culqi", NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_test_OFFLINEPublicKey",
  CULQI_SECRET_KEY: secretSentinel,
});
const snapshotFixture = (i) => ({
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
});
const chargeFixture = (i) => ({
  object: "charge", id: chargeIds[i], amount: 6600, currency_code: "PEN",
  metadata: { bagelito_order_code: codes[i], unrelated: piiSentinel },
  source: { id: snapshotFixture(i).order.payment_charge_source_id, private_card_data: piiSentinel },
  capture: true, capture_date: "opaque-date-observation", paid: false,
  current_amount: 6600, amount_refunded: 0, dispute: false,
  outcome: { code: "AUT0000", message: piiSentinel },
});

function loadFactory({ unverifiedContract = false, application = false } = {}) {
  let body = stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?;\s*/gm, ""));
  assert.equal((body.match(/\/\/ BEGIN_CAPTURE_CONTRACT/g) ?? []).length, 1);
  assert.equal((body.match(/\/\/ BEGIN_APPLICATION_APPROVAL/g) ?? []).length, 1);
  if (unverifiedContract) body = body.replace(/\/\/ BEGIN_CAPTURE_CONTRACT[\s\S]*?\/\/ END_CAPTURE_CONTRACT/, `
    const CAPTURE_CONTRACT = Object.freeze({ verified: false, marker: null, parse: () => null });
  `);
  if (application) body = body.replace(/\/\/ BEGIN_APPLICATION_APPROVAL[\s\S]*?\/\/ END_APPLICATION_APPROVAL/, "const APPLICATION_APPROVED = true;");
  body = body.replace(/^export /gm, "");
  return new Function("getCulqiReadonlyDiagnosticScope", "validateCulqiCapturedCharge", `${body}; return createCulqiChargeReconciliation;`)(getCulqiReadonlyDiagnosticScope, validateCulqiCapturedCharge);
}
const realFactory = loadFactory();
// Test-only operational approval is replaced in memory. The capture policy
// remains the actual pure validator; no source file or deployed flag is changed.
const fixtureFactory = loadFactory({ application: true });

function harness(change = {}, factory = realFactory) {
  const state = { steps: [], calls: [], reads: [], applications: [], logs: [], snapshots: codes.map((_, i) => snapshotFixture(i)) };
  const deps = {
    requireAdmin: async () => { state.steps.push("auth"); },
    verifyActionCsrf: async () => { state.steps.push("csrf"); return true; },
    readConfig: async () => { state.steps.push("config"); return envFixture(); },
    readPersistedOrder: async (code) => {
      state.steps.push(`read:${code}`); state.reads.push(code);
      const i = codes.indexOf(code); assert.notEqual(i, -1);
      return structuredClone(state.snapshots[i]);
    },
    fetch: async (url, init) => {
      state.calls.push({ url, init });
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://api.culqi.com");
      assert.equal(parsed.search, ""); assert.equal(parsed.hash, "");
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(init.headers.Authorization, `Bearer ${secretSentinel}`);
      const i = chargeIds.findIndex((id) => parsed.pathname === `/v2/charges/${id}`);
      assert.notEqual(i, -1);
      state.steps.push(`get:${codes[i]}`);
      return Response.json(chargeFixture(i));
    },
    applyVerifiedCharge: async (input) => {
      state.applications.push(input); state.steps.push("apply");
      return { applied: true, duplicate: false, alreadyPaid: false, requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" };
    },
    safeLog: (label, report) => state.logs.push({ label, report }),
    ...change,
  };
  return { run: factory(deps), state, deps };
}
function noLeak(report, state) {
  const text = JSON.stringify({ report, logs: state.logs });
  for (const forbidden of [secretSentinel, piiSentinel, "Bearer", marker, ...chargeIds, ...codes,
    ...codes.flatMap((_, i) => [snapshotFixture(i).order.id, snapshotFixture(i).order.checkout_session_id,
      snapshotFixture(i).order.payment_charge_attempt_id, snapshotFixture(i).attempt.id,
      snapshotFixture(i).order.payment_charge_source_id]), "opaque-date-observation", "malicious.invalid", "x-debug-secret"]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.equal(report.merchantAssociationVerified, false);
  assert.equal(report.captureDefinitionVerified, true);
  assert.equal(typeof report.automaticConfirmationContractVerified, "boolean");
  for (const result of Object.values(report.results)) {
    for (const [key, value] of Object.entries(result)) {
      if (key !== "status") assert.equal(typeof value, "boolean");
    }
  }
}
function noApplications(report, state) {
  assert.equal(state.applications.length, 0);
  noLeak(report, state);
}

test("reviewed capture policy never overrides private operational approval", async () => {
  assert.match(source, /BEGIN_CAPTURE_CONTRACT[\s\S]*?verified:\s*true/);
  assert.match(source, /BEGIN_APPLICATION_APPROVAL[\s\S]*?APPLICATION_APPROVED\s*=\s*false/);
  const h = harness(); const report = await h.run(request);
  noApplications(report, h.state);
  assert.equal(report.automaticConfirmationContractVerified, true);
  assert.equal(report.applicationApproved, false);
  for (const result of Object.values(report.results)) {
    assert.equal(result.status, "approval_required");
    assert.equal(result.captureContractVerified, true);
    assert.equal(result.captureEvidenceVerified, true);
    assert.equal(result.transactionAttempted, false);
    assert.equal(result.currentAmountPresent, true); assert.equal(result.currentAmountMatches, true);
    assert.equal(result.amountRefundedPresent, true); assert.equal(result.amountRefundedZero, true);
    assert.equal(result.disputePresent, true); assert.equal(result.disputeClear, true);
  }
});

test("absence of arbitrary operation fields is not a universal absence proof or an operational approval", async () => {
  const h = harness(); const original = h.deps.fetch;
  h.deps.fetch = async (url, init) => url.endsWith(chargeIds[0])
    ? Response.json({ ...chargeFixture(0), operations: [{ type: "refund", state: "pending" }], pending_refund: true })
    : original(url, init);
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.status, "approval_required");
  noApplications(report, h.state);
});

test("caller or dependency flags cannot approve the real contract or alter fixed targets", async () => {
  const h = harness({ contractVerified: true, applicationApproved: true, captureContract: { verified: true, parse: () => ({ currentAmountMinor: 6600, amountRefundedMinor: 0, dispute: false }) }, targets: [{ chargeId: "../../malicious.invalid" }] });
  const input = { ...request, contractVerified: true, applicationApproved: true, chargeId: "chr_live_HOSTILE", targets: [{ chargeId: "../../malicious.invalid" }] };
  Object.defineProperty(input, "body", { get() { throw new Error("caller body accessed"); } });
  const report = await h.run(input);
  noApplications(report, h.state);
  for (const call of h.state.calls) assert.ok(chargeIds.some((id) => call.url.endsWith(`/v2/charges/${id}`)));
});

test("unauthenticated invocation stops before CSRF, configuration, reads and provider", async () => {
  const h = harness({ requireAdmin: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } }, fixtureFactory);
  const report = await h.run(request);
  assert.equal(report.stage, "authentication"); assert.deepEqual(h.state.steps, []);
  assert.deepEqual(h.state.logs, [], "Unauthenticated requests cannot invoke the diagnostic logger");
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads.length, 0); noApplications(report, h.state);
});

test("CSRF rejection or exception stops before configuration", async () => {
  for (const verifyActionCsrf of [async () => false, async () => undefined, async () => "true", async () => { throw new Error(piiSentinel); }]) {
    const h = harness({ verifyActionCsrf }, fixtureFactory); const report = await h.run(request);
    assert.equal(report.stage, "csrf"); assert.deepEqual(h.state.steps, ["auth"]);
    assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads.length, 0); noApplications(report, h.state);
  }
});

for (const [name, patch] of [
  ["wrong Origin", { origin: "https://malicious.invalid" }], ["absent Origin", { origin: null }],
  ["wrong Host", { host: "malicious.invalid" }], ["wrong forwarded Host", { forwardedHost: "malicious.invalid" }],
  ["cross-site", { fetchSite: "cross-site" }], ["Fetch-Site none", { fetchSite: "none" }],
  ["GET invocation", { method: "GET" }], ["wrong Referer", { referer: "https://malicious.invalid/admin" }],
]) test(`${name} is rejected before configuration`, async () => {
  const h = harness({}, fixtureFactory); const report = await h.run({ ...request, ...patch });
  assert.equal(report.stage, "origin"); assert.deepEqual(h.state.steps, ["auth", "csrf"]);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads.length, 0); noApplications(report, h.state);
});

for (const [name, field, value] of [
  ["production", "VERCEL_ENV", "production"], ["target production", "VERCEL_TARGET_ENV", "production"],
  ["wrong project", "VERCEL_PROJECT_ID", "prj_else"], ["wrong branch", "VERCEL_GIT_COMMIT_REF", "main"],
  ["wrong repo", "VERCEL_GIT_REPO_SLUG", "other"], ["wrong branch origin", "VERCEL_BRANCH_URL", "malicious.invalid"],
  ["production site", "NEXT_PUBLIC_SITE_URL", "https://bagelito.pe"], ["wrong QA", "NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"],
  ["live mode", "CULQI_MODE", "live"], ["live approved", "CULQI_LIVE_APPROVED", "true"], ["disabled", "CULQI_ENABLED", "false"],
]) test(`${name} fails without payment key access`, async () => {
  let keyReads = 0;
  const h = harness({ readConfig: async () => new Proxy({ ...envFixture(), [field]: value }, {
    get(target, prop) { if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") keyReads++; return target[prop]; },
  }) }, fixtureFactory);
  const report = await h.run(request);
  assert.equal(report.stage, "scope"); assert.equal(keyReads, 0);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads.length, 0); noApplications(report, h.state);
});

test("missing, live and header-injected keys fail before persisted reads and GET", async () => {
  for (const [field, value] of [["CULQI_SECRET_KEY", undefined], ["CULQI_SECRET_KEY", "sk_live_OFFLINEInvalid"],
    ["NEXT_PUBLIC_CULQI_PUBLIC_KEY", "pk_live_OFFLINEInvalid"], ["CULQI_SECRET_KEY", "sk_test_abc\r\nx-debug-secret: x"]]) {
    const h = harness({ readConfig: async () => ({ ...envFixture(), [field]: value }) }, fixtureFactory);
    const report = await h.run(request);
    assert.equal(report.stage, "test_keys"); assert.equal(h.state.calls.length, 0);
    assert.equal(h.state.reads.length, 0); noApplications(report, h.state);
  }
});

test("persisted identity mismatches never issue a GET for that reference", async () => {
  const variants = [
    (row) => { row.order.order_code = "BAG-999999"; },
    (row) => { row.order.payment_charge_id = "chr_test_OTHERCharge"; },
    (row) => { row.order.payment_charge_id = "../../malicious.invalid"; },
    (row) => { row.order.payment_provider = "manual"; },
    (row) => { row.order.payment_lane = "legacy"; },
    (row) => { row.order.payment_order_id = "ord_test_OTHEROrder1"; },
    (row) => { row.order.payment_charge_source_id = "tkn_live_OTHERsource"; },
    (row) => { row.order.payment_amount_minor = 6601; },
    (row) => { row.order.payment_currency = "USD"; },
    (row) => { row.attempt.order_id = uuid("5", 0); },
    (row) => { row.attempt.provider = "manual"; },
    (row) => { row.attempt.provider_order_id = "ord_test_OTHEROrder1"; },
    (row) => { row.attempt.provider_charge_id = "chr_test_OTHERCharge"; },
    (row) => { row.attempt.amount_minor = 6601; },
    (row) => { row.attempt.currency_code = "USD"; },
  ];
  for (const mutate of variants) {
    const h = harness({}, fixtureFactory); mutate(h.state.snapshots[0]);
    const report = await h.run(request);
    assert.equal(h.state.calls.some((call) => call.url.endsWith(chargeIds[0])), false);
    assert.equal(h.state.applications.some((input) => input.orderId === snapshotFixture(0).order.id), false);
    noLeak(report, h.state);
  }
});

const unsafeFinancialStates = [
  ...["failed", "expired", "refunded", "unknown", "", null, undefined].map((status) => (row) => { row.order.payment_status = status; }),
  ...["failed", "expired", "refunded", "unknown", "", null, undefined].map((status) => (row) => { row.attempt.status = status; }),
  (row) => { row.order.payment_status = "paid"; },
  (row) => { row.attempt.status = "paid"; },
  (row) => { row.order.status = "needs_correction"; },
  (row) => { row.order.status = "payment_confirmed"; },
  (row) => { row.order.status = "in_production"; },
  (row) => { row.order.payment_status = "paid"; row.attempt.status = "paid"; row.order.status = "needs_correction"; },
];

test("terminal or inconsistent financial states block before GET despite matching identities", async () => {
  for (const mutate of unsafeFinancialStates) {
    const h = harness({}, fixtureFactory); mutate(h.state.snapshots[0]);
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.status, "blocked");
    assert.equal(report.results.qa_yape.snapshotMatchesPins, false);
    assert.equal(report.results.qa_yape.chargeQueryAttempted, false);
    assert.equal(h.state.calls.some((call) => call.url.endsWith(chargeIds[0])), false);
    assert.equal(h.state.applications.some((input) => input.orderId === snapshotFixture(0).order.id), false);
    noLeak(report, h.state);
  }
});

test("terminal or inconsistent financial states appearing after GET block the transaction", async () => {
  for (const mutate of unsafeFinancialStates) {
    const h = harness({}, fixtureFactory); const original = h.deps.readPersistedOrder;
    let reads = 0;
    h.deps.readPersistedOrder = async (code) => {
      const row = await original(code);
      if (code === codes[0] && ++reads === 2) mutate(row);
      return row;
    };
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.chargeFetched, true);
    assert.equal(report.results.qa_yape.attemptReReadAttempted, true);
    assert.equal(report.results.qa_yape.attemptStable, false);
    assert.equal(report.results.qa_yape.status, "stale_attempt");
    assert.equal(report.results.qa_yape.transactionAttempted, false);
    assert.equal(h.state.applications.some((input) => input.orderId === snapshotFixture(0).order.id), false);
    noLeak(report, h.state);
  }
});

test("valid financial pairs include pending cancelled and paid fulfilled orders", async () => {
  for (const [paymentStatus, orderStatus] of [
    ["pending", "cancelled"], ["paid", "payment_confirmed"], ["paid", "in_production"],
    ["paid", "ready_for_delivery"], ["paid", "delivered"], ["paid", "cancelled"],
  ]) {
    const h = harness();
    h.state.snapshots[0].order.payment_status = paymentStatus;
    h.state.snapshots[0].order.status = orderStatus;
    h.state.snapshots[0].attempt.status = paymentStatus;
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.snapshotMatchesPins, true);
    assert.equal(report.results.qa_yape.chargeFetched, true);
    assert.equal(report.results.qa_yape.attemptStable, true);
    assert.equal(report.results.qa_yape.status, "approval_required");
    noApplications(report, h.state);
  }
});

test("accurate attempt and charge-claim UUID values may coincide without an invented distinctness rule", async () => {
  const h = harness({}, fixtureFactory);
  h.state.snapshots[0].order.payment_charge_attempt_id = h.state.snapshots[0].attempt.id;
  const report = await h.run(request);
  const input = h.state.applications.find((entry) => entry.orderId === snapshotFixture(0).order.id);
  assert.ok(input); assert.equal(input.paymentAttemptId, input.chargeAttemptId);
  assert.equal(report.results.qa_yape.status, "applied");
  noLeak(report, h.state);
});

test("test-only operational approval uses the actual validator and rereads stable bindings before each application", async () => {
  const h = harness({}, fixtureFactory); const report = await h.run(request);
  assert.equal(h.state.calls.length, 3); assert.equal(h.state.applications.length, 3);
  for (let i = 0; i < codes.length; i++) {
    assert.equal(h.state.reads.filter((code) => code === codes[i]).length, 2);
    const input = h.state.applications[i];
    assert.equal(input.orderId, snapshotFixture(i).order.id);
    assert.equal(input.checkoutSessionId, snapshotFixture(i).order.checkout_session_id);
    assert.equal(input.paymentAttemptId, snapshotFixture(i).attempt.id);
    assert.equal(input.chargeAttemptId, snapshotFixture(i).order.payment_charge_attempt_id);
    assert.notEqual(input.paymentAttemptId, input.chargeAttemptId);
    assert.equal(input.contractMarker, marker);
    assert.equal(input.observation.chargeId, chargeIds[i]);
    assert.equal(input.observation.sourceId, snapshotFixture(i).order.payment_charge_source_id);
    assert.equal(input.observation.amountMinor, 6600); assert.equal(input.observation.currencyCode, "PEN");
    assert.equal(input.observation.capture, true); assert.equal(input.observation.captureDatePresent, true);
    assert.equal(input.observation.currentAmountMinor, 6600); assert.equal(input.observation.amountRefundedMinor, 0);
    assert.equal(input.observation.dispute, false);
    assert.equal(report.results[labels[i]].alreadyPaid, false);
    assert.deepEqual(Object.keys(input.observation).sort(), [
      "chargeId", "sourceId", "amountMinor", "currencyCode", "capture",
      "currentAmountMinor", "amountRefundedMinor", "dispute", "captureDatePresent",
    ].sort());
    assert.equal(Object.hasOwn(input.observation, "captureAtMillis"), false);
    assert.equal(Object.hasOwn(input.observation, "dateCaptureObservation"), false);
    assert.equal(Number.isFinite(Date.parse(input.observedAtISO)), true);
  }
  noLeak(report, h.state);
});

test("known refunds bound to the queried charge block only that reference", async () => {
  for (const state of ["pending", "completed", "unknown"]) {
    const h = harness({}, fixtureFactory);
    h.state.snapshots[0].knownRefund = { chargeId: chargeIds[0], state };
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.captureEvidenceVerified, false);
    assert.equal(report.results.qa_yape.transactionAttempted, false);
    assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
    assert.equal(h.state.applications.length, 2);
    noLeak(report, h.state);
  }
});

test("a rejected known refund does not invent returned money for this charge", async () => {
  const h = harness({}, fixtureFactory);
  h.state.snapshots[0].knownRefund = { chargeId: chargeIds[0], state: "rejected" };
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.captureEvidenceVerified, true);
  assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), true);
  noLeak(report, h.state);
});

test("a supplied refund context for another charge is rejected without blocking unrelated references", async () => {
  const h = harness({}, fixtureFactory);
  h.state.snapshots[0].knownRefund = { chargeId: "chr_test_OTHERCharge", state: "pending" };
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.captureEvidenceVerified, false);
  assert.equal(report.results.qa_yape.status, "evidence_incomplete");
  assert.equal(report.results.qa_yape.transactionAttempted, false);
  assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
  assert.equal(h.state.applications.length, 2);
  noLeak(report, h.state);
});

test("a newly observed bound pending refund prevents applying after the provider GET", async () => {
  const h = harness({}, fixtureFactory); const original = h.deps.readPersistedOrder;
  let reads = 0;
  h.deps.readPersistedOrder = async (code) => {
    const row = await original(code);
    if (code === codes[0] && ++reads === 2) row.knownRefund = { chargeId: chargeIds[0], state: "pending" };
    return row;
  };
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.chargeFetched, true);
  assert.equal(report.results.qa_yape.transactionAttempted, false);
  assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
  noLeak(report, h.state);
});

test("uncertain charge review is admitted only with the explicit pending state and matching reason", async () => {
  const h = harness();
  const row = h.state.snapshots[0];
  row.order.status = "needs_correction";
  row.order.payment_charge_state = "uncertain";
  row.order.payment_reconciliation_required = true;
  row.order.payment_reconciliation_reason = "charge_result_uncertain";
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.snapshotMatchesPins, true);
  assert.equal(report.results.qa_yape.attemptStable, true);
  assert.equal(report.results.qa_yape.captureEvidenceVerified, true);
  assert.equal(report.results.qa_yape.status, "approval_required");
  noApplications(report, h.state);
});

test("needs_correction manual reasons and invalid reconciliation flag shapes remain blocked before GET", async () => {
  for (const patch of [
    { status: "needs_correction", payment_reconciliation_required: false, payment_reconciliation_reason: "charge_result_uncertain" },
    { status: "needs_correction", payment_reconciliation_required: true, payment_reconciliation_reason: "manual_review" },
    { status: "needs_correction", payment_reconciliation_required: true, payment_reconciliation_reason: null },
    { payment_reconciliation_required: undefined },
    { payment_reconciliation_required: "true" },
    { payment_reconciliation_reason: undefined },
    { payment_reconciliation_reason: {} },
  ]) {
    const h = harness({}, fixtureFactory); Object.assign(h.state.snapshots[0].order, patch);
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.status, "blocked");
    assert.equal(h.state.calls.some((call) => call.url.endsWith(chargeIds[0])), false);
    assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
    noLeak(report, h.state);
  }
});

test("pending and cancelled orders preserve existing manual, expiry and release review reasons", async () => {
  for (const [status, reason] of [
    ["payment_pending_review", "manual_review"],
    ["cancelled", "payment_expired"],
    ["cancelled", "capacity_released"],
  ]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { applied: true, duplicate: false, alreadyPaid: false, requiresReview: true,
        paymentState: "paid", orderState: status === "cancelled" ? "cancelled" : "payment_confirmed" };
    } }, fixtureFactory);
    for (const snapshot of h.state.snapshots) {
      snapshot.order.status = status;
      snapshot.order.payment_reconciliation_required = true;
      snapshot.order.payment_reconciliation_reason = reason;
    }
    const report = await h.run(request);
    assert.equal(h.state.applications.length, 3);
    for (const result of Object.values(report.results)) {
      assert.equal(result.snapshotMatchesPins, true); assert.equal(result.attemptStable, true);
      assert.equal(result.status, "applied"); assert.equal(result.requiresReview, true);
    }
    for (const snapshot of h.state.snapshots) {
      assert.equal(snapshot.order.payment_reconciliation_required, true);
      assert.equal(snapshot.order.payment_reconciliation_reason, reason);
    }
    noLeak(report, h.state);
  }
});

test("a manual review reason introduced after GET makes the current attempt stale", async () => {
  const h = harness({}, fixtureFactory); const original = h.deps.readPersistedOrder;
  h.state.snapshots[0].order.status = "needs_correction";
  h.state.snapshots[0].order.payment_reconciliation_required = true;
  h.state.snapshots[0].order.payment_reconciliation_reason = "charge_result_uncertain";
  let reads = 0;
  h.deps.readPersistedOrder = async (code) => {
    const row = await original(code);
    if (code === codes[0] && ++reads === 2) row.order.payment_reconciliation_reason = "manual_review";
    return row;
  };
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.status, "stale_attempt");
  assert.equal(report.results.qa_yape.chargeFetched, true);
  assert.equal(report.results.qa_yape.transactionAttempted, false);
  assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
  noLeak(report, h.state);
});

test("real validator approval alone cannot override private operational refusal", async () => {
  const h = harness(); const report = await h.run(request);
  noApplications(report, h.state);
});

test("operational approval cannot override an explicitly unverified capture contract fixture", async () => {
  const h = harness({}, loadFactory({ unverifiedContract: true, application: true })); const report = await h.run(request);
  for (const result of Object.values(report.results)) assert.equal(result.status, "capture_contract_unverified");
  noApplications(report, h.state);
});

test("AUT0000 and paid=true cannot substitute for current capture evidence", async () => {
  for (const observation of [{ capture: false, paid: true }, { capture: "true", paid: true }, { capture: null, paid: true }]) {
    const h = harness({}, fixtureFactory); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(chargeIds[0])
      ? Response.json({ ...chargeFixture(0), ...observation }) : original(url, init);
    const report = await h.run(request);
    assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
    assert.equal(report.results.qa_yape.status, "capture_not_confirmed");
    noLeak(report, h.state);
  }
});

test("missing or mismatched net, refund or dispute evidence cannot apply a charge", async () => {
  for (const observation of [
    { current_amount: undefined }, { current_amount: 6599 }, { current_amount: "6600" },
    { amount_refunded: undefined }, { amount_refunded: 1 }, { amount_refunded: "0" },
    { dispute: undefined }, { dispute: true }, { dispute: "false" },
  ]) {
    const h = harness({}, fixtureFactory); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(chargeIds[0])
      ? Response.json({ ...chargeFixture(0), ...observation }) : original(url, init);
    const report = await h.run(request);
    assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
    assert.equal(report.results.qa_yape.status, "evidence_incomplete");
    assert.equal(report.results.qa_yape.currentAmountMatches, observation.current_amount === undefined
      ? !Object.hasOwn(observation, "current_amount") : observation.current_amount === 6600);
    assert.equal(report.results.qa_yape.amountRefundedZero, observation.amount_refunded === undefined
      ? !Object.hasOwn(observation, "amount_refunded") : observation.amount_refunded === 0);
    assert.equal(report.results.qa_yape.disputeClear, observation.dispute === undefined
      ? !Object.hasOwn(observation, "dispute") : observation.dispute === false);
    noLeak(report, h.state);
  }
});

test("raw capture date values are presence observations and never interpreted as timestamps", async () => {
  for (const capture_date of [undefined, null, "1792011000", 1792011000, 1792011000000, false, {}]) {
    const h = harness({}, fixtureFactory); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(chargeIds[0])
      ? Response.json({ ...chargeFixture(0), capture_date }) : original(url, init);
    const report = await h.run(request);
    const application = h.state.applications.find((input) => input.observation.chargeId === chargeIds[0]);
    assert.ok(application);
    assert.equal(application.observation.captureDatePresent, capture_date !== undefined && capture_date !== null);
    assert.equal(Object.hasOwn(application.observation, "captureAtMillis"), false);
    assert.equal(Object.hasOwn(application.observation, "dateCaptureObservation"), false);
    noLeak(report, h.state);
  }
});

test("current GET must match source, amount, currency, charge ID and order metadata", async () => {
  for (const patch of [
    { object: "token" }, { id: "chr_test_OTHERCharge" }, { amount: 6601 }, { amount: "6600" },
    { currency_code: "USD" }, { currency: "USD" }, { source: { id: "tkn_test_OTHERSource1" } },
    { metadata: { bagelito_order_code: "BAG-999999" } },
  ]) {
    const h = harness({}, fixtureFactory); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(chargeIds[0]) ? Response.json({ ...chargeFixture(0), ...patch }) : original(url, init);
    const report = await h.run(request);
    assert.equal(h.state.applications.some((input) => input.observation.chargeId === chargeIds[0]), false);
    noLeak(report, h.state);
  }
});

test("fresh persisted binding changes stop that reference before the transaction", async () => {
  for (const mutate of [
    (row) => { row.order.checkout_session_id = uuid("5", 0); },
    (row) => { row.order.payment_charge_attempt_id = uuid("5", 0); },
    (row) => { row.order.payment_charge_source_id = "tkn_test_OTHERSource1"; },
    (row) => { row.order.payment_charge_id = "chr_test_OTHERCharge"; },
    (row) => { row.order.payment_amount_minor = 6601; },
    (row) => { row.order.payment_currency = "USD"; },
    (row) => { row.order.payment_reconciliation_required = true; },
    (row) => { row.order.payment_reconciliation_reason = "manual_review"; },
    (row) => { row.attempt.id = uuid("5", 0); },
    (row) => { row.attempt.provider_charge_id = "chr_test_OTHERCharge"; },
  ]) {
    const h = harness({}, fixtureFactory); const original = h.deps.readPersistedOrder;
    let reads = 0;
    h.deps.readPersistedOrder = async (code) => {
      const row = await original(code);
      if (code === codes[0] && ++reads === 2) mutate(row);
      return row;
    };
    const report = await h.run(request);
    assert.equal(h.state.applications.some((input) => input.orderId === snapshotFixture(0).order.id), false);
    assert.equal(report.results.qa_yape.status, "stale_attempt"); noLeak(report, h.state);
  }
});

test("concurrent paid fulfillment progress alone is not treated as stale identity", async () => {
  const h = harness({ applyVerifiedCharge: async (input) => {
    h.state.applications.push(input);
    const alreadyPaid = input.orderId === snapshotFixture(0).order.id;
    return { applied: !alreadyPaid, duplicate: false, alreadyPaid, requiresReview: false, paymentState: "paid", orderState: alreadyPaid ? "delivered" : "payment_confirmed" };
  } }, fixtureFactory);
  const original = h.deps.readPersistedOrder;
  let reads = 0;
  h.deps.readPersistedOrder = async (code) => {
    const row = await original(code);
    if (code === codes[0] && ++reads === 2) {
      row.order.payment_status = "paid"; row.order.status = "delivered"; row.attempt.status = "paid";
    }
    return row;
  };
  const report = await h.run(request);
  assert.equal(h.state.applications.some((input) => input.orderId === snapshotFixture(0).order.id), true);
  assert.equal(report.results.qa_yape.status, "already_paid");
  assert.equal(report.results.qa_yape.transactionApplied, false); noLeak(report, h.state);
});

test("repeat approved observations use the same immutable idempotency identities", async () => {
  const seen = new Set();
  const h = harness({ applyVerifiedCharge: async (input) => {
    h.state.applications.push(input);
    const key = `${input.orderId}:${input.paymentAttemptId}:${input.chargeAttemptId}:${input.observation.chargeId}`;
    const duplicate = seen.has(key); seen.add(key);
    const i = chargeIds.indexOf(input.observation.chargeId);
    assert.notEqual(i, -1);
    // Match the persisted schema: paid is a payment status, while the charge
    // submission state remains submitted; it has no separate paid enum value.
    h.state.snapshots[i].order.payment_status = "paid";
    h.state.snapshots[i].order.status = "payment_confirmed";
    h.state.snapshots[i].attempt.status = "paid";
    assert.equal(h.state.snapshots[i].order.payment_charge_state, "submitted");
    return { applied: !duplicate, duplicate, alreadyPaid: duplicate, requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" };
  } }, fixtureFactory);
  const first = await h.run(request); const second = await h.run(request);
  assert.equal(h.state.applications.length, 6); assert.equal(seen.size, 3);
  for (const label of labels) {
    assert.equal(second.results[label].status, "duplicate");
    assert.equal(second.results[label].persistedPaymentPaid, true);
    assert.equal(second.results[label].alreadyPaid, true);
  }
  noLeak(first, h.state); noLeak(second, h.state);
});

test("database and provider failures suppress raw errors and prevent applying the failed reference", async () => {
  for (const fault of [
    { readPersistedOrder: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } },
    { fetch: async () => { throw new Error(`Bearer ${secretSentinel} ${piiSentinel}`); } },
    { fetch: async () => new Response(piiSentinel, { status: 500 }) },
    { fetch: async () => new Response(`{"bad":"${piiSentinel}"`) },
  ]) {
    const h = harness(fault, fixtureFactory); const report = await h.run(request);
    noApplications(report, h.state);
  }
});

test("transaction failure or malformed result cannot be reported as applied", async () => {
  for (const applyVerifiedCharge of [
    async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); },
    async () => null,
    async () => ({ applied: true, duplicate: false, alreadyPaid: false, requiresReview: false, paymentState: "failed", orderState: "payment_confirmed" }),
    async () => ({ applied: "true", duplicate: false, alreadyPaid: false, requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" }),
    async () => ({ applied: true, duplicate: false, alreadyPaid: false, requiresReview: false, paymentState: "paid", orderState: "cancelled" }),
  ]) {
    const h = harness({ applyVerifiedCharge }, fixtureFactory); const report = await h.run(request);
    for (const result of Object.values(report.results)) assert.notEqual(result.status, "applied");
    noLeak(report, h.state);
  }
});

test("a first receipt for an already paid order does not claim a new payment application", async () => {
  for (const [orderState, requiresReview] of [["delivered", false], ["cancelled", true]]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { applied: false, duplicate: false, alreadyPaid: true, requiresReview, paymentState: "paid", orderState };
    } }, fixtureFactory);
    for (const snapshot of h.state.snapshots) {
      snapshot.order.payment_status = "paid";
      snapshot.order.status = orderState;
      snapshot.attempt.status = "paid";
    }
    const report = await h.run(request);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "already_paid"); assert.equal(result.alreadyPaid, true);
      assert.equal(result.transactionAttempted, true); assert.equal(result.transactionApplied, false);
      assert.equal(result.duplicate, false); assert.equal(result.requiresReview, requiresReview);
    }
    for (const snapshot of h.state.snapshots) {
      assert.equal(snapshot.order.payment_status, "paid"); assert.equal(snapshot.order.status, orderState);
    }
    noLeak(report, h.state);
  }
});

test("duplicate receipt takes status priority with either boolean alreadyPaid outcome", async () => {
  for (const alreadyPaid of [false, true]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { applied: false, duplicate: true, alreadyPaid, requiresReview: true, paymentState: "paid", orderState: "cancelled" };
    } }, fixtureFactory);
    const report = await h.run(request);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "duplicate"); assert.equal(result.alreadyPaid, alreadyPaid);
      assert.equal(result.duplicate, true); assert.equal(result.transactionApplied, false);
      assert.equal(result.requiresReview, true);
    }
    noLeak(report, h.state);
  }
});

test("missing, mistyped and contradictory application outcome flags are rejected", async () => {
  for (const flags of [
    { applied: true, duplicate: false },
    { applied: false, duplicate: false, alreadyPaid: false },
    { applied: true, duplicate: false, alreadyPaid: true },
    { applied: true, duplicate: true, alreadyPaid: false },
    { applied: true, duplicate: true, alreadyPaid: true },
    { applied: true, duplicate: false, alreadyPaid: "false" },
    { applied: false, duplicate: false, alreadyPaid: "true" },
    { applied: false, duplicate: true, alreadyPaid: null },
  ]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { ...flags, requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" };
    } }, fixtureFactory);
    const report = await h.run(request);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "transaction_invalid"); assert.equal(result.alreadyPaid, false);
      assert.equal(result.transactionApplied, false); assert.equal(result.duplicate, false);
    }
    noLeak(report, h.state);
  }
});

test("an adapter cannot claim a new application or deny alreadyPaid after a fresh paid snapshot", async () => {
  for (const flags of [
    { applied: true, duplicate: false, alreadyPaid: false },
    { applied: false, duplicate: true, alreadyPaid: false },
  ]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { ...flags, requiresReview: false, paymentState: "paid", orderState: "delivered" };
    } }, fixtureFactory);
    for (const snapshot of h.state.snapshots) {
      snapshot.order.payment_status = "paid";
      snapshot.order.status = "delivered";
      snapshot.attempt.status = "paid";
    }
    const report = await h.run(request);
    assert.equal(h.state.applications.length, 3);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "transaction_invalid");
      assert.equal(result.persistedPaymentPaid, true); assert.equal(result.attemptStable, true);
      assert.equal(result.transactionAttempted, true); assert.equal(result.transactionApplied, false);
      assert.equal(result.duplicate, false); assert.equal(result.alreadyPaid, false);
    }
    noLeak(report, h.state);
  }
});

test("a paid race after the pending snapshot may return alreadyPaid without a new application", async () => {
  const h = harness({ applyVerifiedCharge: async (input) => {
    h.state.applications.push(input);
    const i = chargeIds.indexOf(input.observation.chargeId);
    assert.equal(h.state.snapshots[i].order.payment_status, "pending");
    // The authoritative mock transaction observes a webhook that arrived
    // after the routine's final SELECT, before this transaction's lock.
    h.state.snapshots[i].order.payment_status = "paid";
    h.state.snapshots[i].attempt.status = "paid";
    h.state.snapshots[i].order.status = "payment_confirmed";
    return { applied: false, duplicate: false, alreadyPaid: true, requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" };
  } }, fixtureFactory);
  const report = await h.run(request);
  for (const result of Object.values(report.results)) {
    assert.equal(result.persistedPaymentPaid, false);
    assert.equal(result.status, "already_paid"); assert.equal(result.alreadyPaid, true);
    assert.equal(result.transactionApplied, false); assert.equal(result.duplicate, false);
  }
  noLeak(report, h.state);
});

test("a missing transaction adapter remains blocked even in the fully approved synthetic fixture", async () => {
  const h = harness({ applyVerifiedCharge: undefined }, fixtureFactory);
  const report = await h.run(request);
  for (const result of Object.values(report.results)) {
    assert.equal(result.status, "adapter_unavailable");
    assert.equal(result.transactionAttempted, false); assert.equal(result.transactionApplied, false);
  }
  noApplications(report, h.state);
});

test("paid cancelled results require review and fulfilled order states remain distinct", async () => {
  for (const [orderState, requiresReview] of [["cancelled", true], ["in_production", false], ["ready_for_delivery", false], ["delivered", false]]) {
    const h = harness({ applyVerifiedCharge: async (input) => {
      h.state.applications.push(input);
      return { applied: true, duplicate: false, alreadyPaid: false, requiresReview, paymentState: "paid", orderState, privatePayload: piiSentinel };
    } }, fixtureFactory);
    const report = await h.run(request);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "applied"); assert.equal(result.requiresReview, requiresReview);
      assert.equal(result.transactionApplied, true);
    }
    noLeak(report, h.state);
  }
});

test("the transport aborts or cancels invalid and oversized bodies without applying", async () => {
  for (const responseFactory of [
    () => new Response(new Uint8Array([0xc3, 0x28])),
    () => Response.json(null), () => Response.json([chargeFixture(0)]), () => new Response(null),
    () => Response.json({ ...chargeFixture(0), huge: piiSentinel.repeat(20_000) }),
  ]) {
    const h = harness({ fetch: async () => responseFactory() }, fixtureFactory);
    const report = await h.run(request); noApplications(report, h.state);
  }
});

test("body overflow cancels an unclosed stream and does not await a hostile cancel callback", async () => {
  let cancelled = 0;
  const h = harness({ fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(256 * 1024)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled++; return new Promise(() => {}); },
  })) }, fixtureFactory);
  const report = await h.run(request);
  assert.ok(cancelled > 0); noApplications(report, h.state);
});

test("deadline exhaustion prevents further transport calls and applications", async () => {
  let tick = 0;
  const h = harness({ now: () => tick++ === 0 ? 0 : 30_001 }, fixtureFactory);
  const report = await h.run(request);
  assert.equal(h.state.calls.length, 0); noApplications(report, h.state);
});

test("a body that never produces a chunk is aborted within the remaining global budget", async () => {
  let tick = 0; let cancellations = 0;
  const h = harness({
    now: () => tick++ === 0 ? 0 : 29_998,
    fetch: async () => new Response(new ReadableStream({ cancel() { cancellations++; } })),
  }, fixtureFactory);
  const timer = setTimeout(() => {}, 50);
  try {
    const report = await h.run(request);
    assert.equal(cancellations, 3);
    for (const result of Object.values(report.results)) {
      assert.equal(result.status, "lookup_failed"); assert.equal(result.chargeQueryFailed, true);
    }
    noApplications(report, h.state);
  } finally { clearTimeout(timer); }
});

test("logger exceptions cannot expose provider data or alter results", async () => {
  const h = harness({ safeLog: () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } });
  const report = await h.run(request); noApplications(report, h.state);
});
