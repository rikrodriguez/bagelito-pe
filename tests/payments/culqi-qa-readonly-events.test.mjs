import test from "node:test";
import assert from "node:assert/strict";
import { allowedQAEnvironment, inspectQAEvents } from "../../scripts/culqi-qa-readonly-events.mjs";
const token = "test-fixture-not-a-real-secret";
const eventId = "evt_test_ABCDEFGHIJKLMNOP";
const data = JSON.stringify({ object:"charge", id:"chr_test_ABCDEFGHIJKLMNOP",
  currency_code:"PEN", metadata: { bagelito_order_code:"BAG-000013" } });
const event = { object:"event", id:eventId, type:"charge.creation.succeeded", data };
const list = { data:[{object:"event",id:"evt_test_ZZZZZZZZZZZZZZZZ",type:"charge.creation.failed",data:"{}"},event] };

function makeFetch(sequence) {
  const calls = [];
  const fn = async (url,init) => {
    calls.push({url,method:init.method,body:init.body,headers:init.headers});
    const [status,body] = sequence[calls.length-1] || [404,{type:"resource_error"}];
    return new Response(JSON.stringify(body),{status});
  };
  return {fn,calls};
}

test("one-shot permission requires exact QA identity and refuses public/live", () => {
  assert.equal(allowedQAEnvironment({}),false);
  const valid={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0",
    VERCEL_GIT_COMMIT_REF:"codex/culqi-payment-split-20261021",
    VERCEL_GIT_COMMIT_MESSAGE:"qa: one-shot readonly Culqi event diagnostics",
    VERCEL_GIT_REPO_OWNER:"rikrodriguez",VERCEL_GIT_REPO_SLUG:"bagelito-pe",
    VERCEL_BRANCH_URL:"bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app",
    NEXT_PUBLIC_SITE_URL:"https://bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app",
    NEXT_PUBLIC_SUPABASE_URL:"https://qaahskendqdkynwtylho.supabase.co",
    PAYMENT_PROVIDER:"culqi",CULQI_MODE:"sandbox",CULQI_ENABLED:"true",
    CULQI_LIVE_APPROVED:"false",CULQI_SECRET_KEY:"sk_test_fixture"};
  assert.equal(allowedQAEnvironment(valid),true);
  assert.equal(allowedQAEnvironment({...valid,CULQI_MODE:"live"}),false);
  assert.equal(allowedQAEnvironment({...valid,VERCEL_GIT_COMMIT_MESSAGE:"other"}),false);
  assert.equal(allowedQAEnvironment({...valid,VERCEL_GIT_COMMIT_REF:"main"}),false);
});

test("SDK GET success uses only two read-only requests",async()=>{
  const x=makeFetch([[200,list],[200,event]]);
  const r=await inspectQAEvents(x.fn,token);
  assert.equal(r.interpretation,"sdk_get_verified");
  assert.equal(r.verifiedByGet,true);
  assert.equal(x.calls.length,2);
  assert.equal(r.writesAttempted,false);
  for(const c of x.calls) {
    assert.equal(c.method,"GET");
    assert.equal(c.body,undefined);
    assert.equal(c.headers.Authorization,"Bearer "+token);
  }
});

test("parameter error on SDK headers permits one auth-only GET",async()=>{
  const x=makeFetch([[200,list],[400,{type:"parameter_error",param:"x-api-version"}],[200,event]]);
  const r=await inspectQAEvents(x.fn,token);
  assert.equal(r.interpretation,"auth_only_get_verified");
  assert.equal(r.sdkErrorParam,"version");
  assert.equal(r.sdkGetStatus,400);
  assert.equal(r.fallbackGetStatus,200);
  assert.equal(r.verifiedByGet,true);
  assert.equal(x.calls.length,3);
  assert.equal(x.calls[1].headers["x-api-version"],"2");
  assert.equal(x.calls[2].headers["x-api-version"],undefined);
});

test("ID parameter error never triggers a minimal fallback",async()=>{
  const x=makeFetch([[200,list],[400,{type:"parameter_error",param:"id"}]]);
  const r=await inspectQAEvents(x.fn,token);
  assert.equal(r.interpretation,"sdk_get_unverified");
  assert.equal(r.fallbackAttempted,false);
  assert.equal(x.calls.length,2);
});

test("unrelated events and invalid IDs trigger zero detail GETs",async()=>{
  const a=makeFetch([[200,{data:[]}]]);
  assert.equal((await inspectQAEvents(a.fn,token)).interpretation,"target_not_in_bounded_page");
  assert.equal(a.calls.length,1);
  const b=makeFetch([[200,{data:[{...event,id:"evt_test_too_short"}]}]]);
  assert.equal((await inspectQAEvents(b.fn,token)).interpretation,"invalid_event_id_shape");
  assert.equal(b.calls.length,1);
});

test("provider failures never leak sensitive IDs, keys, payloads",async()=>{
  const x=makeFetch([[400,{type:"parameter_error",param:"secret-id",merchant_message:token}]]);
  const r=await inspectQAEvents(x.fn,token);
  assert.equal(r.interpretation,"request_failed");
  assert.equal(JSON.stringify(r).includes(token),false);
  assert.equal(JSON.stringify(r).includes(eventId),false);
  assert.equal(r.writesAttempted,false);
});
