import test from "node:test";import assert from "node:assert/strict";
import {allowedQA,runReplay} from "../../scripts/culqi-qa-webhook-replay.mjs";
const host="bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
 VERCEL_GIT_COMMIT_REF:"codex/culqi-payment-split-20261021",
 VERCEL_GIT_COMMIT_MESSAGE:"qa: replay verified Culqi webhook in sandbox",
 VERCEL_GIT_REPO_OWNER:"rikrodriguez",VERCEL_GIT_REPO_SLUG:"bagelito-pe",VERCEL_BRANCH_URL:host,
 NEXT_PUBLIC_SITE_URL:"https://"+host,NEXT_PUBLIC_SUPABASE_URL:"https://qaahskendqdkynwtylho.supabase.co",
 PAYMENT_PROVIDER:"culqi",CULQI_MODE:"sandbox",CULQI_ENABLED:"true",CULQI_LIVE_APPROVED:"false",
 CULQI_SECRET_KEY:"sk_test_fixture",SUPABASE_SERVICE_ROLE_KEY:"not_a_real_service_role_key_this_is_fixture_only"};
const order={order_code:"BAG-000013",payment_provider:"culqi",payment_lane:"token",payment_status:"paid",
 status:"payment_confirmed",payment_charge_state:"submitted",payment_reconciliation_required:false,
 payment_charge_id:"chr_test_ABCDEFGHIJKLMNOP",payment_charge_source_id:"tkn_test_ABCDEFGHIJKLMNOP",
 payment_amount_minor:5800,payment_currency:"PEN"};
const data={object:"charge",id:order.payment_charge_id,amount:5800,currency_code:"PEN",
 metadata:{bagelito_order_code:"BAG-000013"},source:{id:order.payment_charge_source_id}};
const evt={id:"evt_test_ABCDEFGHIJKLMNOP",object:"event",type:"charge.creation.succeeded",data};
function fixture(opts={}){
 const requests=[];let applied=0;
 const fetcher=async(url,init)=>{
  requests.push({url,init});
  let response;
  if(url.includes("/rest/v1/orders?"))response=opts.order===null?[]:[opts.order??order];
  else if(url.includes("/v2/events?"))response={data:opts.noEvent?[]:[opts.event??evt]};
  else response=opts.detail??opts.event??evt;
  return new Response(JSON.stringify(response),{status:200});
 };
 const post=async()=>{applied++;return new Response(JSON.stringify(applied===1
   ?{ok:true,status:"paid"}:{ok:true,duplicate:true}),{status:200});};
 return {fetcher,post,requests,getCalls:()=>applied};
}
test("gate rejects preview mismatch, live keys and wrong commit",()=>{
 assert.equal(allowedQA(env),true);
 for(const delta of [{CULQI_MODE:"live"},{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_MESSAGE:"other"},
  {NEXT_PUBLIC_SITE_URL:"https://bagelito.pe"},{CULQI_SECRET_KEY:"sk_live_fixture"}])
 assert.equal(allowedQA({...env,...delta}),false);
});
test("verified charge event invokes webhook exactly twice, with no charge POST",async()=>{
 const f=fixture();
 const r=await runReplay({env,fetcher:f.fetcher,post:f.post});
 assert.equal(r.verdict,"webhook_applied_then_idempotent");
 assert.equal(r.duplicate,true);assert.equal(f.getCalls(),2);
 assert.equal(r.attemptedChargePOST,false);
 assert.equal(f.requests.length,3);for(const c of f.requests){assert.equal(c.init.method,"GET");}
 assert.equal(JSON.stringify(r).includes(evt.id),false);
 assert.equal(JSON.stringify(r).includes(env.CULQI_SECRET_KEY),false);
});
test("wrong source, amount or currency cannot reach webhook or change order",async()=>{
 for(const dataDelta of [{amount:5801},{currency_code:"USD"},{source:{id:"tkn_test_wrong_wrong123"}}]){
  const f=fixture({event:{...evt,data:{...data,...dataDelta}}});
  const r=await runReplay({env,fetcher:f.fetcher,post:f.post});
  assert.equal(r.verdict,"no_matching_event");assert.equal(f.getCalls(),0);
 }
});
test("missing QA paid order blocks event GET and POST",async()=>{
 const f=fixture({order:null});const r=await runReplay({env,fetcher:f.fetcher,post:f.post});
 assert.equal(r.verdict,"qa_order_ineligible");assert.equal(f.getCalls(),0);assert.equal(f.requests.length,1);
});
test("a detail with mismatched ID fails before any DB mutation",async()=>{
 const f=fixture({detail:{...evt,id:"evt_test_DIFFERENTDIFFERENT"}});
 const r=await runReplay({env,fetcher:f.fetcher,post:f.post});
 assert.equal(r.verdict,"provider_identity_failed");assert.equal(f.getCalls(),0);
});
