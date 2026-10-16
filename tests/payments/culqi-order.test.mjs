import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/order/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','getPaymentConfig','isCulqiRequestAllowed','PublicApiError','enforcePublicApiSecurity','createSupabaseAdminClient',`${body};return POST;`);
const checkoutSessionId='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCheckoutSessionId='22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function run({overrides={},blocked=false,email='fixture@example.invalid',allowed=true,payload={},queryError=null}={}) {
 const order={id:'fixture',order_code:'BAG-1',checkout_session_id:checkoutSessionId,email:'fixture@example.invalid',payment_provider:'culqi',payment_lane:'token',payment_order_id:null,...overrides};const calls=[],filters=[],selections=[];
 const q={select(columns){selections.push(columns);return q;},eq(column,value){filters.push([column,value]);return q;},maybeSingle:async()=>({data:order,error:queryError})};
 const db={from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return blocked?{data:null,error:{message:'blocked'}}:{data:{sessionId:'local-fixture',amount:6800,expiresAt:'fixture'},error:null};}};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200})},()=>({currency:'PEN'}),()=>allowed,class extends Error {},async()=>{},()=>db);
 const response=await post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',email,checkoutSessionId,amount:1,...payload})}));return {response,calls,filters,selections};
}
test('prepares only a local token session, with amount from locked RPC',async()=>{const {response,calls}=await run();assert.equal(response.status,200);assert.equal(response.payload.amount,6800);assert.equal(response.payload.sessionId,'local-fixture');assert.equal(response.payload.orderId,undefined);assert.equal(calls[0].name,'prepare_culqi_token_session');assert.doesNotMatch(source,/createCulqiOrder|\/orders["']/);});
test('manual and legacy provider-order reservations cannot enter token lane',async()=>{for(const overrides of [{payment_provider:'manual'},{payment_lane:'legacy'},{payment_order_id:'ord_test_existing'}]){const {response,calls}=await run({overrides});assert.equal(response.status,409);assert.equal(calls.length,0);}});
test('in-flight, uncertain, expired or paid session RPC rejection is fail closed',async()=>{const {response}=await run({blocked:true});assert.equal(response.status,409);assert.equal(response.payload.sessionId,undefined);});
test('wrong email and forbidden origin cannot prepare session',async()=>{for(const input of [{email:'wrong@example.invalid'},{allowed:false}]){const {response,calls}=await run(input);assert.ok([404,503].includes(response.status));assert.equal(calls.length,0);}});
test('checkout never exposes an alternative payment order or methods',async()=>{const ui=await readFile(new URL('../../src/components/payments/CulqiCheckoutButton.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/order:\s*session\./);assert.match(ui,/yape: session.amountMinor <= 200000/);for(const method of ['agente','bancaMovil','billetera','cuotealo'])assert.match(ui,new RegExp(method+': false'));});

test('missing or malformed checkout capability cannot read or prepare a local token session',async()=>{
 for(const value of [undefined,null,'','not-a-uuid',400,{id:checkoutSessionId},[checkoutSessionId],
  '11111111-aaaa-0aaa-8aaa-aaaaaaaaaaaa','11111111-aaaa-4aaa-0aaa-aaaaaaaaaaaa']){
  const r=await run({payload:{checkoutSessionId:value}});
  assert.equal(r.response.status,400);assert.deepEqual(r.calls,[]);assert.deepEqual(r.filters,[]);assert.deepEqual(r.selections,[]);
  assert.equal(r.response.payload.sessionId,undefined);assert.equal(JSON.stringify(r.response).includes(checkoutSessionId),false);
 }
});

test('wrong capability or mismatched selected order cannot prepare or disclose a local token session',async()=>{
 for(const input of [
  {payload:{checkoutSessionId:otherCheckoutSessionId}},
  {overrides:{checkout_session_id:otherCheckoutSessionId}},
  {overrides:{order_code:'BAG-OTHER',checkout_session_id:otherCheckoutSessionId},payload:{checkoutSessionId:otherCheckoutSessionId}},
  {overrides:{checkout_session_id:null}},{overrides:{checkout_session_id:undefined}},
 ]){
  const r=await run(input);const submitted=input.payload?.checkoutSessionId??checkoutSessionId;
  assert.equal(r.response.status,404);assert.deepEqual(r.calls,[]);assert.equal(r.response.payload.sessionId,undefined);
  assert.deepEqual(r.filters,[['order_code','BAG-1'],['checkout_session_id',submitted]]);
  assert.equal(JSON.stringify(r.response).includes(submitted),false);
 }
});

test('valid normalized capability binds preparation to exactly the requested order and unchanged RPC',async()=>{
 const r=await run({payload:{checkoutSessionId:`  ${checkoutSessionId.toUpperCase()}  `}});
 assert.equal(r.response.status,200);assert.equal(r.response.payload.amount,6800);
 assert.deepEqual(r.filters,[['order_code','BAG-1'],['checkout_session_id',checkoutSessionId]]);
 assert.ok(r.selections[0].split(', ').includes('checkout_session_id'));
 assert.deepEqual(r.calls,[{name:'prepare_culqi_token_session',args:{p_order_id:'fixture'}}]);
 assert.notEqual(r.response.payload.sessionId,checkoutSessionId,'attempt ID is separate from the submitted ownership capability');
});

test('a preparation lookup failure cannot echo the checkout capability or disclose a session',async()=>{
 const r=await run({queryError:{message:`synthetic DB error ${checkoutSessionId} fixture@example.invalid`}});
 assert.equal(r.response.status,500);assert.deepEqual(r.calls,[]);
 assert.deepEqual(r.response.payload,{ok:false,error:'Could not prepare token checkout.'});
 assert.equal(JSON.stringify(r.response).includes(checkoutSessionId),false);
});
