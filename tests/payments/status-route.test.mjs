import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/status/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','isCulqiRequestAllowed','createSupabaseAdminClient',`${body};return POST;`);
const session='00000000-0000-4000-8000-000000000001';
async function run({reconcile=false,requestedSession=session}={}){
 const row={id:'fixture',order_code:'BAG-1',checkout_session_id:session,payment_status:'paid',payment_order_id:'ord_test_fixture123',status:reconcile?'cancelled':'payment_confirmed',payment_reconciliation_required:reconcile};
 const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>({data:filters.every(([k,v])=>row[k]===v)?row:null,error:null})};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200})},()=>true,()=>({from:()=>q}));
 return post(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({orderCode:'BAG-1',checkoutSessionId:requestedSession})}));
}
test('late paid reservation exposes review flag instead of hiding cancellation',async()=>{const r=await run({reconcile:true});assert.equal(r.payload.reconciliationRequired,true);assert.equal(r.payload.orderStatus,'cancelled');});
test('ordinary verified payment has no review flag',async()=>{const r=await run();assert.equal(r.payload.paymentStatus,'paid');assert.equal(r.payload.reconciliationRequired,false);});
test('wrong checkout session cannot read payment or reconciliation state',async()=>{const r=await run({requestedSession:'00000000-0000-4000-8000-000000000002'});assert.equal(r.status,404);assert.equal(r.payload.reconciliationRequired,undefined);});
