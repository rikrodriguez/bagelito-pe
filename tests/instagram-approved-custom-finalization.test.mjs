import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql=await readFile(
  new URL("../supabase/fix-instagram-approved-custom-finalization.sql",import.meta.url),
  "utf8"
);

test("approved standard-pricing custom request can finalize",()=>{
  assert.match(sql,/custom_request_status\s*<>\s*'approved_standard_pricing'/i);
  assert.match(sql,/human_review_must_be_resolved/);
});

test("final order persists the approved custom request",()=>{
  assert.match(sql,/add column if not exists custom_request text/i);
  assert.match(sql,/instagram_draft_id,custom_request,admin_notes/i);
  assert.match(sql,/v_draft\.custom_request/i);
});
