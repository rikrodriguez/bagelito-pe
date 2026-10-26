import test from "node:test";
import assert from "node:assert/strict";
import { validateCulqiChargeResult } from "../../src/lib/payments/culqi-charge-evidence.ts";

// Synthetic server-response observations only. No provider, configuration or
// database capability is supplied; a network call is always a test failure.
let externalFetchAttempts = 0;
globalThis.fetch = () => { externalFetchAttempts++; throw new Error("Unexpected external transport"); };
test.after(() => assert.equal(externalFetchAttempts, 0, "pure validation must never request transport"));
const privateMarker = "PRIVATE-OFFLINE-not-for-evidence@example.invalid";
const binding = (mode = "test", method = "tkn") => ({
  chargeId: `chr_${mode}_OFFLINECharge09`, sourceId: `${method}_${mode}_OFFLINESource09`,
  orderCode: "BAG-OFFLINE-009", amountMinor: 12300, currencyCode: "PEN", mode,
});
const charge = (expected = binding()) => ({
  object: "charge", id: expected.chargeId, amount: expected.amountMinor, currency_code: "PEN",
  metadata: { bagelito_order_code: expected.orderCode, personal: privateMarker },
  source: { id: expected.sourceId, customer: privateMarker }, capture: true,
  current_amount: expected.amountMinor, amount_refunded: 0, dispute: false, paid: false,
  outcome: { code: "AUT0000", merchant_message: privateMarker },
});
const normalized = (expected = binding(), captureDatePresent = false) => ({
  chargeId: expected.chargeId, sourceId: expected.sourceId,
  amountMinor: expected.amountMinor, currencyCode: "PEN", capture: true,
  currentAmountMinor: expected.amountMinor, amountRefundedMinor: 0, dispute: false, captureDatePresent,
});

test("complete authenticated observations normalize test/live card and Yape bindings", () => {
  for (const mode of ["test", "live"]) for (const method of ["tkn", "ype"]) {
    const expected = binding(mode, method);
    const result = validateCulqiChargeResult(charge(expected), expected);
    assert.equal(result.verified, true);
    assert.equal(result.needsLookup, false);
    assert.deepEqual(result.evidence, normalized(expected));
    assert.equal(Object.keys(result.evidence).length, 9);
    assert.equal(JSON.stringify(result).includes(privateMarker), false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.evidence), true);
  }
});

test("the persisted order amount is used without imposing the old QA amount", () => {
  const expected = { ...binding(), amountMinor: 8500, orderCode: "BAG-OFFLINE-010" };
  assert.deepEqual(validateCulqiChargeResult(charge(expected), expected).evidence, normalized(expected));
});

const missingCases = [
  ["object", (c) => { delete c.object; }],
  ["id", (c) => { delete c.id; }],
  ["amount", (c) => { delete c.amount; }],
  ["currency", (c) => { delete c.currency_code; }],
  ["metadata", (c) => { delete c.metadata; }],
  ["metadata order", (c) => { delete c.metadata.bagelito_order_code; }],
  ["source", (c) => { delete c.source; }],
  ["source id", (c) => { delete c.source.id; }],
  ["capture", (c) => { delete c.capture; }],
  ["current amount", (c) => { delete c.current_amount; }],
  ["refund amount", (c) => { delete c.amount_refunded; }],
  ["dispute", (c) => { delete c.dispute; }],
];
for (const [name, omit] of missingCases) {
  test(`missing ${name} permits only a lookup of the bound charge`, () => {
    const resource = charge(); omit(resource);
    assert.deepEqual(validateCulqiChargeResult(resource, binding()), {
      verified: false, reason: "evidence_incomplete", needsLookup: true,
    });
  });
}

const contradictions = [
  ["3DS REVIEW marker", { action_code: "REVIEW" }, "authentication_required"],
  ["wrong object", { object: "event" }, "identity_mismatch"],
  ["wrong charge", { id: "chr_test_OFFLINEOther09" }, "identity_mismatch"],
  ["opposite charge mode", { id: "chr_live_OFFLINECharge09" }, "identity_mismatch"],
  ["wrong gross amount", { amount: 12299 }, "amount_mismatch"],
  ["string gross amount", { amount: "12300" }, "amount_mismatch"],
  ["fractional gross amount", { amount: 12300.5 }, "amount_mismatch"],
  ["unsafe gross amount", { amount: Number.MAX_SAFE_INTEGER + 1 }, "amount_mismatch"],
  ["wrong currency", { currency_code: "USD" }, "currency_mismatch"],
  ["conflicting currency alias", { currency: "USD" }, "currency_mismatch"],
  ["wrong metadata order", { metadata: { bagelito_order_code: "BAG-OFFLINE-OTHER" } }, "order_mismatch"],
  ["wrong source", { source: { id: "tkn_test_OFFLINEOther09" } }, "source_mismatch"],
  ["source mode mismatch", { source: { id: "tkn_live_OFFLINESource09" } }, "source_mismatch"],
  ["capture false", { capture: false }, "capture_not_confirmed"],
  ["string capture", { capture: "true" }, "capture_not_confirmed"],
  ["smaller current amount", { current_amount: 12299 }, "current_amount_mismatch"],
  ["larger current amount", { current_amount: 12301 }, "current_amount_mismatch"],
  ["refund observed", { amount_refunded: 1 }, "refund_observed"],
  ["string refund", { amount_refunded: "0" }, "financial_fields_invalid"],
  ["negative refund", { amount_refunded: -1 }, "financial_fields_invalid"],
  ["fractional current amount", { current_amount: 12300.1 }, "financial_fields_invalid"],
  ["string current amount", { current_amount: "12300" }, "financial_fields_invalid"],
  ["dispute observed", { dispute: true }, "dispute_observed"],
  ["string dispute", { dispute: "false" }, "financial_fields_invalid"],
];
for (const [name, delta, reason] of contradictions) {
  test(`${name} cannot authorize confirmation or a fallback lookup`, () => {
    assert.deepEqual(validateCulqiChargeResult({ ...charge(), ...delta }, binding()), {
      verified: false, reason, needsLookup: false,
    });
  });
}

test("missing evidence cannot hide any other explicit contradiction", () => {
  for (const [, omit] of missingCases) for (const [, delta] of contradictions) {
    const resource = charge(); omit(resource); Object.assign(resource, delta);
    const result = validateCulqiChargeResult(resource, binding());
    assert.equal(result.verified, false);
    assert.equal(result.needsLookup, false,
      `missing evidence must not hide ${Object.keys(delta).join(",")}`);
  }
});

test("REVIEW cannot hide an adverse refund, dispute or current amount observation", () => {
  for (const [delta, reason] of [
    [{ amount_refunded: 1 }, "refund_observed"],
    [{ dispute: true }, "dispute_observed"],
    [{ current_amount: 12299 }, "current_amount_mismatch"],
  ]) assert.deepEqual(validateCulqiChargeResult({ ...charge(), action_code: "REVIEW", ...delta }, binding()), {
    verified: false, reason, needsLookup: false,
  });
});

test("explicit null or undefined required values are incompatible rather than absent", () => {
  for (const field of ["object", "id", "amount", "currency_code", "metadata", "source", "capture",
    "current_amount", "amount_refunded", "dispute"]) for (const value of [null, undefined]) {
    const result = validateCulqiChargeResult({ ...charge(), [field]: value }, binding());
    assert.equal(result.verified, false, field);
    assert.equal(result.needsLookup, false, field);
  }
  for (const [field, nested] of [["metadata", "bagelito_order_code"], ["source", "id"]]) {
    for (const value of [null, undefined]) {
      const result = validateCulqiChargeResult({ ...charge(), [field]: { [nested]: value } }, binding());
      assert.equal(result.verified, false);
      assert.equal(result.needsLookup, false);
    }
  }
});

test("currency aliases can stand alone or agree, but a present invalid alias blocks", () => {
  const aliasOnly = charge(); delete aliasOnly.currency_code; aliasOnly.currency = "PEN";
  assert.equal(validateCulqiChargeResult(aliasOnly, binding()).verified, true);
  assert.equal(validateCulqiChargeResult({ ...charge(), currency: "PEN" }, binding()).verified, true);
  for (const currency_code of [null, undefined, "USD", 604]) {
    assert.deepEqual(validateCulqiChargeResult({ ...aliasOnly, currency_code }, binding()), {
      verified: false, reason: "currency_mismatch", needsLookup: false,
    });
  }
});

test("paid and outcome do not establish or veto capture evidence", () => {
  for (const paid of [undefined, null, false, true, "opaque"]) {
    assert.equal(validateCulqiChargeResult({ ...charge(), paid }, binding()).verified, true);
    assert.equal(validateCulqiChargeResult({ ...charge(), paid, capture: false }, binding()).verified, false);
  }
  const resource = charge();
  Object.defineProperty(resource, "paid", { get() { throw new Error(privateMarker); } });
  Object.defineProperty(resource, "outcome", { get() { throw new Error(privateMarker); } });
  assert.equal(validateCulqiChargeResult(resource, binding()).verified, true);
});

test("capture date is only an opaque presence observation", () => {
  for (const capture_date of [undefined, null, 1792122606744, "opaque-date", {}, false]) {
    const result = validateCulqiChargeResult({ ...charge(), capture_date }, binding());
    assert.equal(result.verified, true);
    assert.equal(result.evidence.captureDatePresent, capture_date !== undefined && capture_date !== null);
    assert.equal(JSON.stringify(result).includes("opaque-date"), false);
  }
});

test("unknown charge inputs fail closed without authorizing a lookup", () => {
  for (const value of [null, undefined, true, 12300, "charge", [], new Date(), Object.create(charge())]) {
    assert.deepEqual(validateCulqiChargeResult(value, binding()), {
      verified: false, reason: "malformed_charge", needsLookup: false,
    });
  }
});

test("invalid or cross-mode bindings cannot authorize any evidence", () => {
  for (const delta of [
    { mode: "sandbox" }, { mode: "unknown" }, { chargeId: "chr_live_OFFLINECharge09" },
    { sourceId: "ype_live_OFFLINESource09" }, { chargeId: "chr_test_short" },
    { sourceId: "bad_test_OFFLINESource09" }, { orderCode: "" }, { orderCode: "BAG-lowercase" },
    { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 1.5 }, { amountMinor: Infinity },
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, { currencyCode: "USD" },
  ]) assert.deepEqual(validateCulqiChargeResult(charge(), { ...binding(), ...delta }), {
    verified: false, reason: "invalid_binding", needsLookup: false,
  });
  for (const value of [null, undefined, [], Object.create(binding())]) {
    assert.deepEqual(validateCulqiChargeResult(charge(), value), {
      verified: false, reason: "invalid_binding", needsLookup: false,
    });
  }
});

test("null-prototype JSON records are accepted without inherited data", () => {
  const expected = Object.assign(Object.create(null), binding());
  const resource = Object.assign(Object.create(null), charge());
  resource.metadata = Object.assign(Object.create(null), resource.metadata);
  resource.source = Object.assign(Object.create(null), resource.source);
  assert.deepEqual(validateCulqiChargeResult(resource, expected).evidence, normalized());
});

test("accessors and reflective failures on relevant evidence fail closed without raw errors", () => {
  for (const field of ["action_code", "object", "id", "amount", "currency_code", "metadata", "source", "capture",
    "current_amount", "amount_refunded", "dispute", "capture_date"]) {
    const resource = charge();
    Object.defineProperty(resource, field, { get() { throw new Error(privateMarker); } });
    const result = validateCulqiChargeResult(resource, binding());
    assert.equal(result.verified, false, field);
    assert.equal(result.needsLookup, false, field);
    assert.equal(JSON.stringify(result).includes(privateMarker), false);
  }
  const hostile = [
    new Proxy(charge(), { getPrototypeOf() { throw new Error(privateMarker); } }),
    new Proxy(charge(), { getOwnPropertyDescriptor() { throw new Error(privateMarker); } }),
  ];
  for (const resource of hostile) assert.deepEqual(validateCulqiChargeResult(resource, binding()), {
    verified: false, reason: "malformed_charge", needsLookup: false,
  });
  for (const [field, nested] of [["metadata", "bagelito_order_code"], ["source", "id"]]) {
    const resource = charge();
    Object.defineProperty(resource[field], nested, { get() { throw new Error(privateMarker); } });
    const result = validateCulqiChargeResult(resource, binding());
    assert.equal(result.verified, false); assert.equal(result.needsLookup, false);
  }
  const expected = binding();
  Object.defineProperty(expected, "amountMinor", { get() { throw new Error(privateMarker); } });
  const result = validateCulqiChargeResult(charge(), expected);
  assert.equal(result.verified, false); assert.equal(result.needsLookup, false);
});

test("a getter returning valid data is rejected without ever invoking it", () => {
  for (const field of ["action_code", "object", "id", "amount", "currency_code", "metadata", "source", "capture",
    "current_amount", "amount_refunded", "dispute", "capture_date"]) {
    const resource = { ...charge(), capture_date: 1792122606744 };
    const value = resource[field]; let reads = 0;
    Object.defineProperty(resource, field, { get() { reads++; return value; } });
    const result = validateCulqiChargeResult(resource, binding());
    assert.equal(result.verified, false, field);
    assert.equal(result.needsLookup, false, field);
    assert.equal(reads, 0, field);
  }
  const expected = binding(); let reads = 0;
  Object.defineProperty(expected, "amountMinor", { get() { reads++; return 12300; } });
  assert.equal(validateCulqiChargeResult(charge(), expected).verified, false);
  assert.equal(reads, 0);
});
