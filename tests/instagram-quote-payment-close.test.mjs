import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);

test("verified quote writer may close with the live payment policy in the same turn", () => {
  assert.match(source, /PROJECTED_SALES_STATE\.action is quote_order/);
  assert.match(source, /LIVE_FACTS\.menu\.payment_policy/);
  assert.match(source, /include the active payment instruction/i);
  assert.match(source, /payment evidence is not payment confirmation/i);
});
