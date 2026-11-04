import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(
  new URL("../supabase/add-instagram-quote-send-lifecycle.sql",import.meta.url),
  "utf8",
);

test("quote lifecycle is race-safe when draft exists before send",()=>{
  assert.match(sql,/instagram_mark_quote_sent_on_ai_run/);
  assert.match(sql,/after update of status/);
  assert.match(sql,/new\.status = 'sent'/);
  assert.match(sql,/d\.last_ai_run_id = new\.id/);
  assert.match(sql,/d\.quote_verified = true/);
});

test("quote lifecycle is race-safe when send exists before draft",()=>{
  assert.match(sql,/instagram_mark_quote_sent_on_draft/);
  assert.match(sql,/before insert or update of last_ai_run_id, quote_verified, quote_sent_at/);
  assert.match(sql,/v_run_status = 'sent'/);
  assert.match(sql,/v_action = 'quote_order'/);
});

test("both orderings converge to payment pending without confirming payment",()=>{
  const advances=(sql.match(/sales_stage = 'payment_pending'/g)||[]).length;
  assert.ok(advances>=2);
  assert.match(sql,/payment_status = case[\s\S]*when d\.payment_status = 'none' then 'pending'/);
  assert.doesNotMatch(sql,/payment_status = 'confirmed'/);
});
