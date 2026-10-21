import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/charge/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','createCulqiCharge','isCulqiRequestAllowed','coordinateCulqiCharge','PublicApiError','enforcePublicApiSecurity','createSupabaseAdminClient','getPaymentConfig','toPaymentMinorUnits','fetchCulqiCharge',`${body};return POST;`);
const checkoutSessionId='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCheckoutSessionId='22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function run({order={},payload={},allowed=true,queryError=null}={}){
 const row={id:'fixture',order_code:'BAG-1',checkout_session_id:checkoutSessionId,email:'fixture@example.invalid',customer_name:'Fixture',delivery_address:'Fixture',district:'Lince',whatsapp:'000000000',total_amount:68,status:'payment_pending_review',payment_status:'pending',payment_lane:'token',payment_order_id:null,payment_expires_at:new Date(Date.now()+100000).toISOString(),...order};
 let coordinations=0, providerCalls=0;
 const filters=[],selections=[],coordinateCalls=[];
 const q={select(columns){selections.push(columns);return q;},eq(column,value){filters.push([column,value]);return q;},maybeSingle:async()=>({data:row,error:queryError})};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200})},async()=>{providerCalls++;throw new Error('Unexpected provider call');},()=>allowed,async(args)=>{coordinations++;coordinateCalls.push(args);return {ok:true,paymentStatus:'awaiting_webhook'};},class extends Error {},async()=>{},()=>({from:()=>q}),()=>({mode:'sandbox'}),amount=>Math.round(amount*100),async()=>{throw new Error('Unexpected GET');});
 const response=await post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',checkoutSessionId,email:'fixture@example.invalid',sourceId:'tkn_test_fixture123',deviceId:'device123',...payload})}));
 return {response,coordinations,providerCalls,filters,selections,coordinateCalls};
}
test('matching customer reaches the coordinator once',async()=>{const r=await run();assert.equal(r.response.status,200);assert.equal(r.coordinations,1);assert.equal(r.providerCalls,0);});
test('wrong email never claims or charges',async()=>{const r=await run({payload:{email:'other@example.invalid'}});assert.equal(r.response.status,404);assert.equal(r.coordinations,0);});
test('disabled or forbidden origin never claims or charges',async()=>{const r=await run({allowed:false});assert.equal(r.response.status,503);assert.equal(r.coordinations,0);});
test('cancelled, delivered and expired reservations never claim',async()=>{for(const order of [{status:'cancelled'},{status:'delivered'},{payment_expires_at:'2000-01-01T00:00:00Z'}]){const r=await run({order});assert.ok([409,410].includes(r.response.status));assert.equal(r.coordinations,0);}});
test('already paid reservation returns paid without claiming',async()=>{const r=await run({order:{payment_status:'paid'}});assert.equal(r.response.payload.paymentStatus,'paid');assert.equal(r.coordinations,0);});
test('malformed source or missing fingerprint cannot claim',async()=>{for(const payload of [{sourceId:'bad'},{deviceId:''}]){const r=await run({payload});assert.equal(r.response.status,400);assert.equal(r.coordinations,0);}});

test('legacy or alternate-order reservations never claim token charges',async()=>{for(const order of [{payment_lane:'legacy'},{payment_order_id:'ord_test_existing'}]){const r=await run({order});assert.equal(r.response.status,409);assert.equal(r.coordinations,0);}});

test('Yape token reaches coordinator without card fingerprint',async()=>{const r=await run({payload:{sourceId:'ype_test_fixture123',deviceId:''}});assert.equal(r.response.status,200);assert.equal(r.coordinations,1);});
test('Yape rejects card 3DS and amounts above PEN 2000',async()=>{for(const input of [{payload:{sourceId:'ype_test_fixture123',authentication3DS:{}}},{payload:{sourceId:'ype_test_fixture123'},order:{total_amount:2001}}]){const r=await run(input);assert.equal(r.response.status,400);assert.equal(r.coordinations,0);}});

test('missing or malformed checkout capability never reads an order, coordinates or charges',async()=>{
 for(const value of [undefined,null,'','not-a-uuid',400,{id:checkoutSessionId},[checkoutSessionId],
  '11111111-aaaa-0aaa-8aaa-aaaaaaaaaaaa','11111111-aaaa-4aaa-0aaa-aaaaaaaaaaaa']){
  const r=await run({payload:{checkoutSessionId:value}});
  assert.equal(r.response.status,400);assert.equal(r.coordinations,0);assert.equal(r.providerCalls,0);
  assert.deepEqual(r.selections,[]);assert.deepEqual(r.filters,[]);
  assert.equal(JSON.stringify(r.response).includes(checkoutSessionId),false);
 }
});

test('wrong capability, another order capability or a mismatched selected row never coordinates or charges',async()=>{
 for(const input of [
  {payload:{checkoutSessionId:otherCheckoutSessionId}},
  {order:{payment_status:'paid'},payload:{checkoutSessionId:otherCheckoutSessionId}},
  {order:{checkout_session_id:otherCheckoutSessionId}},
  {order:{order_code:'BAG-OTHER',checkout_session_id:otherCheckoutSessionId},payload:{checkoutSessionId:otherCheckoutSessionId}},
  {order:{checkout_session_id:null}},{order:{checkout_session_id:undefined}},
 ]){
  const r=await run(input);
  assert.equal(r.response.status,404);assert.equal(r.coordinations,0);assert.equal(r.providerCalls,0);
  const submitted=input.payload?.checkoutSessionId??checkoutSessionId;
  assert.deepEqual(r.filters,[['order_code','BAG-1'],['checkout_session_id',submitted]]);
  assert.equal(JSON.stringify(r.response).includes(submitted),false);
 }
});

test('valid normalized capability binds the query and preserves initial card, Yape and same-session 3DS coordination',async()=>{
 for(const payload of [
  {},{sourceId:'ype_test_fixture123',deviceId:''},
  {authentication3DS:{cavv:'synthetic',eci:'synthetic',xid:'synthetic',protocolVersion:'synthetic'}},
 ]){
  const r=await run({payload:{...payload,checkoutSessionId:`  ${checkoutSessionId.toUpperCase()}  `}});
  assert.equal(r.response.status,200);assert.equal(r.coordinations,1);assert.equal(r.providerCalls,0);
  assert.deepEqual(r.filters,[['order_code','BAG-1'],['checkout_session_id',checkoutSessionId]]);
  assert.ok(r.selections[0].split(', ').includes('checkout_session_id'));
  assert.equal(r.coordinateCalls[0].orderId,'fixture');assert.equal(r.coordinateCalls[0].orderCode,'BAG-1');
  assert.equal(r.coordinateCalls[0].sourceId,payload.sourceId??'tkn_test_fixture123');
  assert.equal(r.coordinateCalls[0].has3DS,Boolean(payload.authentication3DS));
 }
});

test('an order lookup failure never echoes checkout capability in an error or reaches coordination',async()=>{
 const r=await run({queryError:{message:`synthetic DB error ${checkoutSessionId} fixture@example.invalid`}});
 assert.equal(r.response.status,500);assert.equal(r.coordinations,0);assert.equal(r.providerCalls,0);
 assert.deepEqual(r.response.payload,{ok:false,error:'Could not process Culqi payment.'});
 assert.equal(JSON.stringify(r.response).includes(checkoutSessionId),false);
});

test('confirmation context uses persisted amount and capability, configured mode and a server GET helper',async()=>{
 const r=await run({payload:{amount:1,amountMinor:1,mode:'live',checkoutSessionId}});
 assert.equal(r.response.status,200);
 assert.equal(r.coordinateCalls[0].amountMinor,6800);
 assert.equal(r.coordinateCalls[0].checkoutSessionId,checkoutSessionId);
 assert.equal(r.coordinateCalls[0].mode,'test');
 assert.equal(typeof r.coordinateCalls[0].fetchCharge,'function');
});
