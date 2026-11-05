import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/add-instagram-customer-memory.sql", import.meta.url),
  "utf8",
);

test("customer memory only trusts confirmed or operational orders", () => {
  assert.match(sql, /payment_status\s*=\s*'confirmed'/i);
  assert.match(sql, /confirmed.*in_production.*ready_for_delivery.*delivered/is);
});

test("customer memory includes last trusted order and preferred flavors", () => {
  assert.match(sql, /latest_order/i);
  assert.match(sql, /preferred_flavors/i);
  assert.match(sql, /latest_items/i);
});

test("customer memory can exclude the active draft", () => {
  assert.match(sql, /p_exclude_draft_id/i);
  assert.match(sql, /p_exclude_draft_id is null or d\.id <> p_exclude_draft_id/i);
});
