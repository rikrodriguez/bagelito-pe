import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { getCulqiReadonlyDiagnosticScope } from "../../src/lib/payments/culqi-readonly-diagnostic.ts";
import { validateCulqiCapturedCharge } from "../../src/lib/payments/culqi-capture-evidence.ts";

// No actual configuration, database, provider or client is used by this suite.
globalThis.fetch = () => { throw new Error("Unexpected real network call"); };
const moduleUrl = new URL("../../src/lib/payments/culqi-status-recovery.ts", import.meta.url);
const source = await readFile(moduleUrl, "utf8");
const body = stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?;\s*/gm, "")).replace(/^export /gm, "");
const createCulqiStatusRecovery = new Function("createHash", "getCulqiReadonlyDiagnosticScope", "validateCulqiCapturedCharge", `${body}; return createCulqiStatusRecovery;`)(createHash, getCulqiReadonlyDiagnosticScope, validateCulqiCapturedCharge);

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const code = "BAG-000005";
const orderId = "11111111-1111-4111-8111-000000000005";
const sessionId = "22222222-2222-4222-8222-000000000005";
const attemptId = "33333333-3333-4333-8333-000000000005";
const claimId = "44444444-4444-4444-8444-000000000005";
const chargeId = "chr_test_OFFLINEStatusCharge5";
const sourceId = "tkn_test_OFFLINEStatusSource5";
const secretSentinel = "sk_test_OFFLINESecretSentinel";
const piiSentinel = "fixturePERSONALPRIVATEcard1234";
const context = { orderCode: code, checkoutSessionId: sessionId };
const envFixture = () => ({
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
  VERCEL_GIT_COMMIT_REF: "fix/culqi-payment-coordination-20261012",
  VERCEL_GIT_REPO_OWNER: "rikrodriguez", VERCEL_GIT_REPO_SLUG: "bagelito-pe",
  VERCEL_BRANCH_URL: new URL(ORIGIN).host, NEXT_PUBLIC_SITE_URL: ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: "https://qaahskendqdkynwtylho.supabase.co",
  CULQI_MODE: "sandbox", CULQI_LIVE_APPROVED: "false", CULQI_ENABLED: "true",
  PAYMENT_PROVIDER: "culqi", NEXT_PUBLIC_CULQI_PUBLIC_KEY: "pk_test_OFFLINEPublicKey", CULQI_SECRET_KEY: secretSentinel,
  CULQI_STATUS_RECOVERY_APPROVED: "true",
});
const snapshotFixture = () => ({
  order: {
    id: orderId, checkout_session_id: sessionId, order_code: code, payment_provider: "culqi", payment_lane: "token",
    payment_order_id: null, payment_charge_id: chargeId, payment_charge_attempt_id: claimId,
    payment_charge_source_id: sourceId, payment_amount_minor: 8500, payment_currency: "PEN",
    payment_charge_state: "submitted", payment_status: "pending", status: "payment_pending_review",
    payment_reconciliation_required: false, payment_reconciliation_reason: null,
  },
  attempt: { id: attemptId, order_id: orderId, provider: "culqi", provider_order_id: null,
    provider_charge_id: chargeId, amount_minor: 8500, currency_code: "PEN", status: "pending" },
});
const chargeFixture = () => ({
  object: "charge", id: chargeId, amount: 8500, currency_code: "PEN",
  source: { id: sourceId, private_card_data: piiSentinel }, metadata: { bagelito_order_code: code, private: piiSentinel },
  capture: true, capture_date: "opaque-date-observation", paid: false, current_amount: 8500, amount_refunded: 0, dispute: false,
});
const transactionFixture = () => ({ applied: true, duplicate: false, alreadyPaid: false,
  requiresReview: false, paymentState: "paid", orderState: "payment_confirmed" });

function harness(change = {}) {
  const state = { steps: [], reads: [], rates: [], gets: [], confirmations: [], logs: [], snapshot: snapshotFixture() };
  const deps = {
    readConfig: async () => { state.steps.push("config"); return envFixture(); },
    readPersistedOrder: async (orderCode, checkoutSessionId, signal) => {
      state.steps.push("read"); state.reads.push({ orderCode, checkoutSessionId, signal });
      assert.equal(orderCode, code); assert.equal(checkoutSessionId, sessionId);
      assert.ok(signal instanceof AbortSignal);
      return structuredClone(state.snapshot);
    },
    consumeRateLimit: async (args, signal) => {
      state.steps.push("rate"); state.rates.push({ args, signal });
      assert.ok(signal instanceof AbortSignal);
      return { allowed: true, hits: 1, retry_after_seconds: 0 };
    },
    fetch: async (url, init) => {
      state.steps.push("get"); state.gets.push({ url, init });
      assert.equal(url, `https://api.culqi.com/v2/charges/${chargeId}`);
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined); assert.equal(init.credentials, "omit");
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(init.headers.Authorization, `Bearer ${secretSentinel}`); assert.ok(init.signal instanceof AbortSignal);
      return Response.json(chargeFixture());
    },
    confirmCharge: async (args, signal) => {
      state.steps.push("confirm"); state.confirmations.push({ args, signal });
      assert.ok(signal instanceof AbortSignal);
      return transactionFixture();
    },
    ...change,
  };
  const recover = createCulqiStatusRecovery(deps);
  return { state, deps, run: async (input = context) => {
    const previous = { info: console.info, warn: console.warn, error: console.error };
    for (const name of Object.keys(previous)) console[name] = (...args) => state.logs.push(args);
    try { return await recover(input); }
    finally { Object.assign(console, previous); }
  } };
}
function assertSafe(result, state) {
  assert.ok(["skipped", "deferred", "review_required", "confirmed", "already_paid", "unavailable"].includes(result.state));
  assert.ok(Object.keys(result).every((key) => ["state", "retryAfterSeconds"].includes(key)));
  if (Object.hasOwn(result, "retryAfterSeconds")) {
    assert.ok(Number.isSafeInteger(result.retryAfterSeconds) && result.retryAfterSeconds >= 0 && result.retryAfterSeconds <= 15);
  }
  const output = JSON.stringify({ result, logs: state.logs });
  for (const value of [secretSentinel, piiSentinel, code, orderId, sessionId, attemptId, claimId, chargeId, sourceId,
    "Bearer", "opaque-date-observation", "malicious.invalid", "x-debug-secret"]) assert.equal(output.includes(value), false, value);
}

test("approval absent or off skips before payment keys and every extra DB/provider capability", async () => {
  for (const approval of [undefined, "false", "", "1", "TRUE"]) {
    let keyReads = 0;
    const h = harness({ readConfig: async () => new Proxy({ ...envFixture(), CULQI_STATUS_RECOVERY_APPROVED: approval }, {
      get(target, prop) { if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") keyReads++; return target[prop]; },
    }) });
    const result = await h.run();
    assert.equal(result.state, "skipped"); assert.equal(keyReads, 0);
    assert.equal(h.state.reads.length, 0); assert.equal(h.state.rates.length, 0);
    assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("dynamic BAG-000005 and 8500 PEN use persisted bindings, a strict rate grant and exact proof", async () => {
  const h = harness(); const result = await h.run();
  assert.equal(result.state, "confirmed");
  assert.deepEqual(h.state.steps, ["config", "read", "rate", "get", "read", "confirm"]);
  assert.equal(h.state.rates.length, 1); assert.equal(h.state.gets.length, 1); assert.equal(h.state.confirmations.length, 1);
  const identifier = createHash("sha256").update(JSON.stringify([orderId, sessionId, attemptId, claimId, chargeId])).digest("hex");
  assert.deepEqual(h.state.rates[0].args, { p_scope: "culqi_status_charge_get", p_identifier: identifier, p_limit: 1, p_window_seconds: 15 });
  const args = h.state.confirmations[0].args;
  assert.deepEqual(Object.keys(args).sort(), ["p_order_id", "p_checkout_session_id", "p_payment_attempt_id", "p_charge_attempt_id", "p_contract_marker", "p_observed_at", "p_observation"].sort());
  assert.equal(args.p_order_id, orderId); assert.equal(args.p_checkout_session_id, sessionId);
  assert.equal(args.p_payment_attempt_id, attemptId); assert.equal(args.p_charge_attempt_id, claimId);
  assert.equal(args.p_contract_marker, "culqi_charge_get_reviewed_net_v1"); assert.ok(Number.isFinite(Date.parse(args.p_observed_at)));
  assert.deepEqual(args.p_observation, { chargeId, sourceId, amountMinor: 8500, currencyCode: "PEN", capture: true,
    currentAmountMinor: 8500, amountRefundedMinor: 0, dispute: false, captureDatePresent: true });
  assertSafe(result, h.state);
});

test("an already paid authoritative snapshot never consumes rate or fetches a charge", async () => {
  for (const requiresReview of [false, true]) {
    const h = harness(); h.state.snapshot.order.payment_status = "paid"; h.state.snapshot.attempt = null;
    h.state.snapshot.order.status = requiresReview ? "cancelled" : "delivered";
    h.state.snapshot.order.payment_reconciliation_required = requiresReview;
    const result = await h.run();
    assert.equal(result.state, requiresReview ? "review_required" : "already_paid");
    assert.equal(h.state.rates.length, 0); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0);
    assertSafe(result, h.state);
  }
});

for (const [name, field, value] of [
  ["production", "VERCEL_ENV", "production"], ["target production", "VERCEL_TARGET_ENV", "production"],
  ["wrong project", "VERCEL_PROJECT_ID", "prj_else"], ["wrong branch", "VERCEL_GIT_COMMIT_REF", "main"],
  ["wrong repo", "VERCEL_GIT_REPO_SLUG", "other"], ["wrong branch origin", "VERCEL_BRANCH_URL", "malicious.invalid"],
  ["production site", "NEXT_PUBLIC_SITE_URL", "https://bagelito.pe"], ["wrong QA", "NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"],
  ["live mode", "CULQI_MODE", "live"], ["live approved", "CULQI_LIVE_APPROVED", "true"],
]) test(`${name} skips before keys, additional DB or provider`, async () => {
  let keyReads = 0;
  const h = harness({ readConfig: async () => new Proxy({ ...envFixture(), [field]: value }, {
    get(target, prop) { if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") keyReads++; return target[prop]; },
  }) });
  const result = await h.run(); assert.equal(result.state, "skipped"); assert.equal(keyReads, 0);
  assert.equal(h.state.reads.length, 0); assert.equal(h.state.gets.length, 0); assertSafe(result, h.state);
});

test("live, absent or header-injected keys cannot reach the provider", async () => {
  for (const [field, value] of [["CULQI_SECRET_KEY", undefined], ["CULQI_SECRET_KEY", "sk_live_OFFLINEInvalid"],
    ["NEXT_PUBLIC_CULQI_PUBLIC_KEY", "pk_live_OFFLINEInvalid"], ["CULQI_SECRET_KEY", "sk_test_abc\r\nx-debug-secret: x"]]) {
    const h = harness({ readConfig: async () => ({ ...envFixture(), [field]: value }) }); const result = await h.run();
    assert.equal(result.state, "skipped"); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0);
    assertSafe(result, h.state);
  }
});

test("invalid context fails closed without reading any order or accepting caller charge IDs", async () => {
  for (const input of [null, {}, { ...context, orderCode: "../../malicious.invalid" }, { ...context, checkoutSessionId: "bad-session" }]) {
    const h = harness(); const result = await h.run(input);
    assert.equal(result.state, "unavailable"); assert.equal(h.state.reads.length, 0); assert.equal(h.state.gets.length, 0); assertSafe(result, h.state);
  }
});

test("caller extra IDs do not override the persisted charge or proof", async () => {
  const h = harness(); const input = { ...context, chargeId: "chr_live_HOSTILE", amountMinor: 1, approved: true };
  Object.defineProperty(input, "body", { get() { throw new Error("caller body accessed"); } });
  const result = await h.run(input); assert.equal(result.state, "confirmed");
  assert.equal(h.state.gets[0].url, `https://api.culqi.com/v2/charges/${chargeId}`); assertSafe(result, h.state);
});

test("invalid persisted identities and financial states require review without provider GET", async () => {
  for (const mutate of [
    (row) => { row.order.checkout_session_id = orderId; }, (row) => { row.order.order_code = "BAG-999999"; },
    (row) => { row.order.payment_charge_id = null; }, (row) => { row.order.payment_charge_id = "chr_live_HOSTILE"; },
    (row) => { row.order.payment_charge_source_id = null; }, (row) => { row.order.payment_lane = "legacy"; },
    (row) => { row.order.payment_currency = "USD"; }, (row) => { row.attempt.amount_minor = 6600; },
    (row) => { row.attempt.status = "failed"; },
  ]) {
    const h = harness(); mutate(h.state.snapshot); const result = await h.run();
    assert.equal(result.state, "review_required"); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0);
    assertSafe(result, h.state);
  }
});

test("terminal payment states skip before rate consumption or provider GET", async () => {
  for (const status of ["failed", "expired", "refunded"]) {
    const h = harness(); h.state.snapshot.order.payment_status = status; h.state.snapshot.attempt.status = status;
    const result = await h.run(); assert.equal(result.state, "skipped");
    assert.equal(h.state.rates.length, 0); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0);
    assertSafe(result, h.state);
  }
});

test("a truly idle session without a persisted charge or claim skips extra payment work", async () => {
  const h = harness();
  Object.assign(h.state.snapshot.order, { payment_charge_id: null, payment_charge_attempt_id: null,
    payment_charge_source_id: null, payment_charge_state: "idle" });
  h.state.snapshot.attempt.provider_charge_id = null;
  const result = await h.run(); assert.equal(result.state, "skipped");
  assert.equal(h.state.rates.length, 0); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0);
  assertSafe(result, h.state);
});

test("existing manual or cancellation reviews remain eligible and authoritative SQL preserves their result", async () => {
  for (const [status, reason, requiresReview] of [
    ["payment_pending_review", "manual_review", true],
    ["cancelled", "capacity_released", true],
    ["needs_correction", "charge_result_uncertain", false],
  ]) {
    const h = harness({ confirmCharge: async () => ({ ...transactionFixture(), requiresReview,
      orderState: status === "cancelled" ? "cancelled" : "payment_confirmed" }) });
    Object.assign(h.state.snapshot.order, { status, payment_reconciliation_required: true,
      payment_reconciliation_reason: reason, payment_charge_state: "uncertain" });
    const result = await h.run(); assert.equal(result.state, requiresReview ? "review_required" : "confirmed");
    assert.equal(h.state.gets.length, 1); assertSafe(result, h.state);
  }
});

test("needs_correction without the explicit uncertain-review reason requires review before GET", async () => {
  for (const [required, reason] of [[false, "charge_result_uncertain"], [true, "manual_review"], [true, null]]) {
    const h = harness(); Object.assign(h.state.snapshot.order, { status: "needs_correction",
      payment_reconciliation_required: required, payment_reconciliation_reason: reason });
    const result = await h.run(); assert.equal(result.state, "review_required");
    assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("rate grants accept only strict booleans, one hit and zero retry, including singleton arrays", async () => {
  for (const data of [{ allowed: true, hits: 1, retry_after_seconds: 0 }, [{ allowed: true, hits: 1, retry_after_seconds: 0 }]]) {
    const h = harness({ consumeRateLimit: async (args, signal) => { h.state.rates.push({ args, signal }); return data; } });
    const result = await h.run(); assert.equal(result.state, "confirmed"); assert.equal(h.state.gets.length, 1); assertSafe(result, h.state);
  }
});

test("valid rate denial defers without querying the provider or confirming", async () => {
  for (const retry of [1, 15]) {
    const h = harness({ consumeRateLimit: async () => ({ allowed: false, hits: 1, retry_after_seconds: retry }) });
    const result = await h.run(); assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, retry);
    assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("missing, ambiguous or malformed rate responses never authorize a provider GET", async () => {
  for (const data of [null, {}, [], [{ allowed: true, hits: 1, retry_after_seconds: 0 }, { allowed: true, hits: 1, retry_after_seconds: 0 }],
    { allowed: "true", hits: 1, retry_after_seconds: 0 }, { allowed: true, hits: 2, retry_after_seconds: 0 },
    { allowed: true, hits: "1", retry_after_seconds: 0 }, { allowed: true, hits: 1.5, retry_after_seconds: 0 },
    { allowed: true, hits: 1, retry_after_seconds: "0" }, { allowed: true, hits: 1, retry_after_seconds: 0, extra: piiSentinel },
    { allowed: true, hits: 1, retry_after_seconds: 1 }, { allowed: false, hits: 0, retry_after_seconds: 1 },
    { allowed: false, hits: 1, retry_after_seconds: 0 }, { allowed: false, hits: 1, retry_after_seconds: 16 }]) {
    const h = harness({ consumeRateLimit: async () => data }); const result = await h.run();
    assert.equal(result.state, "unavailable"); assert.equal(h.state.gets.length, 0); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("an uncaptured charge defers without interpreting paid or date units", async () => {
  for (const patch of [{ capture: false, paid: true }, { capture: "true" }]) {
    const h = harness({ fetch: async () => Response.json({ ...chargeFixture(), ...patch }) }); const result = await h.run();
    assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15); assert.equal(h.state.confirmations.length, 0);
    assertSafe(result, h.state);
  }
});

test("missing or malformed financial evidence requires review without confirmation", async () => {
  for (const patch of [{ current_amount: undefined }, { current_amount: "8500" }, { current_amount: -1 },
    { amount_refunded: undefined }, { amount_refunded: "0" }, { dispute: undefined }, { dispute: "false" }]) {
    const h = harness({ fetch: async () => Response.json({ ...chargeFixture(), ...patch }) }); const result = await h.run();
    assert.equal(result.state, "review_required"); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("observed refund, net mismatch, dispute and bound known refunds require review", async () => {
  for (const patch of [{ current_amount: 8400 }, { amount_refunded: 100 }, { dispute: true }]) {
    const h = harness({ fetch: async () => Response.json({ ...chargeFixture(), ...patch }) }); const result = await h.run();
    assert.equal(result.state, "review_required"); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
  for (const state of ["pending", "completed", "unknown"]) {
    const h = harness(); h.state.snapshot.knownRefund = { chargeId, state }; const result = await h.run();
    assert.equal(result.state, "review_required"); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("a rejected known refund is not returned money, and a misbound refund context cannot confirm", async () => {
  for (const [knownRefund, expected] of [
    [{ chargeId, state: "rejected" }, "confirmed"],
    [{ chargeId: "chr_test_OTHERCharge", state: "pending" }, "review_required"],
  ]) {
    const h = harness(); h.state.snapshot.knownRefund = knownRefund;
    const result = await h.run(); assert.equal(result.state, expected); assertSafe(result, h.state);
  }
});

test("binding mismatch in a successful provider response cannot confirm", async () => {
  for (const patch of [{ id: "chr_test_OTHERCharge" }, { amount: 6600 }, { currency: "USD" },
    { source: { id: "tkn_test_OTHERSource1" } }, { metadata: { bagelito_order_code: "BAG-999999" } }]) {
    const h = harness({ fetch: async () => Response.json({ ...chargeFixture(), ...patch }) }); const result = await h.run();
    assert.equal(result.state, "review_required"); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("fresh binding and review changes after GET stop confirmation", async () => {
  for (const mutate of [
    (row) => { row.order.payment_charge_attempt_id = orderId; }, (row) => { row.attempt.id = sessionId; },
    (row) => { row.order.payment_charge_source_id = "tkn_test_OTHERSource1"; },
    (row) => { row.order.payment_amount_minor = 8400; row.attempt.amount_minor = 8400; },
    (row) => { row.order.payment_reconciliation_required = true; },
    (row) => { row.order.payment_reconciliation_reason = "manual_review"; },
  ]) {
    const h = harness(); const original = h.deps.readPersistedOrder; let reads = 0;
    h.deps.readPersistedOrder = async (...args) => { const row = await original(...args); if (++reads === 2) mutate(row); return row; };
    const result = await h.run(); assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15);
    assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("already paid during the fresh read is authoritative and skips confirmation", async () => {
  const h = harness(); const original = h.deps.readPersistedOrder; let reads = 0;
  h.deps.readPersistedOrder = async (...args) => {
    const row = await original(...args);
    if (++reads === 2) { row.order.payment_status = "paid"; row.attempt.status = "paid"; row.order.status = "delivered"; }
    return row;
  };
  const result = await h.run(); assert.equal(result.state, "already_paid"); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
});

test("a pending snapshot can receive an authoritative alreadyPaid or duplicate SQL result", async () => {
  for (const flags of [{ applied: false, duplicate: false, alreadyPaid: true }, { applied: false, duplicate: true, alreadyPaid: false }]) {
    const h = harness({ confirmCharge: async () => ({ ...transactionFixture(), ...flags }) }); const result = await h.run();
    assert.equal(result.state, "already_paid"); assertSafe(result, h.state);
  }
});

test("SQL review results remain review_required, including paid cancelled", async () => {
  const h = harness({ confirmCharge: async () => ({ ...transactionFixture(), requiresReview: true, orderState: "cancelled" }) });
  const result = await h.run(); assert.equal(result.state, "review_required"); assertSafe(result, h.state);
});

test("a locked SQL guard may require review while the payment remains pending without applying", async () => {
  for (const orderState of ["payment_pending_review", "needs_correction", "cancelled"]) {
    const h = harness({ confirmCharge: async (args, signal) => {
      h.state.confirmations.push({ args, signal });
      return { applied: false, duplicate: false, alreadyPaid: false, requiresReview: true, paymentState: "pending", orderState };
    } });
    const result = await h.run(); assert.equal(result.state, "review_required");
    assert.equal(h.state.confirmations.length, 1);
    assert.equal(h.state.snapshot.order.payment_status, "pending");
    assert.equal(h.state.snapshot.attempt.status, "pending");
    assertSafe(result, h.state);
  }
});

test("pending SQL envelopes cannot claim an application, receipt or fulfilled order", async () => {
  const pending = { applied: false, duplicate: false, alreadyPaid: false, requiresReview: true,
    paymentState: "pending", orderState: "payment_pending_review" };
  for (const patch of [
    { applied: true }, { duplicate: true }, { alreadyPaid: true }, { requiresReview: false },
    { orderState: "unknown" }, { orderState: "payment_confirmed" }, { orderState: "delivered" },
    { extra: piiSentinel }, { applied: "false" }, { requiresReview: "true" },
  ]) {
    const h = harness({ confirmCharge: async () => ({ ...pending, ...patch }) });
    const result = await h.run(); assert.equal(result.state, "unavailable"); assertSafe(result, h.state);
  }
});

test("DB, rate, GET and confirmation exceptions return sane unavailable results", async () => {
  for (const change of [
    { readPersistedOrder: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } },
    { consumeRateLimit: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } },
    { confirmCharge: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } },
  ]) {
    const h = harness(change); const result = await h.run(); assert.equal(result.state, "unavailable"); assertSafe(result, h.state);
  }
});

test("transient provider failures defer without raw errors or confirmation", async () => {
  for (const fetch of [
    async () => { throw new Error(`Bearer ${secretSentinel} ${piiSentinel}`); },
    async () => new Response(piiSentinel, { status: 429 }),
    async () => new Response(piiSentinel, { status: 503 }),
  ]) {
    const h = harness({ fetch }); const result = await h.run();
    assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15);
    assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("malformed or contradictory SQL outcomes cannot claim confirmation", async () => {
  for (const data of [null, {}, { ...transactionFixture(), alreadyPaid: undefined },
    { ...transactionFixture(), duplicate: true }, { ...transactionFixture(), alreadyPaid: true },
    { ...transactionFixture(), paymentState: "failed" }, { ...transactionFixture(), orderState: "cancelled" },
    { ...transactionFixture(), privatePayload: piiSentinel }]) {
    const h = harness({ confirmCharge: async () => data }); const result = await h.run();
    assert.equal(result.state, "unavailable"); assertSafe(result, h.state);
  }
});

test("invalid JSON, UTF-8 and excessive bodies cannot reach confirmation", async () => {
  for (const fetch of [async () => new Response("{"), async () => new Response(new Uint8Array([0xc3, 0x28])),
    async () => Response.json(null), async () => Response.json([chargeFixture()]),
    async () => Response.json({ ...chargeFixture(), huge: piiSentinel.repeat(20_000) })]) {
    const h = harness({ fetch }); const result = await h.run();
    assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15);
    assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  }
});

test("overflow cancels an unclosed provider stream without awaiting a hostile source", async () => {
  let cancelled = false;
  const h = harness({ fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(256 * 1024)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  })) });
  const result = await h.run(); assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15); assert.equal(cancelled, true);
  assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
});

test("a throwing clock returns unavailable without escaping or exposing raw errors", async () => {
  const h = harness({ now: () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } });
  const outcome = await h.run().then((value) => ({ threw: false, value }), () => ({ threw: true }));
  assert.equal(outcome.threw, false, "Clock failures must be contained without propagating an error");
  assert.equal(outcome.value.state, "unavailable"); assert.equal(h.state.gets.length, 0); assertSafe(outcome.value, h.state);
});

test("a trusted configuration provider may return an object with a server-owned prototype", async () => {
  const h = harness({ readConfig: async () => Object.assign(Object.create({ serverOwned: true }), envFixture()) });
  const result = await h.run(); assert.equal(result.state, "confirmed"); assertSafe(result, h.state);
});

test("each request uses the absolute nine-second ceiling and a five-second GET ceiling", async () => {
  const originalTimeout = AbortSignal.timeout; const budgets = [];
  AbortSignal.timeout = (ms) => { budgets.push(ms); return originalTimeout(ms); };
  try {
    const h = harness({ now: () => 0 }); const result = await h.run();
    assert.equal(result.state, "confirmed"); assert.equal(budgets[0], 9000);
    assert.equal(budgets.filter((ms) => ms === 5000).length, 1);
    assert.ok(budgets.slice(1).every((ms) => ms <= 5000)); assertSafe(result, h.state);
  } finally { AbortSignal.timeout = originalTimeout; }
});

test("a stalled provider body is aborted and cancelled within its GET ceiling", async () => {
  const originalTimeout = AbortSignal.timeout; let cancelled = false;
  AbortSignal.timeout = (ms) => originalTimeout(ms === 5000 ? 5 : ms);
  const keeper = setTimeout(() => {}, 100);
  try {
    const h = harness({ now: () => 0, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
    const result = await h.run(); assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15);
    assert.equal(cancelled, true); assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  } finally { AbortSignal.timeout = originalTimeout; clearTimeout(keeper); }
});

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error("mock_aborted")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

test("the absolute nine-second budget survives a frozen clock across otherwise valid steps", async () => {
  const h = harness({ now: () => 0 });
  const original = { readPersistedOrder: h.deps.readPersistedOrder, consumeRateLimit: h.deps.consumeRateLimit, fetch: h.deps.fetch };
  h.deps.readConfig = async () => { await pause(1500); return envFixture(); };
  h.deps.readPersistedOrder = async (...args) => { await pause(1500, args[2]); return original.readPersistedOrder(...args); };
  h.deps.consumeRateLimit = async (...args) => { await pause(1500, args[1]); return original.consumeRateLimit(...args); };
  h.deps.fetch = async (...args) => { await pause(4600, args[1].signal); return original.fetch(...args); };
  const started = Date.now();
  // Keep the global unref'ed AbortSignal timer observable in Node's test worker.
  const keeper = setTimeout(() => {}, 15_000);
  try {
    const result = await h.run();
    assert.equal(result.state, "deferred"); assert.equal(result.retryAfterSeconds, 15);
    assert.ok(Date.now() - started < 10_500, "Absolute deadline must stop the frozen-clock operation");
    assert.equal(h.state.confirmations.length, 0); assertSafe(result, h.state);
  } finally { clearTimeout(keeper); }
});
