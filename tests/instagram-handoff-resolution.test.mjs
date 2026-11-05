import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/add-instagram-handoff-resolution.sql",import.meta.url),"utf8");
const core=await readFile(new URL("../supabase/functions/_shared/instagram-sales-core.ts",import.meta.url),"utf8");

test("handoff resolution is explicit and auditable",()=>{
  assert.match(sql,/handoff_resolved_at/);
  assert.match(sql,/handoff_resolution/);
  assert.match(sql,/handoff_resolved_by/);
  assert.match(sql,/approved_standard_pricing/);
  assert.match(sql,/declined_continue_standard/);
});

test("custom requests only resume auto after explicit standard-pricing approval",()=>{
  assert.match(core,/custom_request_status/);
  assert.match(core,/approved_standard_pricing/);
  assert.match(core,/custom_feasibility/);
});
