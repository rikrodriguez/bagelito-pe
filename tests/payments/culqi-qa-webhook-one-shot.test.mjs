import test from "node:test";
import assert from "node:assert/strict";
import {allowed,run} from "../../scripts/culqi-qa-webhook-one-shot.mjs";

const host="bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
 VERCEL_GIT_COMMIT_REF:"codex/culqi-payment-split-20261021",
 VERCEL_GIT_COMMIT_MESSAGE:"qa: verify existing Culqi event idempotency v2",
 VERCEL_GIT_REPO_OWNER:"rikrodriguez",VERCEL_GIT_REPO_SLUG:"bagelito-pe",VERCEL_BRANCH_URL:host,
 NEXT_PUBLIC_SITE_URL:"https://"+host,NEXT_PUBLIC_SUPABASE_URL:"https://qaahskendqdkynwtylho.supabase.co",
 PAYMENT_PROVIDER:"culqi",CULQI_MODE:"sandbox",CULQI_ENABLED:"true",CULQI_LIVE_APPROVED:"false",
 CULQI_SECRET_KEY:"sk_test_fixture",SUPABASE_SERVICE_ROLE_KEY:"test_service_role_key_for_synthetic_QA_testing"};
const id="evt_test_ABCDEFGHIJKLMNOP";
const order={id:"11111111-1111-4111-8111-111111111111",order_code:"BAG-000013",payment_provider:"culqi",
 payment_lane:"token",payment_status:"paid",status:"payment_confirmed",payment_reconciliation_required:false,
 payment_charge_state:"submitted",payment_currency:"PEN",
 payment_charge_id:"chr_test_ABCDEFGHIJKLMNOP",payment_charge_source_id:"tkn_test_ABCDEFGHIJKLMNOP",
 payment_amount_minor:5800};
const charge={object:"charge",id:order.payment_charge_id,amount:5800,currency_code:"PEN",
 metadata:{bagelito_order_code:"BAG-000013"},source:{id:order.payment_charge_source_id},
 capture:true,current_amount:5800,amount_refunded:0,dispute:false,paid:false};
const event={object:"event",id,type:"charge.creation.succeeded",data:{...charge}};
delete event.data.currency_code;

function fixture({chargePatch={},eventPatch={},priorMarker=false,postStatus=200,orderPatch={}}={}) {
 const calls=[],states=[];let invoked=0;
 const source={...event,...eventPatch};
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  let payload;
  if(url.includes("/rest/v1/orders?"))payload=[{...order,...orderPatch}];
  else if(url.includes("/rest/v1/culqi_charge_confirmation_receipts?"))payload=[{provider_charge_id:order.payment_charge_id}];
  else if(url.includes("/rest/v1/payment_attempts?"))payload=[{id:"fixture-attempt"}];
  else if(url.includes("/rest/v1/payment_webhook_events?"))payload= priorMarker||invoked>0
    ? [{provider_event_id:id,processed_at:"2026-10-26T13:00:00Z",event_type:"charge.creation.succeeded"}]:[];
  else if(url.includes("/events?"))payload={data:[source]};
  else if(url.includes("/events/"))payload=source;
  else if(url.includes("/charges/"))payload={...charge,...chargePatch};
  else throw Error("unapproved fixture fetch");
  return new Response(JSON.stringify(payload),{status:200});
 };
 const post=async(req)=>{
  assert.equal(new URL(req.url).origin,"https://"+host);
  const body=await req.json();assert.equal(body.id,id);
  invoked++;
  states.push(invoked);
  return new Response(JSON.stringify(invoked===1
    ? {ok:true,status:"paid"}:{ok:true,duplicate:true}),{status:postStatus});
 };
 return {fetcher,post,calls,states};
}

test("strict gate rejects production, any wrong branch and merchant",()=>{
 assert.equal(allowed(env),true);
 for(const field of [
  {VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},
  {VERCEL_GIT_COMMIT_MESSAGE:"wrong"},
  {CULQI_MODE:"live"},{CULQI_LIVE_APPROVED:"true"},
  {NEXT_PUBLIC_SUPABASE_URL:"https://different.supabase.co"},
  {VERCEL_BRANCH_URL:"bagelito.pe"},
  {CULQI_SECRET_KEY:"sk_live_notallowed"},
 ])assert.equal(allowed({...env,...field}),false);
});
test("one genuine verified event applies once and second invocation is duplicate",async()=>{
 const f=fixture();const out=await run({env,fetcher:f.fetcher,post:f.post});
 assert.equal(out.verdict,"event_applied_and_duplicate_safe_pending_receipt_audit");
 assert.equal(out.firstApplied,true);assert.equal(out.recordConfirmed,true);
 assert.equal(out.secondDuplicate,true);assert.equal(out.orderStillPaid,true);
 assert.equal(out.attemptedChargeCreate,false);
 assert.deepEqual(f.states,[1,2]);
 assert.equal(out.receiptAuditExternal,true);assert.equal(out.attemptsUnchanged,true);
 for(const call of f.calls)assert.equal(call.init.method,"GET");
 assert.equal(JSON.stringify(out).includes(id),false);
 assert.equal(JSON.stringify(out).includes(env.CULQI_SECRET_KEY),false);
});
test("wrong provider capture, amount, currency, refund, source cannot reach webhook",async()=>{
 for(const chargePatch of [{capture:false},{currency_code:"USD"},{amount:5801},
  {amount_refunded:1},{current_amount:5799},{dispute:true},
  {source:{id:"tkn_test_DIFFERENTSOURCE"}}]){
  const f=fixture({chargePatch});const out=await run({env,fetcher:f.fetcher,post:f.post});
  assert.equal(out.verdict,"financial_evidence_incomplete");
  assert.equal(out.invokedWebhook,false);assert.equal(f.states.length,0);
 }
});
test("already processed provider event is never applied again by probe",async()=>{
 const f=fixture({priorMarker:true});
 const out=await run({env,fetcher:f.fetcher,post:f.post});
 assert.equal(out.verdict,"no_new_verified_event");assert.equal(f.states.length,0);
});
test("ineligible order cannot reach provider or webhook",async()=>{
 const f=fixture({orderPatch:{payment_status:"pending"}});
 const out=await run({env,fetcher:f.fetcher,post:f.post});
 assert.equal(out.verdict,"order_ineligible");assert.equal(f.states.length,0);
});
test("wrong source in event refuses transaction",async()=>{
 const changed={...event,data:{...event.data,source:{id:"tkn_test_ANOTHER-ID"}}};
 const f=fixture({eventPatch:changed});
 const out=await run({env,fetcher:f.fetcher,post:f.post});
 assert.equal(out.verdict,"no_matching_events");assert.equal(f.states.length,0);
});
