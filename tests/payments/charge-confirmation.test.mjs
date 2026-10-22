import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from '../helpers/load-ts.mjs';
const { coordinateCulqiCharge } = sourceModule('src/lib/payments/charge-coordinator.ts');

// Models the RPC contract; actual locks/constraints are exercised by SQL fixtures.
const base = { orderId:'order-1',orderCode:'BAG-1',sourceId:'tkn_test_12345678',
  checkoutSessionId:'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',amountMinor:6800,mode:'test',
  deviceId:'device123',has3DS:false };
const captured=(overrides={})=>({object:'charge',id:'chr_test_12345678',amount:6800,
  currency_code:'PEN',metadata:{bagelito_order_code:'BAG-1'},source:{id:base.sourceId},
  capture:true,current_amount:6800,amount_refunded:0,dispute:false,paid:false,...overrides});
const result=(overrides={})=>({requires3DS:false,charge:captured(overrides)});
function database({late=false}={}) {
  const row={state:'idle',attempt:'claim-1',source:null,chargeId:null,paid:false};
  const confirmations=[];
  return {row,confirmations,async rpc(name,args){
    if(name==='claim_culqi_charge'){
      if(row.paid)return {data:{claimed:false,state:'paid'},error:null};
      if(row.state!=='idle')return {data:{claimed:false,state:row.state},error:null};
      row.state='submitting';row.source=args.p_source_id;
      return {data:{claimed:true,state:row.state,attempt_id:row.attempt},error:null};
    }
    if(name==='finish_culqi_charge'){
      assert.equal(args.p_attempt_id,row.attempt);
      if(row.state==='submitting'){row.state=args.p_state;row.chargeId=args.p_charge_id;}
      return {data:{state:row.state},error:null};
    }
    assert.equal(name,'confirm_culqi_charge_result');
    assert.equal(args.p_charge_attempt_id,row.attempt);
    assert.equal(args.p_checkout_session_id,base.checkoutSessionId);
    assert.equal(args.p_observation.chargeId,row.chargeId);
    assert.equal(args.p_observation.sourceId,row.source);
    confirmations.push(args);row.paid=true;
    return {data:{paymentState:'paid',orderState:late?'cancelled':'payment_confirmed',requiresReview:late,
      applied:true,duplicate:false,alreadyPaid:false},error:null};
  }};
}

test('valid charge confirms with webhook absent, no GET, and truthful POST provenance',async()=>{
  const db=database();let gets=0;
  const r=await coordinateCulqiCharge({...base,db,createCharge:async()=>result(),
    fetchCharge:async()=>{gets++;throw new Error('unexpected GET');}});
  assert.equal(r.paymentStatus,'paid');assert.equal(gets,0);assert.equal(db.confirmations.length,1);
  const evidence=db.confirmations[0];assert.equal(evidence.p_provenance,'culqi_charge_post');
  assert.equal(evidence.p_mode,'test');assert.ok(Number.isFinite(Date.parse(evidence.p_observed_at)));
  assert.deepEqual(Object.keys(evidence.p_observation).sort(),['chargeId','sourceId','amountMinor',
    'currencyCode','capture','currentAmountMinor','amountRefundedMinor','dispute','captureDatePresent'].sort());
  assert.equal(JSON.stringify(r).includes(base.sourceId),false);
});
test('incomplete evidence consults the same charge once and records GET provenance',async()=>{
  const db=database(), incomplete=captured();delete incomplete.current_amount;const ids=[];
  const r=await coordinateCulqiCharge({...base,db,createCharge:async()=>({requires3DS:false,charge:incomplete}),
    fetchCharge:async id=>{ids.push(id);return captured();}});
  assert.equal(r.paymentStatus,'paid');assert.deepEqual(ids,[incomplete.id]);
  assert.equal(db.confirmations[0].p_provenance,'culqi_charge_get');
});
test('incompatible charge fields never settle or GET, even alongside missing fields',async()=>{
  for(const change of [{amount:1},{currency_code:'USD'},{metadata:{bagelito_order_code:'BAG-OTHER'}},
    {source:{id:'ype_test_other1234'}},{capture:false},{current_amount:1},{amount_refunded:1},
    {dispute:true},{id:'chr_live_12345678'},{amount:undefined,capture:false}]){
    const db=database();let gets=0;
    const r=await coordinateCulqiCharge({...base,db,createCharge:async()=>result(change),
      fetchCharge:async()=>{gets++;return captured();}});
    assert.equal(r.paymentStatus,'reconciliation_required',JSON.stringify(change));
    assert.equal(db.row.state,'uncertain');assert.equal(db.confirmations.length,0);assert.equal(gets,0);
  }
});
test('failed, mismatched or still incomplete GET keeps known charge and blocks another charge',async()=>{
  for(const fetchCharge of [async()=>{throw new Error('timeout');},async()=>captured({amount:1}),async()=>({})]){
    const db=database(),incomplete=captured();delete incomplete.dispute;let calls=0;
    const createCharge=async()=>{calls++;return {requires3DS:false,charge:incomplete};};
    const r=await coordinateCulqiCharge({...base,db,createCharge,fetchCharge});
    assert.equal(r.paymentStatus,'reconciliation_required');assert.equal(db.row.state,'uncertain');
    assert.equal(db.row.chargeId,incomplete.id);assert.equal(db.confirmations.length,0);
    await coordinateCulqiCharge({...base,db,createCharge,fetchCharge});assert.equal(calls,1);
  }
});
test('20 concurrent requests settle one charge, later retries read paid without another charge',async()=>{
  const db=database();let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const createCharge=async()=>{calls++;await gate;return result();};
  const pending=Array.from({length:20},()=>coordinateCulqiCharge({...base,db,createCharge}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();
  const responses=await Promise.all(pending);
  assert.equal(responses.filter(r=>r.paymentStatus==='paid').length,1);
  assert.ok(responses.every(r=>['paid','awaiting_webhook'].includes(r.paymentStatus)));
  assert.equal(db.confirmations.length,1);
  await coordinateCulqiCharge({...base,db,createCharge});assert.equal(calls,1);
});
test('missing settlement RPC or storage failure leaves claim closed and never charges twice',async()=>{
  for(const failing of ['finish_culqi_charge','confirm_culqi_charge_result']){
    const db=database(),original=db.rpc;let calls=0;
    db.rpc=(name,args)=>name===failing?Promise.resolve({data:null,error:{message:'missing/unavailable RPC'}}):original(name,args);
    const createCharge=async()=>{calls++;return result();};
    assert.equal((await coordinateCulqiCharge({...base,db,createCharge})).paymentStatus,'reconciliation_required');
    await coordinateCulqiCharge({...base,db,createCharge});assert.equal(calls,1);
  }
});
test('lost confirmation reply after commit recovers persisted paid state without recharging',async()=>{
  const db=database(),original=db.rpc;let calls=0;
  db.rpc=async(name,args)=>{const response=await original(name,args);if(name==='confirm_culqi_charge_result')throw new Error('reply lost');return response;};
  const createCharge=async()=>{calls++;return result();};
  assert.equal((await coordinateCulqiCharge({...base,db,createCharge})).paymentStatus,'reconciliation_required');
  assert.equal((await coordinateCulqiCharge({...base,db,createCharge})).paymentStatus,'paid');
  assert.equal(calls,1);assert.equal(db.confirmations.length,1);
});
test('late captured payment stays in review instead of presenting fulfillment',async()=>{
  const db=database({late:true});
  assert.equal((await coordinateCulqiCharge({...base,db,createCharge:async()=>result()})).paymentStatus,'reconciliation_required');
  assert.equal(db.row.paid,true);
});
test('malformed settlement responses fail closed',async()=>{
  for(const data of [null,{}, {paymentState:'paid'}, {paymentState:'paid',requiresReview:false,orderState:'cancelled'}]){
    const db=database(),original=db.rpc;
    db.rpc=(name,args)=>name==='confirm_culqi_charge_result'?Promise.resolve({data,error:null}):original(name,args);
    assert.equal((await coordinateCulqiCharge({...base,db,createCharge:async()=>result()})).paymentStatus,'reconciliation_required');
  }
});

test('a lost or failed adverse persistence reply never downgrades the repeated observation to generic uncertainty',async()=>{
  for(const [change,reason] of [[{amount_refunded:1},'refund_observed'],[{dispute:true},'dispute_observed'],
    [{current_amount:6799},'current_amount_mismatch']]) for(const failure of ['throw','error']){
    const db=database(),original=db.rpc,finishes=[];
    db.rpc=async(name,args)=>{
      if(name==='finish_culqi_charge'){
        finishes.push(args);
        if(finishes.length===1){
          if(failure==='throw')throw new Error('local persistence transport failed');
          return {data:null,error:{message:'local persistence rejected'}};
        }
      }
      return original(name,args);
    };
    const r=await coordinateCulqiCharge({...base,db,createCharge:async()=>result(change)});
    assert.equal(r.paymentStatus,'reconciliation_required');assert.equal(finishes.length,2);
    for(const finish of finishes){assert.equal(finish.p_payload.reason,reason);assert.equal(finish.p_charge_id,captured().id);}
    assert.equal(db.row.state,'uncertain');assert.equal(db.confirmations.length,0);
  }
});
