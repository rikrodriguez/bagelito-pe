import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";

const source=await readFile(new URL("../supabase/functions/_shared/instagram-sales-core.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),"bagelito-payment-exception-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"core.js"),output,"utf8");
const {projectSalesState}=await import(pathToFileURL(join(dir,"core.js")).href);

test("payment term exception always routes to human review",()=>{
  const state=projectSalesState({
    currentOrder:{
      sales_stage:"quote_ready",
      status:"active",
      payment_status:"none",
      quote_verified:true,
      customer_name:"Customer",
      phone:"999111222",
      district:"Lince",
      delivery_address:"Address",
      units:6,
      bagel_size:"regular"
    },
    currentItems:[
      {item_kind:"bagel",item_key:"plain",item_name:"Plain",quantity:6,unit_price:null,metadata:{}}
    ],
    extraction:{
      intent:"payment_exception",
      confidence:0.99,
      buyer_signal:"objection",
      objection_type:"other",
      customer_requested_human:false,
      conflicting_data:false,
      payment_evidence_claimed:false,
      order_patch:{items:[],schmears:[]}
    },
    facts:{
      packs:[{slug:"6-single",name:"6 single flavor",units:6,amount:50,packType:"single"}],
      schmears:[],
      delivery_pricing:{rate_per_km:3,minimum_fee:8,long_distance_threshold:15,long_distance_discount_rate:.3,district_distances_km:{Lince:1.3}}
    },
    latestMessage:"¿Puedo pagar 50% ahora y 50% cuando llegue?"
  });
  assert.equal(state.stage,"human_review");
  assert.equal(state.action,"handoff");
  assert.equal(state.handoffReason,"payment_exception");
});
