import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/instagram/sales-skill.ts", import.meta.url),"utf8");
const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir = await mkdtemp(join(tmpdir(),"bagelito-sales-skill-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"sales-skill.js"),output,"utf8");
const {BAGELITO_CHAT_SALES_SKILL,scoreSalesTurn,getStageConversationPolicy,buildBagelitoSalesSkillInstructions} =
  await import(pathToFileURL(join(dir,"sales-skill.js")).href);

test("skill is versioned and enforces one decision per turn",()=>{
  assert.match(BAGELITO_CHAT_SALES_SKILL.version,/^bagelito-chat-sales-/);
  assert.equal(BAGELITO_CHAT_SALES_SKILL.maximumQuestionsPerTurn,1);
  assert.ok(BAGELITO_CHAT_SALES_SKILL.principles.includes("one_clear_next_decision"));
});
test("focused discovery with one next question passes",()=>{
  const r=scoreSalesTurn({messages:["Holaaa! Sí 😊 Tenemos packs de 6 y 12. ¿Prefieres dulce, salado o un mix?"],stage:"menu_discovery",action:"recommend_pack",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:false,paymentStatus:"none",handoffReason:null});
  assert.equal(r.pass,true); assert.equal(r.metrics.questions,1);
});
test("more than one question fails",()=>{
  const r=scoreSalesTurn({messages:["¿Cuántos quieres? ¿Qué sabores prefieres? ¿En qué distrito estás?"],stage:"order_configuration",action:"ask_quantity_flavors",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:false,paymentStatus:"none",handoffReason:null});
  assert.equal(r.pass,false); assert.ok(r.issues.some(x=>x.code==="too_many_questions"));
});
test("ignoring latest question fails",()=>{
  const r=scoreSalesTurn({messages:["Perfecto, entonces serían 12 bagels 🥯"],stage:"order_configuration",action:"ask_quantity_flavors",latestQuestionAnswered:false,liveFactsSufficient:true,quoteVerified:false,paymentStatus:"none",handoffReason:null});
  assert.ok(r.issues.some(x=>x.code==="latest_question_not_answered"));
});
test("discovery without next step is held",()=>{
  const r=scoreSalesTurn({messages:["Tenemos Plain, Blueberry, Cheddar y Everything 🥯"],stage:"menu_discovery",action:"send_menu",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:false,paymentStatus:"none",handoffReason:null});
  assert.ok(r.issues.some(x=>x.code==="missing_next_step"));
});
test("payment cannot be requested before verified quote",()=>{
  const r=scoreSalesTurn({messages:["Puedes yapear al número vigente y mandarme la captura 😊"],stage:"quote_ready",action:"request_payment",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:false,paymentStatus:"none",handoffReason:null});
  assert.ok(r.issues.some(x=>x.code==="payment_before_verified_quote"));
});
test("payment evidence is not auto-confirmation",()=>{
  const r=scoreSalesTurn({messages:["Perfecto, recibí la captura 😊 La voy a verificar antes de confirmar tu pedido."],stage:"payment_evidence_received",action:"acknowledge_payment_evidence",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:true,paymentStatus:"evidence_received",handoffReason:null});
  assert.equal(r.pass,true); assert.equal(r.autoEligible,false);
});
test("handoff reason is never auto eligible",()=>{
  const r=scoreSalesTurn({messages:["Déjame confirmarte si podemos hacer ese birthday bagel 😊"],stage:"human_review",action:"handoff",latestQuestionAnswered:true,liveFactsSufficient:false,quoteVerified:false,paymentStatus:"none",handoffReason:"custom_feasibility"});
  assert.equal(r.autoEligible,false); assert.ok(r.issues.some(x=>x.code==="human_handoff_required"));
});
test("natural fulfillment close is allowed",()=>{
  const r=scoreSalesTurn({messages:["Mil gracias! Te aviso cuando estén listos 🥯"],stage:"confirmed",action:"confirm_fulfillment",latestQuestionAnswered:true,liveFactsSufficient:true,quoteVerified:true,paymentStatus:"confirmed",handoffReason:null});
  assert.equal(r.pass,true);
});
test("stage policy uses progressive disclosure",()=>{
  const p=getStageConversationPolicy("menu_discovery"); assert.equal(p.maximumQuestions,1); assert.equal(p.askFor,"smallest_next_decision");
});
test("instructions encode core sales safeguards",()=>{
  const s=buildBagelitoSalesSkillInstructions();
  assert.match(s,/latest customer question/i); assert.match(s,/one clear next decision/i);
  assert.match(s,/Supabase/i); assert.match(s,/handoff/i); assert.match(s,/verified quote/i);
});
