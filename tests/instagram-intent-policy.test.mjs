import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = await readFile(
  new URL("../src/lib/instagram/policy.ts", import.meta.url),
  "utf8",
);

test("Instagram policy keeps high-risk cases out of auto-send", () => {
  for (const intent of [
    "allergy_celiac_gluten_safety",
    "complaint_or_service_failure",
    "refund_or_payment_dispute",
    "lost_or_wrong_delivery",
    "partnership_press_vendor",
  ]) {
    const start = policy.indexOf(`${intent}: {`);
    assert.notEqual(start, -1, `missing policy for ${intent}`);
    const block = policy.slice(start, start + 500);
    assert.match(block, /risk: "red"/);
    assert.match(block, /autoSendEligible: false/);
  }
});

test("Instagram auto-send requires at least 92 percent confidence", () => {
  assert.match(policy, /confidence >= 0\.92/);
});
