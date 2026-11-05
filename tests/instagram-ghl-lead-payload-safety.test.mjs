import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/fix-instagram-ghl-lead-payload.sql", import.meta.url),
  "utf8",
);

const forbidden=[
  "wGVp4L7zAl46JR7gg0Hx","atqtqzswVGYoGU18TF8z",
  "fFDZRiMIPr6tuiECFwEx","LnkfrJpsLPtBiCmrL1ik",
  "bbe7c4a0-e9db-4a07-b57d-0721dd5f8b73"
];

test("lead payload trigger has no legacy GHL IDs",()=>{
  for(const value of forbidden) assert.doesNotMatch(sql,new RegExp(value));
});

test("lead opportunity projection uses live GHL configuration and stops when disabled",()=>{
  assert.match(sql,/ghl_crm_config/);
  assert.match(sql,/enabled/);
  assert.match(sql,/pipelineId/);
  assert.match(sql,/opportunityFields/);
  assert.match(sql,/stages/);
  assert.match(sql,/return new/);
});

test("privileged trigger function is not publicly executable",()=>{
  assert.match(sql,/revoke all on function public\.prepare_instagram_ghl_lead_payload\(\)/);
  assert.match(sql,/grant execute on function public\.prepare_instagram_ghl_lead_payload\(\).*service_role/s);
});
