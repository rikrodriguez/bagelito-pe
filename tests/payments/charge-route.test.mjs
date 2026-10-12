import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/charge/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','createCulqiCharge','isCulqiRequestAllowed','coordinateCulqiCharge','PublicApiError','enforcePublicApiSecurity','createSupabaseAdminClient',`${body};return POST;`);
async function run({order={},payload={},allowed=true}={}){
 const row={id:'fixture',order_code:'BAG-1',email:'fixture@example.invalid',customer_name:'Fixture',delivery_address:'Fixture',district:'Lince',whatsapp:'000000000',total_amount:68,status:'payment_pending_review',payment_status:'pending',payment_lane:'token',payment_order_id:null,payment_expires_at:new Date(Date.now()+100000).toISOString(),...order};
 let coordinations=0, providerCalls=0;
 const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:row,error:null})};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200})},async()=>{providerCalls++;throw new Error('Unexpected provider call');},()=>allowed,async()=>{coordinations++;return {ok:true,paymentStatus:'awaiting_webhook'};},class extends Error {},async()=>{},()=>({from:()=>q}));
 const response=await post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',email:'fixture@example.invalid',sourceId:'tkn_test_fixture123',deviceId:'device123',...payload})}));
 return {response,coordinations,providerCalls};
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
