import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/instagram/followup-policy.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),"bagelito-followup-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"followup.js"),output,"utf8");
const {BAGELITO_FOLLOWUP_POLICY,evaluateFollowupEligibility,getFollowupObjective}=await import(pathToFileURL(join(dir,"followup.js")).href);

const now=new Date("2026-11-04T16:00:00Z");
function ctx(overrides={}) {
  return {
    now,
    lastCustomerAt:new Date("2026-11-04T10:00:00Z"),
    lastOutboundAt:new Date("2026-11-04T10:05:00Z"),
    stage:"order_configuration",
    mode:"ai_active",
    handoffReason:null,
    followupsSent:0,
    ...overrides
  };
}

test("policy is shadow-only and leaves a one-hour Meta safety buffer",()=>{
  assert.equal(BAGELITO_FOLLOWUP_POLICY.autoSendEnabled,false);
  assert.equal(BAGELITO_FOLLOWUP_POLICY.shadowEnabled,true);
  assert.equal(BAGELITO_FOLLOWUP_POLICY.standardWindowHours,24);
  assert.equal(BAGELITO_FOLLOWUP_POLICY.safetyBufferMinutes,60);
  assert.equal(BAGELITO_FOLLOWUP_POLICY.maxFollowupsPerCustomerWindow,1);
});

test("eligible open sales thread becomes a shadow follow-up candidate",()=>{
  const r=evaluateFollowupEligibility(ctx());
  assert.equal(r.eligible,true);
  assert.equal(r.autoSend,false);
});

test("too-early follow-up is blocked",()=>{
  const r=evaluateFollowupEligibility(ctx({
    now:new Date("2026-11-04T12:00:00Z")
  }));
  assert.equal(r.eligible,false);
  assert.equal(r.reason,"minimum_silence_not_reached");
});

test("23-hour cutoff blocks follow-up before the 24-hour Meta boundary",()=>{
  const r=evaluateFollowupEligibility(ctx({
    now:new Date("2026-11-05T09:05:01Z")
  }));
  assert.equal(r.eligible,false);
  assert.equal(r.reason,"messaging_window_safety_cutoff");
});

test("human review and post-payment stages never get sales follow-up",()=>{
  for (const patch of [
    {stage:"human_review"},
    {stage:"payment_evidence_received"},
    {stage:"confirmed"},
    {stage:"production"},
    {stage:"delivery"},
    {stage:"completed"},
    {handoffReason:"custom_feasibility"},
    {mode:"human_active"},
  ]) {
    assert.equal(evaluateFollowupEligibility(ctx(patch)).eligible,false,JSON.stringify(patch));
  }
});

test("only one follow-up is allowed in a customer window",()=>{
  const r=evaluateFollowupEligibility(ctx({followupsSent:1}));
  assert.equal(r.eligible,false);
  assert.equal(r.reason,"followup_limit_reached");
});

test("stage objectives remain small and conversion-oriented",()=>{
  assert.equal(getFollowupObjective("menu_discovery",[]),"reopen_choice");
  assert.equal(getFollowupObjective("details_collection",["phone","address"]),"collect_missing_details");
  assert.equal(getFollowupObjective("payment_pending",[]),"gentle_payment_reminder");
});
