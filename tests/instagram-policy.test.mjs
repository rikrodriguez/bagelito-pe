import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = await readFile(
  new URL("../src/lib/instagram/policy.ts", import.meta.url),
  "utf8",
);

test("Instagram intent policy keeps high-risk situations human", () => {
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
    assert.match(policy, new RegExp(`${intent}: "human"`));
  }
});

test("Instagram auto-send threshold is conservative", () => {
  assert.match(policy, /confidence >= 0\.92/);
});

test("Instagram policy is bilingual and forbids literal translation behavior", () => {
  assert.match(policy, /Spanish and English as native Bagelito voices/);
  assert.match(policy, /current conversational language/);
});
