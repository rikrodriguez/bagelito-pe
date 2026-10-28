import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = await readFile(
  new URL("../src/lib/instagram/policy.ts", import.meta.url),
  "utf8",
);

test("Instagram policy keeps high-risk cases out of auto-send", () => {
  for (const intent of [
    "complaint",
    "refund",
    "missing_item",
    "damaged_order",
    "food_safety",
    "allergy",
    "payment_dispute",
    "fraud",
  ]) {
    assert.match(
      policy,
      new RegExp(`${intent}: "human"`),
      `expected ${intent} to require human handling`,
    );
  }
});

test("Instagram custom and exception cases require review", () => {
  for (const intent of [
    "order_status",
    "payment_confirmation",
    "address_change",
    "custom_order",
    "catering",
    "collaboration",
    "discount_exception",
  ]) {
    assert.match(
      policy,
      new RegExp(`${intent}: "review"`),
      `expected ${intent} to require review`,
    );
  }
});

test("Instagram auto-send requires at least 92 percent confidence", () => {
  assert.match(policy, /confidence >= 0\.92/);
});

test("Instagram policy supports Spanish, English, and mixed conversations", () => {
  assert.match(policy, /"es" \| "en" \| "mixed" \| "unknown"/);
  assert.match(policy, /Treat Spanish and English as native Bagelito voices/);
});
