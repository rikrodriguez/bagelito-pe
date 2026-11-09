import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedReviewTransitions, assertReviewTransition, normalizeReviewNote,
  INTENT_REVIEW_STATUSES,
} from "../src/lib/order-intents/review-state.ts";

test("recognizes exactly five non-payment review states", () => {
  assert.deepEqual([...INTENT_REVIEW_STATUSES], [
    "awaiting_human_review", "reviewing", "approved_for_followup", "rejected", "expired",
  ]);
  assert.equal(INTENT_REVIEW_STATUSES.includes("paid"), false);
});
test("first review may start or close without payment", () => {
  for (const next of ["reviewing", "rejected", "expired"])
    assert.doesNotThrow(() => assertReviewTransition("awaiting_human_review", next));
});
test("reviewing may request follow-up but not convert to a paid order", () => {
  assert.doesNotThrow(() => assertReviewTransition("reviewing", "approved_for_followup"));
  for (const next of ["paid", "confirmed", "in_production", "payment_pending_review"])
    assert.throws(() => assertReviewTransition("reviewing", next), TypeError);
});
test("cannot skip reviewing to approve a fresh request", () =>
  assert.throws(() => assertReviewTransition("awaiting_human_review", "approved_for_followup"), TypeError));
test("rejected and expired requests are terminal", () => {
  for (const from of ["rejected", "expired"])
    for (const next of INTENT_REVIEW_STATUSES)
      assert.throws(() => assertReviewTransition(from, next), TypeError);
});
test("self-transition and malformed values rejected", () => {
  for (const value of [null, 0, {}, [], "__proto__", "awaiting_human_review"]) {
    assert.throws(() => assertReviewTransition(value, "awaiting_human_review"), TypeError);
  }
});
test("allowed transition array cannot mutate actual transition table", () => {
  const first = allowedReviewTransitions("awaiting_human_review");
  assert.equal(first.includes("paid"), false);
  (first as string[]).push("paid");
  assert.equal(allowedReviewTransitions("awaiting_human_review").includes("paid" as never), false);
});
test("internal review notes are trimmed, bounded, and control-safe", () => {
  assert.equal(normalizeReviewNote("  llamar mañana  "), "llamar mañana");
  assert.throws(() => normalizeReviewNote("x".repeat(501)), TypeError);
  assert.throws(() => normalizeReviewNote("bad\u0000value"), TypeError);
  assert.throws(() => normalizeReviewNote(null), TypeError);
});
