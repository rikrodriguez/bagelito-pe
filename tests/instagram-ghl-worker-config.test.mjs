import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const worker=await readFile(new URL("../supabase/functions/instagram-ghl-sync/index.ts",import.meta.url),"utf8");
test("health uses bound secret variable and does not reference a later let location",()=>{
 assert.match(worker,/locationConfigured: Boolean\(secretLocationId\)/);
 assert.doesNotMatch(worker,/locationConfigured: Boolean\(locationId\)/);
});
test("location secret and tenant are mandatory",()=>{
 assert.match(worker,/missing_ghl_location_secret/);
 assert.match(worker,/secretLocationId !== locationId/);
 assert.match(worker,/BAGELITO_LOCATION_ID/);
 assert.match(worker,/ghl_target_not_verified/);
});
test("approval and CRM config must opt in before processing jobs",()=>{
 assert.match(worker,/config\.enabled !== true/);
 assert.match(worker,/ghl_sync_not_approved/);
 assert.match(worker,/production_approved/);
});
test("reject payloads with a different tenant location",()=>{
 assert.match(worker,/invalid_sync_payload:location_mismatch/);
});
test("do not persist raw provider error response with personal data",()=>{
 assert.doesNotMatch(worker,/ghl_\$\{response\.status\}:\$\{raw\.slice/);
 assert.match(worker,/ghl_api_status_/);
});
