import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/add-instagram-learning-views.sql", import.meta.url),
  "utf8",
);

test("learning examples preserve AI draft and Dawn final response",()=>{
  assert.match(sql,/create or replace view public\.instagram_ai_feedback_examples/);
  assert.match(sql,/proposed_messages/);
  assert.match(sql,/human_final_reply/);
  assert.match(sql,/human_final_media/);
  assert.match(sql,/status in \('approved','edited'\)/);
});

test("quality summary measures edits, approvals, voice and sales context",()=>{
  assert.match(sql,/create or replace view public\.instagram_ai_quality_summary/);
  assert.match(sql,/edited_count/);
  assert.match(sql,/approved_count/);
  assert.match(sql,/voice_pass_rate/);
  assert.match(sql,/sales_stage/);
  assert.match(sql,/next_best_action/);
});

test("learning views remain service-role only",()=>{
  assert.match(sql,/revoke all on public\.instagram_ai_feedback_examples from anon, authenticated/);
  assert.match(sql,/revoke all on public\.instagram_ai_quality_summary from anon, authenticated/);
});
