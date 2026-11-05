import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql=await readFile(
  new URL("../supabase/add-instagram-sales-judge-calibration.sql",import.meta.url),
  "utf8"
);

test("judge calibration joins pre-send judge to Dawn post-send feedback",()=>{
  assert.match(sql,/instagram_sales_judge_reviews/);
  assert.match(sql,/instagram_ai_feedback_reviews/);
  assert.match(sql,/instagram_ai_runs/);
  assert.match(sql,/judge_pass_but_human_edited/);
});

test("judge calibration is analytics only and service-role protected",()=>{
  assert.match(sql,/create or replace view public\.instagram_sales_judge_calibration/);
  assert.match(sql,/create or replace view public\.instagram_sales_judge_misses/);
  assert.match(sql,/revoke all on public\.instagram_sales_judge_calibration from anon, authenticated/);
  assert.doesNotMatch(sql,/update public\.instagram_runtime_settings/);
});
