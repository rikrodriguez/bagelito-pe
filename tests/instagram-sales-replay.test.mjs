import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const coreSource = await readFile(new URL("../supabase/functions/_shared/instagram-sales-core.ts", import.meta.url),"utf8");
const js = ts.transpileModule(coreSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),"bagelito-replay-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"core.js"),js,"utf8");
const core=await import(pathToFileURL(join(dir,"core.js")).href);
const fixture=JSON.parse(await readFile(new URL("./fixtures/instagram-sales-replay-cases.json",import.meta.url),"utf8"));

const facts={
  packs:[
    {slug:"6-mixed",name:"6 mixed",units:6,amount:60,packType:"mixed"},
    {slug:"6-single",name:"6 single flavor",units:6,amount:50,packType:"single"},
    {slug:"12-mixed",name:"12 mixed",units:12,amount:115,packType:"mixed"},
    {slug:"12-single",name:"12 single flavor",units:12,amount:100,packType:"single"},
  ],
  mini_bagel_packs:[
    {slug:"mini-6-mixed",name:"6 mini mixed",units:6,amount:25,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-6-single",name:"6 mini single flavor",units:6,amount:20,packType:"single",bagelSize:"mini"},
    {slug:"mini-12-mixed",name:"12 mini mixed",units:12,amount:40,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-12-single",name:"12 mini single flavor",units:12,amount:35,packType:"single",bagelSize:"mini"},
    {slug:"mini-24-mixed",name:"24 mini mixed",units:24,amount:75,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-24-single",name:"24 mini single flavor",units:24,amount:70,packType:"single",bagelSize:"mini"},
  ],
  schmears:[
    {slug:"whipped-original-120g",name:"Whipped Original 120g",price:12},
    {slug:"aji-amarillo-120g",name:"Ají Amarillo 120g",price:null},
  ],
  delivery_pricing:{
    rate_per_km:3,minimum_fee:8,long_distance_threshold:15,long_distance_discount_rate:.3,
    district_distances_km:{Lince:1.3,Miraflores:7.1}
  }
};

function patchOf(raw={}){
  const list=(value,kind)=> (value||[]).map(([key,name,quantity])=>({key,name,quantity}));
  return {
    bagel_size: raw.bagel_size ?? null,
    pack_slug: raw.pack_slug ?? null,
    pack_name: raw.pack_name ?? null,
    units: raw.units ?? null,
    customer_name: raw.customer_name ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    district: raw.district ?? null,
    address: raw.address ?? null,
    address_reference: raw.address_reference ?? null,
    delivery_notes: raw.delivery_notes ?? null,
    requested_date: raw.requested_date ?? null,
    custom_request: raw.custom_request ?? null,
    items:list(raw.items,"bagel"),
    schmears:list(raw.schmears,"schmear"),
  };
}
function itemsOf(raw=[]){
  return raw.map(([key,name,quantity])=>({item_kind:"bagel",item_key:key,item_name:name,quantity,unit_price:null,metadata:{}}));
}
for(const scenario of fixture.cases){
  test(`replay: ${scenario.id}`,()=>{
    const extraction={
      buyer_signal: scenario.extraction.buyer_signal ?? "interested",
      objection_type: scenario.extraction.objection_type ?? "none",
      handoff_reason: scenario.extraction.handoff_reason ?? null,
      customer_requested_human: scenario.extraction.customer_requested_human ?? false,
      conflicting_data: scenario.extraction.conflicting_data ?? false,
      payment_evidence_claimed: scenario.extraction.payment_evidence_claimed ?? false,
      intent: scenario.extraction.intent,
      confidence: scenario.extraction.confidence,
      order_patch:patchOf(scenario.patch),
    };
    const state=core.projectSalesState({
      currentOrder:scenario.current??null,
      currentItems:itemsOf(scenario.currentItems),
      extraction,
      facts,
      latestMessage:scenario.latestMessage,
    });
    const expected=scenario.expect;
    assert.equal(state.stage,expected.stage,"stage");
    assert.equal(state.action,expected.action,"action");
    assert.equal(state.handoffReason??null,expected.handoff??null,"handoff");
    if("resumeAction" in expected) assert.equal(state.resumeAction,expected.resumeAction,"resumeAction");
    if("objectionType" in expected) assert.equal(state.objectionType,expected.objectionType,"objectionType");
    if("paymentStatus" in expected) assert.equal(state.paymentStatus,expected.paymentStatus,"paymentStatus");
    if("bagelSize" in expected) assert.equal(state.projectedOrder.bagel_size,expected.bagelSize,"bagelSize");
    if("missing" in expected) assert.deepEqual(state.missingFields,expected.missing,"missingFields");
    if("quoteVerified" in expected) assert.equal(state.quote.verified,expected.quoteVerified,"quoteVerified");
    if("subtotal" in expected) assert.equal(state.quote.itemsSubtotal,expected.subtotal,"subtotal");
    if("delivery" in expected) assert.equal(state.quote.deliveryFee,expected.delivery,"delivery");
    if("total" in expected) assert.equal(state.quote.total,expected.total,"total");
  });
}
