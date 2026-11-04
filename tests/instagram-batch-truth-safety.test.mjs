import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const webhook = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);

test("merchant-review batch dates are sanitized before reaching the sales model", () => {
  assert.match(webhook, /function customerFacingBatch/);
  assert.match(webhook, /merchant_review_only/);
  assert.match(webhook, /customer_facing_close_at/);
  assert.match(webhook, /current_batch: customerFacingBatch\(/);
});

test("sales prompt forbids treating merchant-review dates as customer promises", () => {
  assert.match(webhook, /merchant-review/i);
  assert.match(webhook, /delivery date is not confirmed/i);
});
