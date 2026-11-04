import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(
  new URL("../src/app/api/admin/instagram/orders/[draftId]/resolve-handoff/route.ts",import.meta.url),
  "utf8"
);

test("handoff resolution API is admin authenticated and calls audited RPC",()=>{
  assert.match(route,/createAdminToken/);
  assert.match(route,/resolve_instagram_sales_handoff/);
  assert.match(route,/p_resolved_by/);
});

test("custom resolution only exposes explicit safe choices",()=>{
  assert.match(route,/approved_standard_pricing/);
  assert.match(route,/declined_continue_standard/);
  assert.match(route,/resume_standard_flow/);
  assert.match(route,/resolved_no_resume/);
});
