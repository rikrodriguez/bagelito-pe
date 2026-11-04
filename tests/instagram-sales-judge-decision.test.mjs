import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/instagram-sales-judge-policy.ts", import.meta.url), "utf8"
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const temp = await mkdtemp(join(tmpdir(), "bagelito-sales-judge-"));
await writeFile(join(temp, "package.json"), '{"type":"module"}');
await writeFile(join(temp, "sales-judge.js"), transpiled);
const { adjudicateSalesJudge } = await import(pathToFileURL(join(temp, "sales-judge.js")).href);

const perfect = {
  latest_question_score: 100,
  sales_progression_score: 100,
  factual_safety_score: 100,
  handoff_score: 100,
  dawn_voice_score: 100,
  pressure_safety_score: 100,
  issues: [],
  recommended_action: "send",
  rationale: "Verified answer with one next step",
};
const decide = (patch = {}, minScore = 85) =>
  adjudicateSalesJudge({ ...perfect, ...patch }, minScore);

test("verified, safe reply can pass", () => {
  const result=decide();
  assert.equal(result.pass,true);
  assert.equal(result.overallScore,100);
});
test("explicit HOLD overrides perfect numerical scores", () => {
  assert.equal(decide({recommended_action:"hold"}).pass,false);
});
test("human review overrides perfect numerical scores", () => {
  assert.equal(decide({recommended_action:"human_review"}).pass,false);
});
test("payment risk blocks even with perfect scores", () => {
  const r=decide({issues:["payment_risk"]});
  assert.equal(r.pass,false);
  assert.ok(r.criticalIssues.includes("payment_risk"));
});
test("ignored newest question blocks even with perfect scores", () => {
  assert.equal(decide({issues:["latest_question_unanswered"]}).pass,false);
});
test("unnecessary repeated media blocks the turn", () => {
  assert.equal(decide({issues:["irrelevant_or_repeated_media"]}).pass,false);
});
test("high average does not excuse factual score below 95", () => {
  assert.equal(decide({factual_safety_score:94}).pass,false);
});
test("high average does not excuse handoff score below 95", () => {
  assert.equal(decide({handoff_score:94}).pass,false);
});
test("low pressure-safety score blocks", () => {
  assert.equal(decide({pressure_safety_score:89}).pass,false);
});
test("minimum overall threshold is enforced", () => {
  assert.equal(decide({
    latest_question_score:85,
    sales_progression_score:80,
    factual_safety_score:95,
    handoff_score:95,
    dawn_voice_score:75,
    pressure_safety_score:90,
  },90).pass,false);
});
test("missing issues array fails closed", () => {
  assert.equal(decide({issues:null}).pass,false);
});
test("unknown issue code fails closed", () => {
  assert.equal(decide({issues:["mystery_issue"]}).pass,false);
});
test("missing score fails closed", () => {
  assert.equal(decide({factual_safety_score:null}).pass,false);
});
test("malformed action fails closed", () => {
  assert.equal(decide({recommended_action:"anything"}).pass,false);
});
