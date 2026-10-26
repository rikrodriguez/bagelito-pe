import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { sourceModule } from "../helpers/load-ts.mjs";
import { translations, packCopy } from "../../src/lib/i18n.ts";
import { saveSuccessProof } from "../../src/lib/payments/success-proof.ts";

const ORDER="BAG-TEST-1";
const SESSION="00000000-0000-4000-8000-000000000001";
const verified={ok:true,orderCode:ORDER,paymentStatus:"paid",orderStatus:"payment_confirmed",reconciliationRequired:false};
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
function textNodes(tree) {
 if(tree==null||typeof tree==="boolean")return "";
 if(Array.isArray(tree))return tree.map(textNodes).join(" ");
 if(typeof tree==="string"||typeof tree==="number")return String(tree)+" ";
 return textNodes(tree.props?.children);
}
function mount({ payment="paid", proof=false, data=verified, error=null }={}) {
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 const map=new Map(),calls=[],effects=[],state=[],hooks=[];
 let cursor=0;
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 if(proof)assert.equal(saveSuccessProof(storage,ORDER,SESSION),true);
 globalThis.window={sessionStorage:storage};
 globalThis.fetch=async(url,init)=>{
   calls.push({url,body:JSON.parse(init.body)});
   if(error)throw error;
   return {ok:true,json:async()=>data};
 };
 const useState=initial=>{
   const index=cursor++;
   if(!state[index])state[index]={value:initial};
   return [state[index].value,next=>state[index].value=typeof next==="function"?next(state[index].value):next];
 };
 const useEffect=(effect,deps)=>{
   const index=cursor++;
   const prior=hooks[index];
   if(!prior || prior.deps.length!==deps.length || deps.some((v,i)=>!Object.is(v,prior.deps[i]))) {
     effects.push(()=>{
       prior?.cleanup?.();
       hooks[index]={deps,cleanup:effect()};
     });
   }
 };
 const icon=()=>null;
 const {ReservationSuccessContent}=sourceModule("src/app/reserve/success/ReservationSuccessContent.tsx",{
   "react":{...React,useState,useEffect},
   "next/link":{__esModule:true,default:({children})=>children},
   "lucide-react":{CheckCircle2:icon,Clock3:icon,MessageCircle:icon},
   "@/components/LanguageProvider":{useLanguage:()=>({locale:"es",copy:translations.es})},
   "@/lib/i18n":{packCopy},
   "@/lib/analytics":{trackBagelitoEvent(){}},
   "@/lib/whatsapp":{getWhatsAppHref:()=>"https://fixture.invalid/help"},
 });
 const props={order:ORDER,pack:"Synthetic pack",payment,amount:"999999"};
 const render=()=>{
   cursor=0;
   const tree=ReservationSuccessContent(props);
   while(effects.length)effects.shift()();
   return textNodes(tree);
 };
 let first=render();
 return {
   first,calls,render,
   cleanup(){
     for(const x of hooks)x?.cleanup?.();
     if(oldWindow===undefined)delete globalThis.window;
     else globalThis.window=oldWindow;
     if(oldFetch===undefined)delete globalThis.fetch;
     else globalThis.fetch=oldFetch;
   },
 };
}

test("no checkout proof means zero network requests and never paid",async()=>{
 const app=mount({proof:false});
 try {
   assert.doesNotMatch(app.first,/Pago confirmado/);
   await flush();
   assert.equal(app.calls.length,0);
   assert.doesNotMatch(app.render(),/Pago confirmado|Tu batch está reservado/);
 } finally {app.cleanup();}
});
test("server paid response for exact stored order confirms without URL amount",async()=>{
 const app=mount({proof:true});
 try {
   assert.match(app.first,/Verificando pago/);
   await flush();
   const next=app.render();
   assert.match(next,/Pago confirmado|Tu batch está reservado/);
   assert.doesNotMatch(next,/999999/);
   assert.deepEqual(app.calls.map(x=>({url:x.url,body:x.body})),[
     {url:"/api/payments/culqi/status",body:{checkoutSessionId:SESSION,orderCode:ORDER}}
   ]);
 } finally {app.cleanup();}
});
test("server response for another order cannot confirm this URL",async()=>{
 const app=mount({proof:true,data:{...verified,orderCode:"BAG-OTHER-2"}});
 try {await flush();assert.doesNotMatch(app.render(),/Pago confirmado|Tu batch está reservado/);} finally{app.cleanup();}
});
test("paid but cancelled/reconciliation stays in review instead of confirmation",async()=>{
 for(const data of [{...verified,orderStatus:"cancelled"},{...verified,reconciliationRequired:true}]){
   const app=mount({proof:true,data});
   try {await flush();assert.match(app.render(),/Revisión necesaria/);assert.doesNotMatch(app.render(),/Pago confirmado/);} finally{app.cleanup();}
 }
});
test("server request failure cannot be interpreted as success",async()=>{
 const app=mount({proof:true,error:new Error("synthetic offline")});
 try {await flush();assert.match(app.render(),/Sin confirmar/);assert.doesNotMatch(app.render(),/Pago confirmado/);}finally{app.cleanup();}
});
