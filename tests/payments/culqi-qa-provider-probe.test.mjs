import test from "node:test";import assert from "node:assert/strict";
import {scope,runProbe} from "../../scripts/culqi-qa-probe-event.mjs";
const host="bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
 VERCEL_GIT_COMMIT_REF:"codex/culqi-payment-split-20261021",
 VERCEL_GIT_COMMIT_MESSAGE:"qa: inspect Culqi provider event retrieval",VERCEL_GIT_REPO_OWNER:"rikrodriguez",
 VERCEL_GIT_REPO_SLUG:"bagelito-pe",VERCEL_BRANCH_URL:host,NEXT_PUBLIC_SITE_URL:"https://"+host,
 NEXT_PUBLIC_SUPABASE_URL:"https://qaahskendqdkynwtylho.supabase.co",PAYMENT_PROVIDER:"culqi",
 CULQI_MODE:"sandbox",CULQI_ENABLED:"true",CULQI_LIVE_APPROVED:"false",CULQI_SECRET_KEY:"sk_test_fixture"};
const event={id:"evt_test_ABCDEFGHIJKLMNOP",type:"charge.creation.succeeded",creation_date:1792009200000,
 data:JSON.stringify({object:"charge",id:"chr_test_ABCDEFGHIJKLMNOP",currency_code:"PEN",
 metadata:{bagelito_order_code:"BAG-000013"}})};
function fixture(seq){
 const calls=[];return{calls,fetch:async(url,init)=>{calls.push({url,init});const [status,body]=seq[calls.length-1]||[400,{type:"parameter_error",param:"id"}];return new Response(JSON.stringify(body),{status});}};
}
test("scope denies non-sandbox, wrong host and wrong commit",()=>{assert.equal(scope(env),true);
 for(const patch of [{CULQI_MODE:"live"},{VERCEL_ENV:"production"},{VERCEL_BRANCH_URL:"bagelito.pe"},
 {VERCEL_GIT_COMMIT_MESSAGE:"unauthorized"},{NEXT_PUBLIC_SUPABASE_URL:"https://another.supabase.co"}]){
 assert.equal(scope({...env,...patch}),false);}
});
test("real-looking listed event read succeeds with sdk or minimal headers",async()=>{
 const f=fixture([[200,{data:[event]}],[400,{type:"parameter_error",param:"x-api-version"}],[200,event]]);
 const r=await runProbe(f.fetch,env);
 assert.equal(r.verdict,"authentic_provider_event_lookup_worked");
 assert.equal(r.list.count,1);assert.equal(r.list.idFormat.documented25,1);
 assert.equal(r.list.withOrderCode,1);assert.equal(r.detail.minimal.exactId,true);
 assert.equal(r.detail.sdk.http,400);assert.equal(r.detail.sdk.errorParam,"version");
 assert.deepEqual(f.calls.map(x=>x.init.method),["GET","GET","GET"]);
 assert.equal(JSON.stringify(r).includes(event.id),false);
 assert.equal(JSON.stringify(r).includes("sk_test_fixture"),false);
});
test("provider 400 on both GETs reports failure and no fake acknowledgement",async()=>{
 const f=fixture([[200,{data:[event]}],[400,{type:"parameter_error",param:"id"}],
 [400,{type:"parameter_error",param:"id"}]]);
 const r=await runProbe(f.fetch,env);
 assert.equal(r.verdict,"authentic_provider_event_lookup_failed");
 assert.equal(r.detail.sdk.errorParam,"id");assert.equal(r.detail.minimal.errorParam,"id");
 assert.equal(r.attemptedWrites,false);
});
test("no legitimate event id never performs detail lookup",async()=>{
 const f=fixture([[200,{data:[{...event,id:"evt_test_invalid"}]}]]);
 const r=await runProbe(f.fetch,env);
 assert.equal(r.verdict,"no_documented_event_id_in_list");assert.equal(f.calls.length,1);
});
