import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);

test("Instagram AUTO includes the Bagelito sales quality gate", () => {
  assert.match(source, /function countSalesQuestions/);
  assert.match(source, /function isSalesReadyInstagramTurn/);
  assert.match(source, /sales_quality_needs_review/);
  assert.match(source, /sales_skill_v2/);
});

test("sales quality gate is part of safeForAuto", () => {
  assert.match(source, /const replyLooksSalesReady =/);
  assert.match(source, /safeForAuto =[\s\S]*replyLooksReadable[\s\S]*replyLooksSalesReady/);
});

test("sales quality gate enforces one question and a clear next step", () => {
  assert.match(source, /countSalesQuestions\(messages\) > 1/);
  assert.match(source, /hasClearSalesNextStep/);
});
