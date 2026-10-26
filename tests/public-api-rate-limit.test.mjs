import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";

const source = await readFile(new URL("../src/lib/public-api-security.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, "")).replace(/export /g, "");
const client = new Function("createHash", "createSupabaseAdminClient", "logWarn",
  executable + "; return {enforcePublicApiSecurity, PublicApiError};");

function makeClient(results) {
 const calls = [], warnings = [];
 const api = client(createHash, () => ({
   rpc: (name, args) => {
     calls.push({name,args});
     return {single: async () => results[Math.min(calls.length-1,results.length-1)]};
   },
 }), (...args)=>warnings.push(args));
 const request = new Request("https://fixture.invalid/api/reservations/culqi", {
   method:"POST",headers:{"user-agent":"synthetic test"},
 });
 return { ...api, request, calls, warnings,
  check: () => api.enforcePublicApiSecurity({email:"sample@example.invalid",
    request,scope:"payments",whatsapp:""})};
}

test("missing DB rate-limit migration returns 503 instead of allowing unlimited requests",async()=>{
 const f=makeClient([{data:null,error:{code:"42883",message:"function consume_api_rate_limit does not exist"}}]);
 await assert.rejects(f.check(),error=>error instanceof f.PublicApiError
   && error.status===503&&error.code==="rate_limit_unavailable");
 assert.equal(f.calls.length,1);
 assert.equal(f.warnings.length,1);
 assert.equal(JSON.stringify(f.warnings).includes("sample@example.invalid"),false);
});

test("other DB error fails closed too",async()=>{
 const f=makeClient([{data:null,error:{code:"XX000",message:"Database offline"}}]);
 await assert.rejects(f.check());
 assert.equal(f.calls.length,1);
});

test("normal authenticated limiter permits a request after both buckets approve",async()=>{
 const f=makeClient([{data:{allowed:true,hits:1,retry_after_seconds:0},error:null}]);
 await f.check();
 assert.equal(f.calls.length,2);
 for(const entry of f.calls) {
   assert.equal(entry.name,"consume_api_rate_limit");
   assert.match(entry.args.p_identifier,/^[a-f0-9]{64}$/);
 }
});
test("rejected limit produces 429 and never executes contact bucket",async()=>{
 const f=makeClient([{data:{allowed:false,hits:21,retry_after_seconds:45},error:null}]);
 await assert.rejects(f.check(),error=>error.status===429&&error.retryAfterSeconds===45);
 assert.equal(f.calls.length,1);
});
