import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source=await readFile(new URL("../supabase/functions/_shared/instagram-sales-core.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),"bagelito-multi-pack-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"core.js"),js,"utf8");
const core=await import(pathToFileURL(join(dir,"core.js")).href);

const facts={
  packs:[
    {slug:"6-mixed",name:"6 mixed",units:6,amount:60,packType:"mixed"},
    {slug:"12-mixed",name:"12 mixed",units:12,amount:115,packType:"mixed"},
    {slug:"6-single",name:"6 single",units:6,amount:50,packType:"single"},
    {slug:"12-single",name:"12 single",units:12,amount:100,packType:"single"},
  ],
  mini_bagel_packs:[
    {slug:"mini-6-mixed",name:"6 mini mixed",units:6,amount:25,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-12-mixed",name:"12 mini mixed",units:12,amount:40,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-24-mixed",name:"24 mini mixed",units:24,amount:75,packType:"mixed",bagelSize:"mini"},
    {slug:"mini-6-single",name:"6 mini single",units:6,amount:20,packType:"single",bagelSize:"mini"},
    {slug:"mini-12-single",name:"12 mini single",units:12,amount:35,packType:"single",bagelSize:"mini"},
    {slug:"mini-24-single",name:"24 mini single",units:24,amount:70,packType:"single",bagelSize:"mini"},
  ],
  schmears:[],
  delivery_pricing:{rate_per_km:3,minimum_fee:8,long_distance_threshold:15,long_distance_discount_rate:.3,district_distances_km:{Lince:1.3}}
};

function state({size="regular",items}){
  return core.projectSalesState({
    currentOrder:{customer_name:"Customer",phone:"999111222",district:"Lince",delivery_address:"Address",bagel_size:size,payment_status:"none"},
    currentItems:[],
    extraction:{
      intent:"how_to_order",confidence:.99,buyer_signal:"selection_started",objection_type:"none",
      handoff_reason:null,customer_requested_human:false,conflicting_data:false,payment_evidence_claimed:false,
      order_patch:{
        bagel_size:size,pack_slug:null,pack_name:null,units:items.reduce((s,x)=>s+x.quantity,0),
        customer_name:null,phone:null,email:null,district:null,address:null,address_reference:null,
        delivery_notes:null,requested_date:null,custom_request:null,
        items:items.map(x=>({key:x.key,name:x.name,quantity:x.quantity})),schmears:[]
      }
    },
    facts,latestMessage:size==="mini"?"Quiero minis":"Quiero bagels"
  });
}

test("18 regular mixed bagels compose 12 + 6 using live pack prices",()=>{
  const s=state({items:[{key:"plain",name:"Plain",quantity:9},{key:"cheddar",name:"Cheddar",quantity:9}]});
  assert.equal(s.quote.verified,true);
  assert.equal(s.quote.itemsSubtotal,175);
  assert.equal(s.quote.pack.units,18);
  assert.deepEqual(s.quote.pack.components.map(x=>[x.units,x.quantity]),[[12,1],[6,1]]);
  assert.equal(s.quote.total,183);
});

test("24 regular mixed bagels use two 12-packs instead of four 6-packs",()=>{
  const s=state({items:[{key:"plain",name:"Plain",quantity:12},{key:"cheddar",name:"Cheddar",quantity:12}]});
  assert.equal(s.quote.itemsSubtotal,230);
  assert.deepEqual(s.quote.pack.components.map(x=>[x.units,x.quantity]),[[12,2]]);
});

test("30 mixed minis use a 24-pack plus a 6-pack",()=>{
  const s=state({size:"mini",items:[{key:"plain",name:"Plain",quantity:15},{key:"blueberry",name:"Blueberry",quantity:15}]});
  assert.equal(s.quote.verified,true);
  assert.equal(s.quote.itemsSubtotal,100);
  assert.deepEqual(s.quote.pack.components.map(x=>[x.units,x.quantity]),[[24,1],[6,1]]);
  assert.equal(s.quote.total,108);
});

test("unsupported regular quantity does not invent a price",()=>{
  const s=state({items:[{key:"plain",name:"Plain",quantity:3},{key:"cheddar",name:"Cheddar",quantity:2}]});
  assert.equal(s.quote.verified,false);
  assert.equal(s.quote.itemsSubtotal,null);
  assert.equal(s.stage,"human_review");
  assert.ok(s.handoffReason);
});
