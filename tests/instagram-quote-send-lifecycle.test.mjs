import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/add-instagram-quote-send-lifecycle.sql", import.meta.url),
  "utf8",
);

test("sent verified quote moves the draft to payment pending", () => {
  assert.match(sql, /quote_sent_at/);
  assert.match(sql, /payment_pending/);
  assert.match(sql, /preflight_sales/);
  assert.match(sql, /quote_order/);
});

test("quote lifecycle handles either race order between AI send and draft persistence", () => {
  assert.match(sql, /before insert or update/i);
  assert.match(sql, /after update of status/i);
  assert.match(sql, /last_ai_run_id/);
});
