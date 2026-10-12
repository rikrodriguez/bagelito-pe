import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/order/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','getPaymentConfig','isCulqiRequestAllowed','PublicApiError','enforcePublicApiSecurity','createSupabaseAdminClient',`${body};return POST;`);
async function run({overrides={},blocked=false,email='fixture@example.invalid',allowed=true}={}) {
 const order={id:'fixture',email:'fixture@example.invalid',payment_provider:'culqi',payment_lane:'token',payment_order_id:null,...overrides};const calls=[];
 const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:order,error:null})};
 const db={from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return blocked?{data:null,error:{message:'blocked'}}:{data:{sessionId:'local-fixture',amount:6800,expiresAt:'fixture'},error:null};}};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200})},()=>({currency:'PEN'}),()=>allowed,class extends Error {},async()=>{},()=>db);
 const response=await post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',email,amount:1})}));return {response,calls};
}
test('prepares only a local token session, with amount from locked RPC',async()=>{const {response,calls}=await run();assert.equal(response.status,200);assert.equal(response.payload.amount,6800);assert.equal(response.payload.sessionId,'local-fixture');assert.equal(response.payload.orderId,undefined);assert.equal(calls[0].name,'prepare_culqi_token_session');assert.doesNotMatch(source,/createCulqiOrder|\/orders["']/);});
test('manual and legacy provider-order reservations cannot enter token lane',async()=>{for(const overrides of [{payment_provider:'manual'},{payment_lane:'legacy'},{payment_order_id:'ord_test_existing'}]){const {response,calls}=await run({overrides});assert.equal(response.status,409);assert.equal(calls.length,0);}});
test('in-flight, uncertain, expired or paid session RPC rejection is fail closed',async()=>{const {response}=await run({blocked:true});assert.equal(response.status,409);assert.equal(response.payload.sessionId,undefined);});
test('wrong email and forbidden origin cannot prepare session',async()=>{for(const input of [{email:'wrong@example.invalid'},{allowed:false}]){const {response,calls}=await run(input);assert.ok([404,503].includes(response.status));assert.equal(calls.length,0);}});
test('checkout never exposes an alternative payment order or methods',async()=>{const ui=await readFile(new URL('../../src/components/payments/CulqiCheckoutButton.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/order:\s*session\./);assert.match(ui,/yape: session.amountMinor <= 200000/);for(const method of ['agente','bancaMovil','billetera','cuotealo'])assert.match(ui,new RegExp(method+': false'));});
