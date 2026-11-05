import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/fix-instagram-yape-dynamic-ghl.sql", import.meta.url),
  "utf8",
);

const forbidden = [
  "wGVp4L7zAl46JR7gg0Hx",
  "atqtqzswVGYoGU18TF8z",
  "fFDZRiMIPr6tuiECFwEx",
  "LnkfrJpsLPtBiCmrL1ik",
  "FAGU5085fCUqbSj5YXoY",
  "ehvbhMqtdQ63YmKvrdPD",
  "ee15b1c7-b83b-4f00-995d-d7aefad559cf",
];

test("Yape verification contains no legacy GHL IDs",()=>{
  for (const value of forbidden) assert.doesNotMatch(sql,new RegExp(value));
});

test("Yape CRM projection is controlled by live Bagelito GHL config",()=>{
  assert.match(sql,/ghl_crm_config/);
  assert.match(sql,/opportunityFields/);
  assert.match(sql,/stages/);
  assert.match(sql,/confirmed/);
  assert.match(sql,/enabled/);
});

test("GHL stage helper reads live config instead of an immutable hard-coded map",()=>{
  assert.match(sql,/create or replace function public\.ghl_stage_id_for_instagram_sales_stage/);
  assert.match(sql,/stable/i);
  assert.doesNotMatch(sql,/immutable/i);
});

test("payment verification functions stay service-role only",()=>{
  assert.match(sql,/revoke all on function public\.verify_instagram_yape_order/);
  assert.match(sql,/revoke all on function public\.finalize_instagram_order_draft/);
  assert.match(sql,/grant execute on function public\.verify_instagram_yape_order.*service_role/s);
});
