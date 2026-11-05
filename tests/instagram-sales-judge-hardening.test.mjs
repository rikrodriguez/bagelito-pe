import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const webhook = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url), "utf8"
);

test("Sales Judge is mandatory; disabling it cannot bypass the safety gate", () => {
  assert.match(webhook, /sales_judge_enabled === true/);
  assert.doesNotMatch(webhook, /sales_judge_enabled === false[sS]{0,180}pass: true/);
  assert.match(webhook, /const safeForAuto = baseAutoCandidate && salesJudge\.pass/);
});

test("Judge result must persist successfully before AUTO is eligible", () => {
  assert.match(webhook, /error: judgePersistError/);
  assert.match(webhook, /if \(judgePersistError\) throw/);
  assert.match(webhook, /status: "error"[\s\S]*pass: false/);
});

test("Human-active conversation cannot be overridden by a test recipient", () => {
  assert.match(webhook, /conversation\.mode !== "human_active"/);
  assert.doesNotMatch(webhook, /\(testOnly \|\| conversation\.mode !== "human_active"\)/);
});

test("Judge still runs only after deterministic eligibility and fails closed", () => {
  assert.match(webhook, /const baseAutoCandidate =/);
  assert.match(webhook, /replyLooksSalesReady/);
  assert.match(webhook, /sales_judge_needs_review/);
});
