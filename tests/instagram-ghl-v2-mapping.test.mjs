import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/instagram-sales-enrich/index.ts",import.meta.url),"utf8");
test("GHL integration remains off unless explicitly approved",()=>{
 assert.match(source,/config\.enabled !== true/);
 assert.match(source,/integration_test_approved/);
 assert.match(source,/production_approved/);
 assert.match(source,/config\.target_name !== "Bagelito"/);
});
test("new fields source only trusted data",()=>{
 assert.match(source,/preferredChannel, "instagram"/);
 assert.match(source,/verifiedRevenueCents/);
 assert.match(source,/extraContactFields\?\.lifetimeOrders/);
 assert.match(source,/GHL\.opportunityFields\[key\]/);
 assert.match(source,/subtotalCents/);
 assert.match(source,/deliveryCents/);
 assert.match(source,/totalCents/);
 assert.match(source,/eventVersion/);
});
test("no assumed payment method or unverified subtotal mirroring",()=>{
 assert.match(source,/args\.draft\.quote_verified === true/);
 assert.match(source,/GHL\.opportunityFields\.total, args\.draft\.quote_verified === true/);
 assert.doesNotMatch(source,/payment_method \|\| args\.paymentPolicy\?\.display_name/);
});
test("new fields cannot bypass normal CRM queue and human approval",()=>{
 assert.match(source,/if \(crmSyncEnabled && ghlPayload\)/);
 assert.match(source,/enqueue_instagram_crm_sync/);
});
