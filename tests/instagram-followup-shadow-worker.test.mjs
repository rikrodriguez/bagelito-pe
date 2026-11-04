import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-followup-shadow/index.ts", import.meta.url),
  "utf8",
);

test("follow-up worker is shadow-only and never sends through Meta", () => {
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /instagram_outbound_sends/);
  assert.doesNotMatch(source, /status:\s*"sent"/);
  assert.match(source, /shadow_generated/);
});

test("follow-up worker refreshes candidates and checks the live customer window", () => {
  assert.match(source, /refresh_instagram_followup_candidates/);
  assert.match(source, /source_last_inbound_at/);
  assert.match(source, /expires_at/);
  assert.match(source, /human_active/);
});

test("follow-up drafts use live Bagelito facts and current order state", () => {
  assert.match(source, /instagram_agent_facts/);
  assert.match(source, /instagram_order_drafts/);
  assert.match(source, /sales_skill_v2/);
  assert.match(source, /payment_policy/);
});

test("follow-up drafts are limited to one compact bubble", () => {
  assert.match(source, /maxItems:\s*1/);
  assert.match(source, /one compact follow-up/i);
});


test("follow-up worker receives exact missing fields from the candidate", () => {
  assert.match(source, /MISSING_FIELDS/);
  assert.match(source, /candidate\.metadata\?\.missing_fields/);
});
