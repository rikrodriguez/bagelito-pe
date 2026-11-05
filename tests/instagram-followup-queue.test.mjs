import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/add-instagram-followup-shadow.sql", import.meta.url),
  "utf8",
);

test("follow-up queue is service-only and idempotent per customer window",()=>{
  assert.match(sql,/create table if not exists public\.instagram_followup_queue/);
  assert.match(sql,/unique \(conversation_id, source_last_inbound_at\)/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.instagram_followup_queue from anon, authenticated/);
});

test("candidate refresh enforces 4h silence and 23h safety cutoff",()=>{
  assert.match(sql,/interval '4 hours'/);
  assert.match(sql,/interval '23 hours'/);
  assert.match(sql,/human_active/);
  assert.match(sql,/payment_evidence_received/);
  assert.match(sql,/confirmed/);
  assert.match(sql,/production/);
  assert.match(sql,/delivery/);
});

test("stale candidate is expired when customer replies or window closes",()=>{
  assert.match(sql,/status = 'expired'/);
  assert.match(sql,/source_last_inbound_at/);
  assert.match(sql,/expires_at/);
});
