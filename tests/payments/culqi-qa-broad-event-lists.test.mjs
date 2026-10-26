import test from "node:test";
import assert from "node:assert/strict";
import { inspectBroadEventLists } from "../../scripts/culqi-qa-readonly-events.mjs";
const targetId = "evt_test_ABCDEFGHIJKLMNOP";
const payload = { type: "charge.creation.succeeded", id: targetId,
 data: JSON.stringify({ object: "charge", currency_code: "PEN", metadata: { bagelito_order_code: "BAG-000013" } }) };
function mock(sequence) {
  const requests=[];
  return {
    requests,
    fetch: async (url, init) => {
      requests.push({ url, init });
      const [status,data]=sequence[requests.length-1] ?? [404, { type:"resource_error" }];
      return new Response(JSON.stringify(data),{status});
    }
  };
}
test("empty unfiltered list is reported as partial evidence, not a verified webhook",async()=>{
 const f=mock([[200,{data:[]}],[200,{data:[]}],[200,{data:[]}]]);
 const r=await inspectBroadEventLists(f.fetch,"sk_test_fixture");
 assert.equal(r.interpretation,"unfiltered_page_empty");
 assert.deepEqual(r.checks.map(x=>x.filter),["unfiltered","by_type","by_date"]);
 assert.equal(r.readsAttempted,3);
 assert.equal(r.writesAttempted,false);
 for(const q of f.requests){assert.equal(q.init.method,"GET");assert.equal(q.init.body,undefined);}
 assert.equal(JSON.stringify(r).includes("sk_test_fixture"),false);
});
test("target from unfiltered list must pass a matching provider detail GET",async()=>{
 const f=mock([[200,{data:[payload]}],[200,{data:[]}],[200,{data:[]}],[200,payload]]);
 const r=await inspectBroadEventLists(f.fetch,"sk_test_fixture");
 assert.equal(r.interpretation,"sdk_get_verified");
 assert.equal(r.lookupAttempted,true);assert.equal(r.identityVerified,true);
 assert.equal(r.readsAttempted,4);
 assert.equal(JSON.stringify(r).includes(targetId),false);
});
test("parameter failure on version allows one minimal GET only",async()=>{
 const f=mock([[200,{data:[payload]}],[200,{data:[]}],[200,{data:[]}],
  [400,{type:"parameter_error",param:"x-api-version"}],[200,payload]]);
 const r=await inspectBroadEventLists(f.fetch,"sk_test_fixture");
 assert.equal(r.interpretation,"minimal_get_verified");
 assert.equal(r.readsAttempted,5);
 assert.equal(f.requests[3].init.headers["x-api-version"],"2");
 assert.equal(f.requests[4].init.headers["x-api-version"],undefined);
});
test("explicit ID rejection cannot fallback or accept caller claims",async()=>{
 const f=mock([[200,{data:[payload]}],[200,{data:[]}],[200,{data:[]}],
  [400,{type:"parameter_error",param:"id"}]]);
 const r=await inspectBroadEventLists(f.fetch,"sk_test_fixture");
 assert.equal(r.interpretation,"sdk_get_unverified");
 assert.equal(r.identityVerified,false);assert.equal(r.readsAttempted,4);
 assert.equal(JSON.stringify(r).includes(targetId),false);
});
