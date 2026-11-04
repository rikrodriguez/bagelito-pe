import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const enrich = await readFile(
  new URL("../supabase/functions/instagram-sales-enrich/index.ts", import.meta.url),
  "utf8",
);

test("sales enrichment has no hard-coded legacy GHL destination", () => {
  assert.doesNotMatch(enrich, /wGVp4L7zAl46JR7gg0Hx/);
  assert.doesNotMatch(enrich, /atqtqzswVGYoGU18TF8z/);
  assert.match(enrich, /ghl_crm_config/);
});

test("GHL queueing is disabled unless live CRM config is enabled", () => {
  assert.match(enrich, /crmSyncEnabled/);
  assert.match(enrich, /if \(crmSyncEnabled/);
  assert.match(enrich, /enqueue_instagram_crm_sync/);
  assert.match(enrich, /instagram-ghl-sync/);
});
