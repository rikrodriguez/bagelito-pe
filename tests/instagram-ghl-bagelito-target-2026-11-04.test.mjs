import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const worker=await readFile(new URL("../supabase/functions/instagram-ghl-sync/index.ts",import.meta.url),"utf8");
const enrich=await readFile(new URL("../supabase/functions/instagram-sales-enrich/index.ts",import.meta.url),"utf8");

test("GHL target is the confirmed new Bagelito subaccount",()=>{
  assert.match(worker,/BAGELITO_LOCATION_ID = "AO82PQzM13CKpSZO2hER"/);
  assert.match(worker,/ghl_target_not_verified/);
  assert.match(worker,/ghl_location_secret_mismatch/);
  assert.doesNotMatch(worker,/YMqyWSqEiTyE3u3SgXl5|wGVp4L7zAl46JR7gg0Hx/);
});
test("worker refuses work until verified CRM mapping is explicitly enabled",()=>{
  assert.match(worker,/ghl_sync_disabled/);
  assert.match(worker,/ghl_crm_config/);
  assert.match(worker,/pipeline_mismatch/);
  assert.match(worker,/GHL_API_TOKEN/);
});
test("Instagram-only contact lookup uses the new custom field ID dynamically",()=>{
  assert.match(worker,/instagramUserIdFieldId: string/);
  assert.match(worker,/args\.instagramUserIdFieldId/);
  assert.match(worker,/locationId: args\.locationId/);
});
test("CRM formatting never sends private voucher paths",()=>{
  assert.doesNotMatch(enrich,/GHL\.opportunityFields\.voucherReference, args\.draft\.payment_evidence_path/);
  assert.match(enrich,/Never mirror private voucher storage paths/);
});
test("custom fields are skipped rather than sent with undefined IDs",()=>{
  assert.match(enrich,/typeof id !== "string" \|\| !id\.trim\(\)/);
});
test("favorite flavors are normalized even when stored as objects",()=>{
  assert.match(enrich,/Array\.isArray\(args\.lead\.preferred_flavors\)/);
  assert.match(enrich,/flavor\?\.item_name/);
});
