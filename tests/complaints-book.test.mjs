import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const schema = loadTs("src/lib/complaints/schema.ts");
const payload = {
  amount: 50,
  consumerAddress: "Calle de prueba 123, Lima",
  consumerName: "Persona Sintética",
  detail: "El producto del pedido sintético llegó con una diferencia.",
  documentNumber: "AB12345",
  documentType: "PASSPORT",
  email: "qa@example.invalid",
  isMinor: false,
  itemDescription: "Pack sintético de seis bagels",
  itemType: "product",
  phone: "000000000",
  privacyAccepted: true,
  representativeDocument: "",
  representativeName: "",
  requestedAction: "Solicito revisar el producto de prueba.",
  requestType: "reclamo",
  website: "",
};
const storedReceipt = { complaint_code: "LR-SYNTHETIC-000001", created_at: "2026-10-26T20:00:00Z" };

function elements(tree) {
  if (tree == null) return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}

function componentHarness() {
  const slots = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  const { ComplaintsBookForm } = loadTs("src/app/libro-de-reclamaciones/ComplaintsBookForm.tsx", {
    react: hooks,
    "@/lib/site": loadTs("src/lib/site.ts"),
  });
  return { render() { cursor = 0; return ComplaintsBookForm(); } };
}

function formEvent() {
  return { preventDefault() {}, currentTarget: {} };
}

function fakeFormData(values = payload) {
  return class { get(key) { return key === "privacyAccepted" ? "on" : values[key] ?? ""; } };
}

test("a second submit while the first request is pending cannot register a duplicate complaint", async () => {
  const harness = componentHarness();
  const form = elements(harness.render()).find((node) => node.type === "form");
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const previousFormData = globalThis.FormData;
  const previousFetch = globalThis.fetch;
  globalThis.FormData = class { get() { return ""; } };
  globalThis.fetch = async () => {
    calls++;
    await pending;
    return { ok: false, json: async () => ({ ok: false, error: "Synthetic failure" }) };
  };
  let first;
  let second;
  try {
    first = form.props.onSubmit(formEvent());
    second = form.props.onSubmit(formEvent());
    assert.equal(calls, 1, "only one request may be in flight from this form");
  } finally {
    release();
    await Promise.all([first, second]);
    globalThis.FormData = previousFormData;
    globalThis.fetch = previousFetch;
  }
});

test("a rejected request unlocks the form for an explicit retry", async () => {
  const harness = componentHarness();
  const previousFormData = globalThis.FormData;
  const previousFetch = globalThis.fetch;
  globalThis.FormData = fakeFormData();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Synthetic network rejection");
  };
  try {
    await elements(harness.render()).find((node) => node.type === "form").props.onSubmit(formEvent());
    const tree = harness.render();
    const button = elements(tree).find((node) => node.type === "button" && node.props.type === "submit");
    assert.equal(button.props.disabled, false);
    assert.match(renderToStaticMarkup(tree), /Synthetic network rejection/);
    await elements(tree).find((node) => node.type === "form").props.onSubmit(formEvent());
    assert.equal(calls, 2);
  } finally {
    globalThis.FormData = previousFormData;
    globalThis.fetch = previousFetch;
  }
});

test("the saved complaint snapshot produces a dated printable receipt without a second POST", async () => {
  const harness = componentHarness();
  const previousFormData = globalThis.FormData;
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const values = { ...payload };
  globalThis.FormData = fakeFormData(values);
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "/api/complaints");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), payload);
    await pending;
    return { ok: true, json: async () => ({ ok: true, complaint: { code: storedReceipt.complaint_code, createdAt: storedReceipt.created_at } }) };
  };
  let printed = 0;
  globalThis.window = { scrollTo() {}, print() { printed++; } };
  try {
    const form = elements(harness.render()).find((node) => node.type === "form");
    const request = form.props.onSubmit(formEvent());
    values.detail = "Texto editado después del envío y no registrado.";
    release();
    await request;
    const tree = harness.render();
    const html = renderToStaticMarkup(tree);
    assert.match(html, /LR-SYNTHETIC-000001/);
    assert.match(html, /26 de octubre de 2026/);
    assert.match(html, /El producto del pedido sintético llegó con una diferencia/);
    assert.doesNotMatch(html, /Texto editado después del envío/);
    assert.equal(elements(tree).some((node) => node.type === "form"), false);
    elements(tree).find((node) => node.type === "button").props.onClick();
    assert.equal(printed, 1);
    assert.equal(calls, 1);
  } finally {
    globalThis.FormData = previousFormData;
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function serviceHarness({ sequenceError = null, insertError = null, rateLimited = false } = {}) {
  const calls = { factory: 0, sequence: 0, limits: [], inserts: [], selections: [] };
  const client = {
    rpc(name, args) {
      if (name === "next_complaint_code") {
        calls.sequence++;
        return Promise.resolve({ data: sequenceError ? null : storedReceipt.complaint_code, error: sequenceError });
      }
      assert.equal(name, "consume_api_rate_limit");
      calls.limits.push(args);
      return { single: async () => ({ data: { allowed: !rateLimited, hits: 1, retry_after_seconds: rateLimited ? 90 : 0 }, error: null }) };
    },
    from(table) {
      assert.equal(table, "consumer_complaints");
      return { insert(row) {
        calls.inserts.push(row);
        return { select(selection) {
          calls.selections.push(selection);
          return { single: async () => ({ data: insertError ? null : storedReceipt, error: insertError }) };
        } };
      } };
    },
  };
  const admin = { createSupabaseAdminClient() { calls.factory++; return client; } };
  const service = loadTs("src/lib/complaints/service.ts", { "@/lib/supabase/admin": admin, "./schema": schema });
  return { calls, admin, service };
}

for (const [label, invalid] of [
  ["missing privacy confirmation", { privacyAccepted: false }],
  ["a populated bot trap", { website: "https://synthetic.invalid" }],
  ["a minor without a representative", { isMinor: true }],
  ["a negative amount", { amount: -1 }],
  ["an invalid email", { email: "invalid" }],
]) {
  test(`${label} is rejected before requesting a complaint number or storage`, async () => {
    const { calls, service } = serviceHarness();
    await assert.rejects(service.createComplaint({ ...payload, ...invalid }), (error) => error.name === "ZodError");
    assert.equal(calls.factory, 0);
    assert.equal(calls.sequence, 0);
    assert.equal(calls.inserts.length, 0);
  });
}

test("the service normalizes an adult's contact and omits unrelated representative and bot-trap fields", async () => {
  const { calls, service } = serviceHarness();
  const result = await service.createComplaint({
    ...payload, amount: "50.25", consumerName: "  Persona Sintética  ", documentNumber: " ab12345 ",
    email: " QA@EXAMPLE.INVALID ", representativeName: "Dato no aplicable", representativeDocument: "No aplica",
  });
  assert.deepEqual(result, storedReceipt);
  assert.equal(calls.sequence, 1);
  assert.deepEqual(calls.selections, ["complaint_code, created_at"]);
  assert.deepEqual(calls.inserts, [{
    amount: 50.25, complaint_code: "LR-SYNTHETIC-000001", consumer_address: "Calle de prueba 123, Lima",
    consumer_name: "Persona Sintética", detail: "El producto del pedido sintético llegó con una diferencia.",
    document_number: "AB12345", document_type: "PASSPORT", email: "qa@example.invalid", is_minor: false,
    item_description: "Pack sintético de seis bagels", item_type: "product", phone: "000000000", privacy_accepted: true,
    representative_document: null, representative_name: null, request_type: "reclamo",
    requested_action: "Solicito revisar el producto de prueba.", status: "received",
  }]);
});

test("a minor's representative is required and stored with the complaint", async () => {
  const { calls, service } = serviceHarness();
  await service.createComplaint({ ...payload, isMinor: true, representativeName: "  Representante Sintético ", representativeDocument: " ab98765 " });
  assert.equal(calls.inserts[0].is_minor, true);
  assert.equal(calls.inserts[0].representative_name, "Representante Sintético");
  assert.equal(calls.inserts[0].representative_document, "AB98765");
});

test("a numbering failure never inserts a complaint or returns a receipt", async () => {
  const { calls, service } = serviceHarness({ sequenceError: { code: "XX000", message: "Synthetic database failure" } });
  await assert.rejects(service.createComplaint(payload), /numeración/);
  assert.equal(calls.inserts.length, 0);
});

function routeHarness(options) {
  const harness = serviceHarness(options);
  const monitoring = { getDurationMs: () => 1, getRequestId: () => "synthetic-request", logInfo() {}, logWarn() {}, logError() {} };
  const security = loadTs("src/lib/public-api-security.ts", { "@/lib/supabase/admin": harness.admin, "@/lib/monitoring": monitoring });
  const route = loadTs("src/app/api/complaints/route.ts", {
    "@/lib/complaints/service": harness.service, "@/lib/monitoring": monitoring, "@/lib/public-api-security": security,
  });
  return { ...harness, POST: route.POST };
}

function request(body = payload) {
  return new Request("https://synthetic.invalid/api/complaints", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.1" },
  });
}

test("the real route, security, schema and service return only a no-store receipt after storage succeeds", async () => {
  const { calls, POST } = routeHarness();
  const response = await POST(request());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, complaint: { code: "LR-SYNTHETIC-000001", createdAt: "2026-10-26T20:00:00Z" } });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.limits.length, 2);
  for (const args of calls.limits) {
    assert.match(args.p_identifier, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(args).includes("qa@example.invalid"), false);
    assert.equal(JSON.stringify(args).includes("192.0.2.1"), false);
  }
});

test("the API rejects missing privacy confirmation without generating a receipt or inserting data", async () => {
  const { calls, POST } = routeHarness();
  const response = await POST(request({ ...payload, privacyAccepted: false }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).ok, false);
  assert.equal(calls.sequence, 0);
  assert.equal(calls.inserts.length, 0);
});

test("the API rejects a bot trap before any rate-limit or complaint storage operation", async () => {
  const { calls, POST } = routeHarness();
  const response = await POST(request({ ...payload, website: "https://synthetic.invalid" }));
  assert.equal(response.status, 400);
  assert.equal(calls.factory, 0);
  assert.equal(calls.inserts.length, 0);
});

test("rate limiting returns Retry-After without generating or inserting a complaint", async () => {
  const { calls, POST } = routeHarness({ rateLimited: true });
  const response = await POST(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls.sequence, 0);
  assert.equal(calls.inserts.length, 0);
});

test("a failed insert cannot produce a successful receipt or expose database error detail", async () => {
  const { calls, POST } = routeHarness({ insertError: { code: "XX000", message: "Private synthetic database detail" } });
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, "complaint"), false);
  assert.equal(JSON.stringify(result).includes("Private synthetic database detail"), false);
  assert.equal(calls.inserts.length, 1);
});
