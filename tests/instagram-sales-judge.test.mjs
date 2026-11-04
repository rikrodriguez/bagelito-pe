import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const webhook = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);
const sql = await readFile(
  new URL("../supabase/add-instagram-sales-judge.sql", import.meta.url),
  "utf8",
);

test("sales judge is a second independent gate before AUTO", () => {
  assert.match(webhook, /async function evaluateSalesDraft/);
  assert.match(webhook, /const salesJudge =/);
  assert.match(webhook, /safeForAuto =[\s\S]*salesJudge\.pass/);
  assert.match(webhook, /sales_judge_needs_review/);
});

test("sales judge cannot override deterministic gates", () => {
  assert.match(webhook, /const baseAutoCandidate =/);
  assert.match(webhook, /replyLooksReadable/);
  assert.match(webhook, /replyLooksSalesReady/);
  assert.match(webhook, /baseAutoCandidate[\s\S]*salesJudge\.pass/);
});

test("sales judge uses strict scores and critical issue codes", () => {
  assert.match(webhook, /latest_question_score/);
  assert.match(webhook, /sales_progression_score/);
  assert.match(webhook, /factual_safety_score/);
  assert.match(webhook, /handoff_score/);
  assert.match(webhook, /pressure_safety_score/);
  assert.match(webhook, /criticalIssues/);
});

test("sales judge results are persisted service-role only", () => {
  assert.match(sql, /instagram_sales_judge_reviews/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.instagram_sales_judge_reviews from anon, authenticated/);
  assert.match(sql, /sales_judge_enabled/);
  assert.match(sql, /sales_judge_min_score/);
});
