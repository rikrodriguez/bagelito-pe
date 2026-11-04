import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/add-instagram-feedback-evaluation.sql",import.meta.url),"utf8");
const worker=await readFile(new URL("../supabase/functions/instagram-feedback-evaluate/index.ts",import.meta.url),"utf8");

test("feedback reviews are service-role-only and do not mutate agent facts",()=>{
  assert.match(sql,/instagram_ai_feedback_reviews/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.instagram_ai_feedback_reviews from anon, authenticated/);
  assert.doesNotMatch(worker,/\.from\("instagram_agent_facts"\)\s*\.update/);
  assert.doesNotMatch(worker,/\.from\("instagram_agent_facts"\)\s*\.upsert/);
});

test("feedback evaluator distinguishes behavior from operational truth",()=>{
  assert.match(worker,/behavioral learning/i);
  assert.match(worker,/must not become current operational truth/i);
  assert.match(worker,/historical price/i);
  assert.match(worker,/human_edit_type/);
  assert.match(worker,/sales_progression_score/);
  assert.match(worker,/factual_safety_score/);
});

test("feedback evaluator is asynchronous and internally authenticated",()=>{
  assert.match(sql,/net\.http_post/);
  assert.match(sql,/x-internal-token/);
  assert.match(worker,/verify_instagram_sales_internal_token/);
  assert.match(worker,/unauthorized/);
});

test("feedback evaluation stores structured lessons without auto-applying them",()=>{
  assert.match(worker,/safe_lesson/);
  assert.match(worker,/behavioral_categories/);
  assert.match(worker,/instagram_ai_feedback_reviews/);
  assert.match(sql,/instagram_feedback_learning_summary/);
});
