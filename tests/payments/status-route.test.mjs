import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../../src/app/api/payments/culqi/status/route.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace(/export /g,'');
const load=new Function('NextResponse','isCulqiRequestAllowed','createSupabaseAdminClient','process',`${body};return POST;`);
const session='00000000-0000-4000-8000-000000000001';
async function run({reconcile=false,requestedSession=session,allowed=true,order={},payment,rpcError=null,lookupError=null}={}){
 const row={id:'fixture',order_code:'BAG-1',checkout_session_id:session,payment_status:'paid',payment_order_id:null,payment_expires_at:'2000-01-01T00:00:00Z',status:reconcile?'cancelled':'payment_confirmed',payment_reconciliation_required:reconcile,...order};
 const filters=[],calls=[];
 const forbidden=()=>{throw new Error('The route cannot write from a stale snapshot');};
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},abortSignal(signal){assert.ok(signal instanceof AbortSignal);return q;},update:forbidden,insert:forbidden,maybeSingle:async()=>({data:filters.every(([k,v])=>row[k]===v)?row:null,error:lookupError})};
 const post=load({json:(payload,init={})=>({payload,status:init.status??200,headers:init.headers})},()=>allowed,()=>{
  calls.push('client');
  return {from:name=>{assert.equal(name,'orders');return q;},rpc:(name,args)=>{
   calls.push({name,args});
   return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({error:rpcError,data:payment===undefined?{paymentStatus:row.payment_status,orderStatus:row.status,reconciliationRequired:row.payment_reconciliation_required,expired:false}:payment});}};
  }};
 },{env:{}});
 const response=await post(new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderCode:'BAG-1',checkoutSessionId:requestedSession})}));
 response.fixtureCalls=calls;
 return response;
}
test('late paid reservation exposes review flag instead of hiding cancellation',async()=>{const r=await run({reconcile:true});assert.equal(r.payload.reconciliationRequired,true);assert.equal(r.payload.orderStatus,'cancelled');});
test('ordinary verified payment has no review flag',async()=>{const r=await run();assert.equal(r.payload.paymentStatus,'paid');assert.equal(r.payload.reconciliationRequired,false);});
test('wrong checkout session cannot read payment or reconciliation state',async()=>{const r=await run({requestedSession:'00000000-0000-4000-8000-000000000002'});assert.equal(r.status,404);assert.equal(r.payload.reconciliationRequired,undefined);});

test('disabled or forbidden origin and malformed sessions never access the database',async()=>{
 for(const options of [{allowed:false},{requestedSession:'invalid'}]){
  const r=await run(options);assert.ok([400,503].includes(r.status));assert.deepEqual(r.fixtureCalls,[]);
 }
});
test('expired submitting, 3DS, submitted and uncertain charges return review without route writes',async()=>{
 for(const payment_charge_state of ['submitting','requires_3ds','submitted','uncertain']){
  const r=await run({order:{payment_status:'pending',status:'payment_pending_review',payment_charge_state,payment_charge_id:'chr_test_fixture123'},payment:{paymentStatus:'pending',orderStatus:'payment_pending_review',reconciliationRequired:true,expired:false}});
  assert.equal(r.status,200);assert.equal(r.payload.paymentStatus,'pending');assert.equal(r.payload.orderStatus,'payment_pending_review');assert.equal(r.payload.reconciliationRequired,true);
  assert.deepEqual(r.fixtureCalls,['client',{name:'expire_culqi_token_session',args:{p_order_id:'fixture',p_checkout_session_id:session}}]);
 }
});
test('the locked result wins if a verified webhook changed the initial pending snapshot',async()=>{
 const r=await run({order:{payment_status:'pending',status:'payment_pending_review'},payment:{paymentStatus:'paid',orderStatus:'cancelled',reconciliationRequired:true,expired:false}});
 assert.equal(r.payload.paymentStatus,'paid');assert.equal(r.payload.orderStatus,'cancelled');assert.equal(r.payload.reconciliationRequired,true);
});
test('idle unpaid expiry uses the atomic cancellation result',async()=>{
 const r=await run({order:{payment_status:'pending',status:'payment_pending_review',payment_charge_state:'idle'},payment:{paymentStatus:'expired',orderStatus:'cancelled',reconciliationRequired:false,expired:true}});
 assert.equal(r.payload.paymentStatus,'expired');assert.equal(r.payload.orderStatus,'cancelled');assert.equal(r.payload.reconciliationRequired,false);
});
test('missing or failed expiry RPC fails closed and never exposes raw errors',async()=>{
 for(const rpcError of [{code:'42883',message:'fixture-private-error'},{message:'fixture-private-details'}]){
  const r=await run({rpcError});assert.equal(r.status,500);assert.deepEqual(r.payload,{ok:false,error:'Could not read payment status.'});assert.doesNotMatch(JSON.stringify(r.payload),/fixture-private/);
 }
});
test('malformed transaction results cannot invent payment or reconciliation state',async()=>{
 for(const payment of [null,[],'paid',{}, {paymentStatus:'paid',orderStatus:'payment_confirmed',reconciliationRequired:'false'},
  {paymentStatus:'unknown-fixture',orderStatus:'payment_confirmed',reconciliationRequired:false},
  {paymentStatus:'paid',orderStatus:'unknown-fixture',reconciliationRequired:false}]){
  const r=await run({payment});assert.equal(r.status,500);assert.deepEqual(r.payload,{ok:false,error:'Could not read payment status.'});
 }
});
test('lookup errors remain constant and status responses never cache',async()=>{
 const r=await run({lookupError:{message:'fixture-private-details'}});assert.equal(r.status,500);assert.doesNotMatch(JSON.stringify(r.payload),/fixture-private/);assert.match(r.headers['Cache-Control'],/\bno-store\b/);assert.match((await run()).headers['Cache-Control'],/\bno-store\b/);
});
