import test from "node:test";
import assert from "node:assert/strict";
import { validateCulqiCapturedCharge } from "../../src/lib/payments/culqi-capture-evidence.ts";

const binding = () => ({ chargeId: "chr_test_OFFLINECapture01", sourceId: "tkn_test_OFFLINESource01",
  orderCode: "BAG-OFFLINE-005", amountMinor: 6600, currencyCode: "PEN" });
const charge = () => ({ object: "charge", id: binding().chargeId, amount: 6600, currency_code: "PEN",
  metadata: { bagelito_order_code: binding().orderCode, personal: "PRIVATE-fixture-only" },
  source: { id: binding().sourceId, customer: "PRIVATE-fixture-only" }, capture: true,
  current_amount: 6600, amount_refunded: 0, dispute: false, paid: false });

test("documented capture accepts paid=false and makes no operations or future refund guarantee", () => {
  for (const operations of [undefined, [], {}, [{ object: "unclassified" }]]) {
    const result = validateCulqiCapturedCharge({ ...charge(), operations }, binding());
    assert.equal(result.verified, true);
    assert.equal(result.evidence.captureDatePresent, false);
    assert.deepEqual(result.evidence, { amountMinor: 6600, currencyCode: "PEN", capture: true,
      currentAmountMinor: 6600, amountRefundedMinor: 0, dispute: false, captureDatePresent: false });
    assert.equal(JSON.stringify(result).includes("PRIVATE-fixture-only"), false);
  }
});

test("a future sandbox order uses its persisted amount instead of the pilot amount", () => {
  const expected = { ...binding(), amountMinor: 8500, orderCode: "BAG-OFFLINE-006" };
  const resource = { ...charge(), amount: 8500, current_amount: 8500,
    metadata: { bagelito_order_code: expected.orderCode } };
  assert.equal(validateCulqiCapturedCharge(resource, expected).verified, true);
  assert.equal(validateCulqiCapturedCharge(resource, binding()).verified, false);
});

for (const [name, delta, reason] of [
  ["partial refund", { amount_refunded: 100, current_amount: 6500 }, "refund_observed"],
  ["total refund", { amount_refunded: 6600, current_amount: 0 }, "refund_observed"],
  ["refund despite stale current amount", { amount_refunded: 100 }, "refund_observed"],
  ["lower current amount", { current_amount: 6500 }, "current_amount_mismatch"],
  ["higher current amount", { current_amount: 6700 }, "current_amount_mismatch"],
  ["dispute", { dispute: true }, "dispute_observed"],
  ["authorization without capture", { capture: false }, "capture_not_confirmed"],
  ["string capture", { capture: "true" }, "capture_not_confirmed"],
  ["string refund", { amount_refunded: "0" }, "financial_fields_invalid"],
  ["string current amount", { current_amount: "6600" }, "financial_fields_invalid"],
  ["string dispute", { dispute: "false" }, "financial_fields_invalid"],
  ["negative refund", { amount_refunded: -1 }, "financial_fields_invalid"],
  ["fractional current amount", { current_amount: 6600.1 }, "financial_fields_invalid"],
  ["wrong amount", { amount: 6500 }, "amount_mismatch"],
  ["numeric string gross", { amount: "6600" }, "amount_mismatch"],
  ["wrong currency", { currency_code: "USD" }, "currency_mismatch"],
  ["conflicting currency alias", { currency: "USD" }, "currency_mismatch"],
  ["null currency code with valid alias", { currency_code: null, currency: "PEN" }, "currency_mismatch"],
  ["wrong charge", { id: "chr_test_OFFLINECapture02" }, "identity_mismatch"],
  ["wrong object", { object: "event" }, "identity_mismatch"],
  ["wrong order", { metadata: { bagelito_order_code: "BAG-OTHER" } }, "order_mismatch"],
  ["wrong source", { source: { id: "tkn_test_OFFLINESource02" } }, "source_mismatch"],
]) test(`${name} blocks only this observation`, () => {
  assert.deepEqual(validateCulqiCapturedCharge({ ...charge(), ...delta }, binding()), { verified: false, reason });
  assert.equal(validateCulqiCapturedCharge(charge(), binding()).verified, true);
});

for (const field of ["current_amount", "amount_refunded", "dispute"]) {
  test(`${field} absent or null cannot be inferred from capture, paid or outcome`, () => {
    for (const missing of [null, undefined, "absent"]) {
      const resource = { ...charge(), paid: true, outcome: { code: "AUT0000" }, [field]: missing };
      if (missing === "absent") delete resource[field];
      assert.deepEqual(validateCulqiCapturedCharge(resource, binding()), { verified: false, reason: "financial_fields_missing" });
    }
  });
}

test("known pending or completed refund blocks; rejected refund is not returned money", () => {
  for (const state of ["pending", "completed", "unknown"]) {
    assert.deepEqual(validateCulqiCapturedCharge(charge(), binding(), { chargeId: binding().chargeId, state }),
      { verified: false, reason: `known_refund_${state}` });
  }
  assert.equal(validateCulqiCapturedCharge(charge(), binding(), { chargeId: binding().chargeId, state: "rejected" }).verified, true);
  assert.equal(validateCulqiCapturedCharge({ ...charge(), amount_refunded: 100 }, binding(),
    { chargeId: binding().chargeId, state: "rejected" }).verified, false);
  assert.equal(validateCulqiCapturedCharge(charge(), binding(), { chargeId: "chr_test_OFFLINEOther01", state: "pending" }).reason,
    "known_refund_invalid");
});

test("no known refund observation is not an exhaustive absence requirement", () => {
  for (const known of [undefined, null]) assert.equal(validateCulqiCapturedCharge(charge(), binding(), known).verified, true);
});

test("capture_date remains opaque and never establishes the financial decision", () => {
  for (const capture_date of [undefined, null, 1669244278000, "opaque-unit-unspecified", {}, false]) {
    const result = validateCulqiCapturedCharge({ ...charge(), capture_date }, binding());
    assert.equal(result.verified, true);
    assert.equal(result.evidence.captureDatePresent, capture_date !== null && capture_date !== undefined);
    assert.equal(JSON.stringify(result).includes("opaque-unit-unspecified"), false);
  }
});

test("only sandbox IDs and integral persisted amount are eligible", () => {
  for (const delta of [{ chargeId: "chr_live_OFFLINECapture01" }, { sourceId: "tkn_live_OFFLINESource01" },
    { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 1.1 }, { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { currencyCode: "USD" }, { orderCode: "" }]) {
    assert.deepEqual(validateCulqiCapturedCharge(charge(), { ...binding(), ...delta }), { verified: false, reason: "invalid_binding" });
  }
});

test("malformed input and throwing properties produce closed reasons without raw errors", () => {
  for (const value of [null, undefined, [], "charge", 6600]) assert.equal(validateCulqiCapturedCharge(value, binding()).verified, false);
  const hostile = charge(); Object.defineProperty(hostile, "amount", { get() { throw new Error("PRIVATE-fixture-only"); } });
  const result = validateCulqiCapturedCharge(hostile, binding());
  assert.deepEqual(result, { verified: false, reason: "malformed_charge" });
});
