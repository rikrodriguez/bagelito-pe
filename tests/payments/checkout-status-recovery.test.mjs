import test from "node:test";
import assert from "node:assert/strict";
import { checkoutRecoveryOutcome, checkoutRecoveryRetryDelay } from "../../src/lib/payments/checkout-recovery.ts";

test("authoritative paid clears pending recovery; later cancelled review remains locked", () => {
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: "paid", reconciliationRequired: false,
    recoveryState: "deferred" }), "paid");
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: "paid", reconciliationRequired: true,
    recoveryState: "confirmed" }), "review");
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: "pending", reconciliationRequired: false,
    recoveryState: "confirmed" }), "pending");
});

test("critical evidence requiring review locks this pending checkout without claiming paid", () => {
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: "pending", reconciliationRequired: false,
    recoveryState: "review_required" }), "review");
  assert.equal(checkoutRecoveryOutcome({ ok: false, paymentStatus: "paid", reconciliationRequired: false,
    recoveryState: "confirmed" }), "pending");
});

test("provider cooldown hints and malformed hints cannot cause busy polling", () => {
  assert.equal(checkoutRecoveryRetryDelay({}), 1500);
  for (const retryAfterSeconds of [undefined, 0, -1, 15.1, 100, NaN, Infinity, "1"]) {
    assert.equal(checkoutRecoveryRetryDelay({ recoveryState: "deferred", retryAfterSeconds }), 15100);
  }
  assert.equal(checkoutRecoveryRetryDelay({ recoveryState: "deferred", retryAfterSeconds: 1 }), 1100);
  assert.equal(checkoutRecoveryRetryDelay({ recoveryState: "deferred", retryAfterSeconds: 15 }), 15100);
});
