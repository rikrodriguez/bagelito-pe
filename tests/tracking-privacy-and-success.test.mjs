import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Module from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

const root=fileURLToPath(new URL("../",import.meta.url));
function load(source,overrides={}){
 const filename=path.join(root,source),mod=new Module(filename);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod.require=(specifier)=>Object.hasOwn(overrides,specifier)
   ? overrides[specifier] : Module.prototype.require.call(mod,specifier);
 mod._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
 return mod.exports;
}
const schema=load("src/lib/tracking/schema.ts");
const code="BAG-SYNTHETIC-01";
const order={batch_id:null,created_at:"2026-10-01T00:00:00Z",customer_name:"Private Example",
  district:"Private District",email:"customer@example.invalid",whatsapp:"999999999",
  order_code:code,order_items:[{flavor_name:"Plain",flavor_slug:"plain",quantity:6}],
  order_status_history:[],pack_name:"6-pack",pack_units:6,status:"payment_pending_review",
  total_amount:60,updated_at:"2026-10-01T00:00:00Z",payment_provider:"manual",payment_status:"pending"};
function env({legacy=false}={}){
 let calls=[];
 const q=(selection)=>{
   const obj={
     eq(field,value){calls.push({field,value,selection});return obj},
     maybeSingle:async()=>{
       if(legacy && selection.includes("payment_provider"))return {
         data:null,error:{code:"42703",message:"column payment_provider does not exist"}};
       return{data:{...order,...(legacy?{payment_provider:undefined,payment_status:undefined}:{})},error:null};
     }
   };
   return obj;
 };
 const db={from(table){
   if(table==="orders")return{select:q};
   if(table==="batches")throw Error("Unexpected batch call with null batch");
   throw Error("Unexpected table");
 }};
 const service=load("src/lib/tracking/service.ts",{
   "@/lib/env":{getMissingReservationEnv:()=>[]},
   "@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},
   "./schema":schema,
 });
 return{calls,lookup:service.findTrackedOrder};
}

test("schema requires BOTH the order number and matching email or mobile",()=>{
 for(const payload of [{orderCode:code},{contact:"customer@example.invalid"},{},
  {orderCode:"wrong",contact:"customer@example.invalid"},
  {orderCode:code,contact:"1234567"},
  {orderCode:code,contact:"prefix@example.invalid!"}]){
   assert.equal(schema.trackLookupSchema.safeParse(payload).success,false,JSON.stringify(payload));
 }
 assert.equal(schema.trackLookupSchema.safeParse({orderCode:code,contact:"customer@example.invalid"}).success,true);
});
test("a valid order number alone never contacts the DB",async()=>{
 const f=env();await assert.rejects(f.lookup({orderCode:code}));
 assert.equal(f.calls.length,0);
});
test("a matching contact AND order returns limited status, never customer name or district",async()=>{
 const f=env(),r=await f.lookup({orderCode:code,contact:"customer@example.invalid"});
 assert.equal(r.orderCode,code);
 assert.equal(r.totalAmount,60);
 assert.equal(r.status,"payment_pending_review");
 assert.equal(Object.hasOwn(r,"customerName"),false);
 assert.equal(Object.hasOwn(r,"district"),false);
 assert.equal(JSON.stringify(r).includes("Private Example"),false);
 assert.deepEqual(f.calls.map(x=>x.field),["order_code"]);
});
test("wrong contact does not disclose whether the order exists",async()=>{
 const f=env();
 await assert.rejects(f.lookup({orderCode:code,contact:"other@example.invalid"}),
   e=>e.status===404);
 assert.deepEqual(f.calls.map(x=>x.field),["order_code"]);
});
test("digits in a forged email cannot match a WhatsApp field",async()=>{
 const f=env();
 await assert.rejects(f.lookup({orderCode:code,contact:"wrong999999999@example.invalid"}), e=>e.status===404);
});
test("Peru mobile with +51 requires 9-digit WhatsApp match",async()=>{
 const f=env();
 assert.equal((await f.lookup({orderCode:code,contact:"+51 999 999 999"})).orderCode,code);
});
test("legacy orders without Culqi columns still work after contact verification",async()=>{
 const f=env({legacy:true});
 const orderResult=await f.lookup({orderCode:code,contact:"customer@example.invalid"});
 assert.equal(orderResult.orderCode,code);
 assert.equal(f.calls.filter(x=>x.field==="order_code").length,2);
 assert.equal(Object.hasOwn(orderResult,"customerName"),false);
});

const copy={
 success:{kicker:"Pending",title:"Manual reservation received",text:"Received your reservation",
  coordination:"Review",labels:{orderCode:"Order code",pack:"Pack",totalAmount:"Total",status:"Status"},
  nextStep:"Next",trackOrder:"Track order",message:"Help",backHome:"Home"}
};
const Icon=()=>React.createElement("i");
const {ReservationSuccessContent}=load("src/app/reserve/success/ReservationSuccessContent.tsx",{
 "@/lib/payments/success-proof":{readSuccessProof:()=>null,checkServerPaymentStatus:()=>"unverified"},
 "next/link":{__esModule:true,default:({href,children})=>React.createElement("a",{href},children)},
 "lucide-react":{CheckCircle2:Icon,Clock3:Icon,MessageCircle:Icon},
 "@/components/LanguageProvider":{useLanguage:()=>({locale:"en",copy})},
 "@/lib/i18n":{packCopy:{en:{}}},
 "@/lib/analytics":{trackBagelitoEvent(){}},
 "@/lib/whatsapp":{getWhatsAppHref:()=>"#"}
});
test("manual and unrecognized URL variants never create a fake receipt",()=>{
 for(const payment of ["manual","random"]){
   const html=renderToStaticMarkup(React.createElement(ReservationSuccessContent,
     {order:code,pack:"fake pack",amount:"999999",payment}));
   assert.match(html,/Unverified order status/);
   assert.doesNotMatch(html,/Manual reservation received|Received your reservation|S\/999999|>999999</);
   assert.doesNotMatch(html,/Payment confirmed|Pago confirmado/);
 }
});
test("Culqi URL claims cannot bypass server verification at initial render",()=>{
 for(const payment of ["paid","pending"]){
  const html=renderToStaticMarkup(React.createElement(ReservationSuccessContent,
    {order:code,pack:"fake pack",amount:"999999",payment}));
  assert.doesNotMatch(html,/Payment confirmed|Your pack is secured|S\/999999/);
 }
});
