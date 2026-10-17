import test from "node:test";
import assert from "node:assert/strict";
import { createCulqiReadonlyDiagnostic, getCulqiReadonlyDiagnosticScope } from "../../src/lib/payments/culqi-readonly-diagnostic.ts";

// This suite has no real client, DB, keys or network. A global call is a failure.
globalThis.fetch = () => { throw new Error("Unexpected real network call"); };
const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const request = { method: "POST", origin: ORIGIN, host: new URL(ORIGIN).host, referer: `${ORIGIN}/admin` };
const types = ["charge.creation.succeeded", "charge.creation.failed"];
const labels = ["qa_yape", "qa_visa", "qa_3ds"];
const codes = ["BAG-000001", "BAG-000002", "BAG-000004"];
const secretSentinel = "sk_test_OFFLINESecretSentinel";
const piiSentinel = "fixturePERSONALPRIVATEcard1234";
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
// Public sandbox resource IDs are pinned in server code; all responses here are mocks.
const chargeIds = ["chr_test_WIu0Hn7e9r2MqEue", "chr_test_BGmSf0LA6lKdxdcz", "chr_test_SA3U26iSk7KDn0BI"];
const targets = codes.map((orderCode, i) => ({ orderCode, label: labels[i], chargeId: chargeIds[i] }));
const rowFixture = (i) => ({
  order_code: codes[i], payment_charge_id: targets[i].chargeId,
  payment_provider: "culqi", payment_lane: "token", payment_order_id: null,
  payment_amount_minor: 6600, payment_currency: "PEN",
  payment_charge_source_id: `${i === 0 ? "ype" : "tkn"}_test_OFFLINESource${i}`,
});
const chargeFixture = (i) => ({
  object: "charge", id: targets[i].chargeId, amount: 6600, currency_code: "PEN",
  metadata: { bagelito_order_code: codes[i], unrelated: piiSentinel },
  source: { id: rowFixture(i).payment_charge_source_id, card_data: piiSentinel },
  capture: true, capture_date: 1792011092944, paid: false,
  outcome: { code: "AUT0000", message: piiSentinel },
});
const eventFixture = (i, type = types[0], suffix = String(i)) => ({
  id: `evt_test_OFFLINEEvent${suffix}`, type, creation_date: 1792011000000,
  data: chargeFixture(i),
});

function harness(change = {}) {
  const state = { calls: [], steps: [], logs: [], events: [eventFixture(0), eventFixture(1), eventFixture(2)] };
  const deps = {
    requireAdmin: async () => { state.steps.push("auth"); },
    verifyActionCsrf: async () => { state.steps.push("csrf"); return true; },
    readConfig: async () => { state.steps.push("config"); return envFixture(); },
    readOrders: async (selected) => { state.steps.push("orders"); assert.deepEqual(selected, codes); return codes.map((_, i) => rowFixture(i)); },
    safeLog: (name, payload) => state.logs.push({ name, payload }),
    fetch: async (url, init) => {
      state.calls.push({ url, init });
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://api.culqi.com");
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers.Authorization, `Bearer ${secretSentinel}`);
      if (parsed.pathname.startsWith("/v2/charges/")) {
        const i = targets.findIndex((target) => parsed.pathname.endsWith(target.chargeId));
        assert.notEqual(i, -1);
        return Response.json(chargeFixture(i));
      }
      if (parsed.pathname === "/v2/events") {
        assert.equal(parsed.searchParams.get("creation_date_from"), "1792009200");
        assert.equal(parsed.searchParams.get("creation_date_to"), "1792011300");
        assert.equal(parsed.searchParams.get("limit"), "100");
        assert.equal(parsed.searchParams.has("charge_id"), false);
        assert.equal(parsed.searchParams.has("after"), false);
        assert.equal(parsed.searchParams.has("before"), false);
        return Response.json({ data: state.events.filter((event) => event.type === parsed.searchParams.get("type")), total: 999, current: 1, has_more: true });
      }
      const event = state.events.find((item) => parsed.pathname.endsWith(item.id));
      assert.ok(event);
      return Response.json(event);
    },
    ...change,
  };
  return { run: createCulqiReadonlyDiagnostic(deps), state, deps };
}
function noLeak(report, state) {
  const text = JSON.stringify({ report, logs: state.logs });
  for (const forbidden of [secretSentinel, piiSentinel, "Bearer", ...targets.map((target) => target.chargeId), ...codes,
    ...codes.map((_, i) => rowFixture(i).payment_charge_source_id), "OFFLINEEvent", "malicious.invalid", "x-debug-secret"]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  for (const result of Object.values(report.results)) for (const value of Object.values(result)) assert.equal(typeof value, "boolean");
  for (const value of Object.values(report.checks)) assert.equal(typeof value, "boolean");
  assert.equal(report.merchantAssociationVerified, false);
  for (const entry of state.logs) assert.equal(entry.payload.merchantAssociationVerified, false);
  assert.deepEqual(Object.keys(report.eventListQueries).sort(), ["succeeded", "failed"].sort());
  for (const query of Object.values(report.eventListQueries)) {
    assert.deepEqual(Object.keys(query).sort(), ["attempted", "succeeded", "failed"].sort());
    for (const value of Object.values(query)) assert.equal(typeof value, "boolean");
    if (query.succeeded || query.failed) assert.equal(query.attempted, true);
    assert.equal(query.succeeded && query.failed, false);
  }
}

test("exported metadata scope is boolean-only and never accesses payment keys", () => {
  let keyReads = 0;
  const config = new Proxy(envFixture(), {
    get(target, prop) {
      if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") {
        keyReads++;
        throw new Error("scope accessed payment material");
      }
      return target[prop];
    },
  });
  const allowed = getCulqiReadonlyDiagnosticScope(config);
  assert.ok(Object.values(allowed).every((value) => value === true));
  const denied = getCulqiReadonlyDiagnosticScope({ ...envFixture(), VERCEL_ENV: "production" });
  assert.ok(Object.values(denied).every((value) => typeof value === "boolean"));
  assert.ok(Object.values(denied).some((value) => value === false));
  assert.equal(keyReads, 0);
});

test("authenticated read is GET-only, bounded, local-pinned and never confirms payment", async () => {
  const h = harness(); const report = await h.run(request);
  assert.deepEqual(h.state.steps, ["auth", "csrf", "config", "orders"]);
  assert.equal(report.completed, true); assert.equal(report.ok, true);
  assert.equal(h.state.calls.length, 8);
  assert.equal(report.scanComplete, false); assert.equal(report.paidConfirmed, false);
  assert.equal(report.merchantAssociationVerified, false);
  assert.equal(report.captureSemanticsVerified, false); assert.equal(report.reconciliationApplied, false);
  assert.equal(report.writesAttempted, false);
  for (const result of Object.values(report.results)) {
    assert.equal(result.successfulEventVerified, true);
    assert.equal(result.eventTimestampUnitsVerified, true);
    assert.equal(result.captureFlagTrue, true); assert.equal(result.captureDatePresent, true);
    assert.equal(result.captureDateContractVerified, false); assert.equal(result.requiresReview, true);
  }
  noLeak(report, h.state);
});

test("unauthenticated request stops before CSRF/config/DB/provider, raw error is suppressed", async () => {
  const h = harness({ requireAdmin: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } });
  const report = await h.run(request);
  assert.equal(report.stage, "authentication"); assert.equal(h.state.calls.length, 0);
  assert.deepEqual(h.state.steps, []); noLeak(report, h.state);
});

test("CSRF false or throwing stops before all config reads", async () => {
  for (const verifyActionCsrf of [async () => false, async () => undefined, async () => "true", async () => { throw new Error(piiSentinel); }]) {
    const h = harness({ verifyActionCsrf }); const report = await h.run(request);
    assert.equal(report.stage, "csrf"); assert.deepEqual(h.state.steps, ["auth"]);
    assert.equal(h.state.calls.length, 0); noLeak(report, h.state);
  }
});

for (const [name, patch] of [
  ["wrong Origin", { origin: "https://malicious.invalid" }], ["missing Origin", { origin: undefined }],
  ["null Origin", { origin: "null" }], ["wrong Host", { host: "malicious.invalid" }],
  ["wrong forwarded Host", { forwardedHost: "malicious.invalid" }],
  ["multiple forwarded Hosts", { forwardedHost: `${new URL(ORIGIN).host}, malicious.invalid` }],
  ["cross-site request", { fetchSite: "cross-site" }],
  ["same-site foreign request", { fetchSite: "same-site" }],
  ["Fetch-Site none request", { fetchSite: "none" }],
  ["GET action", { method: "GET" }], ["wrong Referer", { referer: "https://malicious.invalid/admin" }],
  ["credentialed Referer", { referer: `https://user:pass@${new URL(ORIGIN).host}/admin` }],
]) test(`${name} fails before reading config`, async () => {
  const h = harness(); const report = await h.run({ ...request, ...patch });
  assert.equal(report.stage, "origin"); assert.deepEqual(h.state.steps, ["auth", "csrf"]);
  assert.equal(h.state.calls.length, 0); noLeak(report, h.state);
});

test("canonical forwarded Host and same-origin Fetch-Site preserve authenticated reads", async () => {
  const h = harness();
  const report = await h.run({ ...request, forwardedHost: new URL(ORIGIN).host, fetchSite: "same-origin" });
  assert.equal(report.completed, true); assert.equal(report.paidConfirmed, false);
  noLeak(report, h.state);
});

for (const [name, field, value] of [
  ["production", "VERCEL_ENV", "production"], ["target production", "VERCEL_TARGET_ENV", "production"],
  ["wrong project", "VERCEL_PROJECT_ID", "prj_else"], ["wrong branch", "VERCEL_GIT_COMMIT_REF", "main"],
  ["wrong repo", "VERCEL_GIT_REPO_SLUG", "other"], ["wrong branch origin", "VERCEL_BRANCH_URL", "malicious.invalid"],
  ["production site", "NEXT_PUBLIC_SITE_URL", "https://bagelito.pe"],
  ["wrong QA", "NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"],
  ["live mode", "CULQI_MODE", "live"], ["live approved", "CULQI_LIVE_APPROVED", "true"],
  ["missing live flag", "CULQI_LIVE_APPROVED", undefined], ["disabled", "CULQI_ENABLED", "false"],
]) test(`${name} fails before payment key access`, async () => {
  let keyReads = 0;
  const h = harness({ readConfig: async () => new Proxy({ ...envFixture(), [field]: value }, {
    get(target, prop) { if (prop === "CULQI_SECRET_KEY" || prop === "NEXT_PUBLIC_CULQI_PUBLIC_KEY") keyReads++; return target[prop]; },
  }) });
  const report = await h.run(request);
  assert.equal(report.stage, "scope"); assert.equal(keyReads, 0);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.steps.includes("orders"), false); noLeak(report, h.state);
});

for (const [field, value] of [["CULQI_SECRET_KEY", undefined], ["CULQI_SECRET_KEY", "sk_live_OFFLINEInvalid"],
  ["NEXT_PUBLIC_CULQI_PUBLIC_KEY", "pk_live_OFFLINEInvalid"], ["CULQI_SECRET_KEY", "sk_test_abc\r\nx-debug-secret: x"]]) {
  test(`test prefixes reject ${field} invalid/missing value`, async () => {
    const h = harness({ readConfig: async () => ({ ...envFixture(), [field]: value }) });
    const report = await h.run(request); assert.equal(report.stage, "test_keys");
    assert.equal(h.state.calls.length, 0); noLeak(report, h.state);
  });
}

test("caller IDs/JSON/headers are ignored and never select a resource or leak", async () => {
  const h = harness(); const input = { ...request, chargeId: "chr_live_HOSTILE", headers: { "x-debug-secret": piiSentinel } };
  Object.defineProperty(input, "body", { get() { throw new Error("caller body was accessed"); } });
  const report = await h.run(input); assert.equal(report.completed, true); noLeak(report, h.state);
});

test("dependencies.targets are ignored and cannot override fixed server charge IDs", async () => {
  const h = harness();
  Object.defineProperty(h.deps, "targets", { get() { throw new Error("caller target capability was accessed"); } });
  const report = await h.run({ ...request, targets: [{ chargeId: "../../malicious.invalid" }] });
  assert.equal(report.completed, true);
  assert.deepEqual(h.state.calls.filter((call) => new URL(call.url).pathname.startsWith("/v2/charges/"))
    .map((call) => new URL(call.url).pathname), chargeIds.map((id) => `/v2/charges/${id}`));
  noLeak(report, h.state);
});

test("entire missing configuration fails closed without reads or provider GET", async () => {
  const h = harness({ readConfig: async () => undefined });
  const report = await h.run(request);
  assert.equal(report.ok, false); assert.equal(report.stage, "scope");
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.steps.includes("orders"), false);
  noLeak(report, h.state);
});

test("current GET charge mismatches prevent listed and verified events from passing", async () => {
  for (const patch of [{ amount: 6601 }, { currency_code: "USD" }, { currency: "USD" },
    { id: "chr_test_OFFLINEUnexpected" }, { source: null }, { metadata: null }, { object: "token" }]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(targets[0].chargeId)
      ? Response.json({ ...chargeFixture(0), ...patch }) : original(url, init);
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.successfulEventVerified, false);
    assert.equal(report.results.qa_yape.requiresReview, true);
    assert.equal(report.results.qa_yape.chargeQueryAttempted, true);
    assert.equal(report.results.qa_yape.chargeQueryFailed, false);
    assert.equal(report.results.qa_yape.chargeFetched, true);
    assert.equal(report.results.qa_yape.candidateRejected, true);
    assert.equal(report.paidConfirmed, false); noLeak(report, h.state);
  }
});

test("DB identity, live source, duplicate rows and provider mismatches fail before provider GET", async () => {
  const variants = [
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), ...(i === 0 ? { payment_charge_id: "chr_test_OTHERCharge" } : {}) })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_charge_id: "../../malicious.invalid" })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_provider: "manual" })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_lane: "legacy" })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_order_id: "ord_test_OTHEROrder1" })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_amount_minor: 6601 })) },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_currency: "USD" })) },
    { readOrders: async () => [rowFixture(0), rowFixture(0), rowFixture(2)] },
    { readOrders: async () => codes.map((_, i) => ({ ...rowFixture(i), payment_charge_source_id: "tkn_live_FAKEsource" })) },
  ];
  for (const variant of variants) {
    const h = harness(variant); const report = await h.run(request);
    assert.equal(report.ok, false); assert.equal(h.state.calls.length, 0); noLeak(report, h.state);
  }
});

test("AUT0000 alone, paid and capture flags never create approval", async () => {
  for (const observation of [{ capture: false, capture_date: null, paid: true }, { capture: true, capture_date: 1792011000000, paid: false }]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.includes("/charges/")
      ? Response.json({ ...chargeFixture(targets.findIndex((t) => url.endsWith(t.chargeId))), ...observation })
      : original(url, init);
    const report = await h.run(request); assert.equal(report.paidConfirmed, false);
    for (const result of Object.values(report.results)) assert.equal(result.capturedPaymentConfirmed, false);
    noLeak(report, h.state);
  }
});

test("capture observations retain unknown semantics even with malformed date types", async () => {
  for (const observation of [
    { capture: "true", capture_date: null, paid: true },
    { capture: 1, capture_date: "not-a-contractual-date", paid: true },
    { capture: true, capture_date: {}, paid: false },
    { capture: true, capture_date: false, paid: false },
    { capture: true, capture_date: 0, paid: false },
  ]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.includes("/charges/")
      ? Response.json({ ...chargeFixture(targets.findIndex((t) => url.endsWith(t.chargeId))), ...observation })
      : original(url, init);
    const report = await h.run(request);
    assert.equal(report.completed, true); assert.equal(report.paidConfirmed, false);
    assert.equal(report.captureSemanticsVerified, false);
    for (const result of Object.values(report.results)) {
      assert.equal(result.captureFlagTrue, observation.capture === true);
      assert.equal(result.captureDatePresent, observation.capture_date !== null);
      assert.equal(result.captureDateContractVerified, false);
      assert.equal(result.capturedPaymentConfirmed, false);
    }
    noLeak(report, h.state);
  }
});

test("serialized and object event data are accepted only after detail GET", async () => {
  const h = harness(); h.state.events[1].data = JSON.stringify(h.state.events[1].data);
  const report = await h.run(request); assert.equal(report.results.qa_visa.successfulEventVerified, true);
  assert.equal(h.state.calls.filter((call) => new URL(call.url).pathname.startsWith("/v2/events/")).length, 3);
  noLeak(report, h.state);
});

test("listed success cannot pass if authenticated GET returns mismatch", async () => {
  for (const patch of [
    { id: "evt_test_OTHEREvent1" }, { type: "charge.creation.failed" }, { creation_date: 1792011000 },
    { data: { ...chargeFixture(0), amount: 6601 } },
    { data: { ...chargeFixture(0), currency_code: "USD" } },
    { data: { ...chargeFixture(0), currency: "USD" } },
    { data: { ...chargeFixture(0), metadata: { bagelito_order_code: "BAG-999999" } } },
    { data: { ...chargeFixture(0), source: { id: "tkn_test_OTHERSource1" } } },
    { data: JSON.stringify(piiSentinel) }, { data: [chargeFixture(0)] },
  ]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => url.endsWith(h.state.events[0].id)
      ? Response.json({ ...h.state.events[0], ...patch }) : original(url, init);
    const report = await h.run(request);
    assert.equal(report.results.qa_yape.successfulEventVerified, false);
    assert.equal(report.results.qa_yape.eventDetailQueryAttempted, true);
    assert.equal(report.results.qa_yape.eventDetailQueryFailed, false);
    assert.equal(report.results.qa_yape.candidateRejected, true);
    assert.equal(report.rejectedCandidatePresent, true); noLeak(report, h.state);
  }
});

test("seconds event timestamps, live IDs and malicious JSON never trigger candidate GET", async () => {
  const h = harness(); h.state.events = [
    { ...eventFixture(0), creation_date: 1792011000 },
    { ...eventFixture(1), id: "evt_live_HOSTILEEvent1" },
    { ...eventFixture(2), id: "../../malicious.invalid" },
    { ...eventFixture(0, types[0], "99"), data: "{invalid json" },
  ];
  const report = await h.run(request);
  assert.equal(h.state.calls.length, 5); assert.equal(report.rejectedCandidatePresent, true);
  for (const result of Object.values(report.results)) assert.equal(result.eventVerifiedById, false);
  for (const result of Object.values(report.results)) {
    assert.equal(result.candidateRejected, true);
    assert.equal(result.eventDetailQueryAttempted, false);
    assert.equal(result.eventDetailQueryFailed, false);
  }
  noLeak(report, h.state);
});

test("conflicting verified events remain in review and never reconcile", async () => {
  const h = harness(); h.state.events.push(eventFixture(0, types[1], "Failure0"));
  const report = await h.run(request);
  assert.equal(report.results.qa_yape.conflictingEventsPresent, true);
  assert.equal(report.results.qa_yape.requiresReview, true); assert.equal(report.paidConfirmed, false);
  noLeak(report, h.state);
});

test("candidate and request caps stop the scan without inferring absence", async () => {
  const h = harness(); h.state.events = Array.from({ length: 21 }, (_, i) => eventFixture(0, types[0], `Many${i}`));
  const report = await h.run(request);
  assert.equal(report.candidateLimitReached, true); assert.equal(report.completed, false);
  assert.equal(h.state.calls.length, 24); assert.equal(report.scanComplete, false); noLeak(report, h.state);
});

test("provider/DB errors, malformed JSON, excessive bodies and headers never leak", async () => {
  const variants = [
    { readOrders: async () => { throw new Error(`${secretSentinel} ${piiSentinel}`); } },
    { fetch: async () => { throw new Error(`Bearer ${secretSentinel} ${piiSentinel}`); } },
    { fetch: async () => new Response(`${secretSentinel} ${piiSentinel}`, { status: 500, headers: { "x-debug-secret": secretSentinel } }) },
    { fetch: async () => new Response(`{"bad":"${piiSentinel}"`) },
    { fetch: async () => Response.json({ ...chargeFixture(0), huge: piiSentinel.repeat(20_000) }) },
  ];
  for (const variant of variants) {
    const h = harness(variant); const report = await h.run(request);
    assert.equal(report.ok, false); noLeak(report, h.state);
  }
});

test("stream limits cancel excessive charge, list and detail bodies before approval", async () => {
  for (const [selectedPath, byteLimit, expectedStage] of [
    ["/v2/charges/", 256 * 1024, "charge_lookup"],
    ["/v2/events?", 2 * 1024 * 1024, "event_list"],
    ["/v2/events/", 256 * 1024, "event_lookup"],
  ]) {
    let cancelled = false;
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      if (!url.includes(selectedPath)) return original(url, init);
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(byteLimit));
          controller.enqueue(new Uint8Array(1));
        },
        cancel() { cancelled = true; },
      }));
    };
    const report = await h.run(request);
    assert.equal(cancelled, true); assert.equal(report.ok, false);
    assert.equal(report.stage, expectedStage); assert.equal(report.paidConfirmed, false);
    assert.equal(report.completed, false); noLeak(report, h.state);
  }
});

test("invalid UTF-8, non-object JSON and missing response bodies fail closed", async () => {
  for (const fetch of [
    async () => new Response(new Uint8Array([0xc3, 0x28])),
    async () => Response.json(null),
    async () => Response.json([chargeFixture(0)]),
    async () => new Response(null),
  ]) {
    const h = harness({ fetch }); const report = await h.run(request);
    assert.equal(report.ok, false); assert.equal(report.stage, "charge_lookup");
    assert.equal(report.results.qa_yape.chargeFetched, false); noLeak(report, h.state);
  }
});

test("malformed or oversized list envelopes cannot trigger event detail GET", async () => {
  for (const data of [null, {}, Array.from({ length: 101 }, () => eventFixture(0))]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => new URL(url).pathname === "/v2/events"
      ? Response.json({ data }) : original(url, init);
    const report = await h.run(request);
    assert.equal(report.ok, false); assert.equal(report.stage, "event_list");
    assert.equal(h.state.calls.filter((call) => new URL(call.url).pathname.startsWith("/v2/events/")).length, 0);
    noLeak(report, h.state);
  }
});

test("duplicate event IDs cause only one authenticated detail GET", async () => {
  const h = harness(); h.state.events = Array.from({ length: 100 }, () => eventFixture(0));
  const report = await h.run(request);
  assert.equal(report.completed, true); assert.equal(report.results.qa_yape.successfulEventVerified, true);
  assert.equal(h.state.calls.filter((call) => new URL(call.url).pathname.startsWith("/v2/events/")).length, 1);
  assert.equal(report.scanComplete, false); noLeak(report, h.state);
});

test("deadline aborts subsequent requests, empty lists still are partial, logger errors suppressed", async () => {
  let tick = 0;
  const h = harness({ now: () => tick++ === 0 ? 0 : 90_001 });
  const aborted = await h.run(request); assert.equal(aborted.ok, false); assert.equal(h.state.calls.length, 0); noLeak(aborted, h.state);
  const empty = harness({ safeLog: () => { throw new Error(secretSentinel); } }); empty.state.events = [];
  const report = await empty.run(request); assert.equal(report.completed, true); assert.equal(report.scanComplete, false);
  assert.equal(report.results.qa_yape.successfulEventVerified, false); noLeak(report, empty.state);
});

test("requests near the global deadline receive only the remaining time budget", async () => {
  const actualTimeout = AbortSignal.timeout;
  const budgets = [];
  AbortSignal.timeout = (milliseconds) => { budgets.push(milliseconds); return actualTimeout(milliseconds); };
  try {
    let tick = 0;
    const h = harness({ now: () => tick++ === 0 ? 0 : 89_000 });
    const report = await h.run(request);
    assert.equal(report.completed, true); assert.equal(budgets.length, 8);
    assert.ok(budgets.every((budget) => budget === 1000)); noLeak(report, h.state);
  } finally { AbortSignal.timeout = actualTimeout; }
});

test("body reads obey the remaining deadline abort and suppress raw stream errors", async () => {
  let tick = 0; let aborted = false;
  const h = harness({
    now: () => tick++ === 0 ? 0 : 89_998,
    fetch: async (_url, init) => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          init.signal.addEventListener("abort", () => {
            aborted = true;
            controller.error(new Error(`${secretSentinel} ${piiSentinel}`));
          }, { once: true });
        },
      }),
    }),
  });
  // AbortSignal timers are unref'ed in Node. Keep this mock test alive briefly.
  const timer = setTimeout(() => {}, 50);
  try {
    const report = await h.run(request);
    assert.equal(aborted, true); assert.equal(report.ok, false);
    assert.equal(report.stage, "charge_lookup");
    assert.equal(report.results.qa_yape.chargeFetched, false); noLeak(report, h.state);
  } finally { clearTimeout(timer); }
});

test("two valid empty pages report only bounded page absence, never an exhaustive scan", async () => {
  const h = harness(); h.state.events = [];
  const report = await h.run(request);
  assert.equal(report.completed, true); assert.equal(report.scanComplete, false);
  assert.deepEqual(report.eventListQueries, {
    succeeded: { attempted: true, succeeded: true, failed: false },
    failed: { attempted: true, succeeded: true, failed: false },
  });
  for (const result of Object.values(report.results)) {
    assert.equal(result.chargeQueryAttempted, true); assert.equal(result.chargeQueryFailed, false);
    assert.equal(result.candidatesFound, false); assert.equal(result.candidateRejected, false);
    assert.equal(result.eventDetailQueryAttempted, false); assert.equal(result.eventDetailQueryFailed, false);
    assert.equal(result.noCandidatesInScannedPages, true);
  }
  noLeak(report, h.state);
});

test("a failed charge query identifies its reference and leaves later references unknown", async () => {
  for (const failureIndex of [0, 1]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      if (url.endsWith(chargeIds[failureIndex])) {
        h.state.calls.push({ url, init });
        throw new Error(piiSentinel);
      }
      return original(url, init);
    };
    const report = await h.run(request);
    assert.equal(report.completed, false); assert.equal(report.stage, "charge_lookup");
    for (let i = 0; i < labels.length; i++) {
      const result = report.results[labels[i]];
      assert.equal(result.chargeQueryAttempted, i <= failureIndex);
      assert.equal(result.chargeQueryFailed, i === failureIndex);
      assert.equal(result.chargeFetched, i < failureIndex);
      assert.equal(result.noCandidatesInScannedPages, false);
      assert.equal(result.candidateRejected, false);
    }
    for (const query of Object.values(report.eventListQueries)) assert.equal(query.attempted, false);
    assert.equal(h.state.calls.length, failureIndex + 1); noLeak(report, h.state);
  }
});

test("first or second list query failure never certifies absence for any charge", async () => {
  for (const failureIndex of [0, 1]) {
    const h = harness(); h.state.events = []; const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/v2/events" && parsed.searchParams.get("type") === types[failureIndex]) {
        h.state.calls.push({ url, init });
        return new Response(piiSentinel, { status: 503 });
      }
      return original(url, init);
    };
    const report = await h.run(request);
    assert.equal(report.completed, false); assert.equal(report.stage, "event_list");
    for (let i = 0; i < types.length; i++) {
      const query = report.eventListQueries[i === 0 ? "succeeded" : "failed"];
      assert.equal(query.attempted, i <= failureIndex);
      assert.equal(query.succeeded, i < failureIndex);
      assert.equal(query.failed, i === failureIndex);
    }
    for (const result of Object.values(report.results)) {
      assert.equal(result.chargeFetched, true);
      assert.equal(result.noCandidatesInScannedPages, false);
      assert.equal(result.eventDetailQueryAttempted, false);
      assert.equal(result.candidateRejected, false);
    }
    noLeak(report, h.state);
  }
});

test("invalid list envelopes mark that query failed despite valid HTTP and JSON", async () => {
  for (const data of [null, {}, Array.from({ length: 101 }, () => eventFixture(0))]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => new URL(url).pathname === "/v2/events"
      ? Response.json({ data }) : original(url, init);
    const report = await h.run(request);
    assert.equal(report.completed, false);
    assert.deepEqual(report.eventListQueries, {
      succeeded: { attempted: true, succeeded: false, failed: true },
      failed: { attempted: false, succeeded: false, failed: false },
    });
    for (const result of Object.values(report.results)) assert.equal(result.noCandidatesInScannedPages, false);
    noLeak(report, h.state);
  }
});

test("failed event detail GET remains unknown rather than declaring a rejected event", async () => {
  for (const failureIndex of [0, 1]) {
    const h = harness(); const original = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      if (url.endsWith(h.state.events[failureIndex].id)) {
        h.state.calls.push({ url, init });
        throw new Error(piiSentinel);
      }
      return original(url, init);
    };
    const report = await h.run(request);
    assert.equal(report.completed, false); assert.equal(report.stage, "event_lookup");
    assert.deepEqual(report.eventListQueries, {
      succeeded: { attempted: true, succeeded: true, failed: false },
      failed: { attempted: false, succeeded: false, failed: false },
    });
    for (let i = 0; i < labels.length; i++) {
      const result = report.results[labels[i]];
      assert.equal(result.eventDetailQueryAttempted, i <= failureIndex);
      assert.equal(result.eventDetailQueryFailed, i === failureIndex);
      assert.equal(result.eventVerifiedById, i < failureIndex);
      assert.equal(result.candidateRejected, false);
      assert.equal(result.noCandidatesInScannedPages, false);
    }
    noLeak(report, h.state);
  }
});

test("a candidate for one reference does not hide bounded absence for the other two", async () => {
  const h = harness(); h.state.events = [eventFixture(1)];
  const report = await h.run(request);
  assert.equal(report.completed, true); assert.equal(report.scanComplete, false);
  for (let i = 0; i < labels.length; i++) {
    const result = report.results[labels[i]];
    assert.equal(result.candidatesFound, i === 1);
    assert.equal(result.eventDetailQueryAttempted, i === 1);
    assert.equal(result.eventDetailQueryFailed, false);
    assert.equal(result.noCandidatesInScannedPages, i !== 1);
  }
  noLeak(report, h.state);
});

test("unclassifiable list entries keep absence unknown even after both page reads", async () => {
  for (const malformedEntry of [null, { data: "{invalid json" }, { data: [chargeFixture(0)] }]) {
    const h = harness(); h.state.events = [{ type: types[0], ...malformedEntry }];
    const report = await h.run(request);
    assert.equal(report.completed, true); assert.equal(report.scanComplete, false);
    assert.equal(report.rejectedCandidatePresent, true);
    for (const query of Object.values(report.eventListQueries)) assert.equal(query.succeeded, true);
    for (const result of Object.values(report.results)) {
      assert.equal(result.noCandidatesInScannedPages, false);
      assert.equal(result.candidateRejected, false);
      assert.equal(result.eventDetailQueryAttempted, false);
    }
    noLeak(report, h.state);
  }
});
