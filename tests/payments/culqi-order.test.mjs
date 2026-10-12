import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../../src/app/api/payments/culqi/order/route.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse','getPaymentConfig','toPaymentMinorUnits','createCulqiOrder','PublicApiError','enforcePublicApiSecurity','createSupabaseAdminClient', `${body}; return POST;`);
async function run(overrides = {}, attached = { attached: true }) {
  const expiry = new Date(Date.now()+100000).toISOString();
  const order = { id:'fixture',order_code:'BAG-1',customer_name:'Fixture',email:'fixture@example.invalid',whatsapp:'000000000',total_amount:68,status:'payment_pending_review',payment_provider:'culqi',payment_status:'pending',payment_order_id:null,payment_expires_at:expiry,...overrides };
  const calls=[]; const rpc=[];
  const db = { from() { const q={ select(){return q;},eq(){return q;},maybeSingle:async()=>({data:order,error:null}) }; return q; },rpc:async(name,args)=>{rpc.push({name,args});return {data:attached,error:null};}};
  const post = load({json:(payload,init={})=>({payload,status:init.status??200})},()=>({enabled:true,currency:'PEN'}),v=>Math.round(v*100),async(input)=>{calls.push(input);return {id:'ord_test_fixture123',amount:6800,currency_code:'PEN',expiresAt:expiry};},class extends Error {},async()=>{},()=>db);
  const response=await post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',email:order.email,amount:1})}));
  return {response,calls,rpc,expiry};
}
test('provider amount and expiry come from stored reservation and attach uses transaction',async()=>{
 const {response,calls,rpc,expiry}=await run();assert.equal(response.status,200);assert.equal(calls[0].amount,68);assert.equal(calls[0].expirationDate.toISOString(),expiry);assert.equal(rpc[0].name,'attach_culqi_order');
});
test('concurrent paid state is never reset by attaching an order',async()=>{
 const {response}=await run({}, {paid:true});assert.equal(response.status,409);
});
test('existing provider order is reused after failure instead of replaced',async()=>{
 const {response,calls}=await run({payment_order_id:'ord_test_existing',payment_status:'failed'});assert.equal(response.status,200);assert.equal(calls.length,0);assert.equal(response.payload.orderId,'ord_test_existing');
});
test('manual reservations and missing expiry cannot create a provider order',async()=>{
 for(const overrides of [{payment_provider:'manual'},{payment_expires_at:null}]){const {response,calls}=await run(overrides);assert.equal(response.status,409);assert.equal(calls.length,0);}
});
