import test from 'node:test';
import assert from 'node:assert/strict';
import {persistValidatedIntent} from '../src/lib/order-intents/repository.ts';
import {assertReviewTransition} from '../src/lib/order-intents/review-state.ts';

const id='b7a6c5d4-48ab-4d1e-9c37-7c5f83129060';
const secret='qa-integration-fake-secret-not-for-production';
const payload=()=>({
  idempotencyKey:'39859d38-68bf-4000-b1f5-2f184dcb3839',
  customerName:'Demo',whatsapp:'987654321',email:'qa@example.test',
  district:'Lince',deliveryAddress:null,notes:'',marketingOptIn:false,consentAccepted:true,
  lines:[{sku:'pack-grande-6-un-sabor',quantity:1,flavors:[{flavor:'plain',quantity:6}]}]
});
function mockStorage(){
  const rows=[],history=[];
  const db={
    insert:async value=>{
      if(rows.some(r=>r.idempotency_key===value.idempotency_key))
        throw Object.assign(new Error('duplicate'),{code:'23505'});
      rows.push({...structuredClone(value),id});return {id};
    },
    findByKey:async key=>{
      const r=rows.find(x=>x.idempotency_key===key);
      return r?{id:r.id,payload_fingerprint:r.payload_fingerprint,status:r.status}:null;
    }
  };
  const review=async(from,to)=>{
    assertReviewTransition(from,to);
    const r=rows[0];
    if(!r||r.status!==from)throw new Error('Review changed concurrently');
    r.status=to;history.push({from,to});return {id:r.id,status:r.status};
  };
  return {rows,history,db,review};
}
test('create nonpayable request, human starts review, retry preserves progress',async()=>{
  const s=mockStorage();
  const first=await persistValidatedIntent(payload(),s.db,secret);
  assert.equal(first.status,'awaiting_human_review');
  assert.equal(first.paymentStatus,'not_requested');
  assert.equal(first.checkoutEnabled,false);
  await s.review('awaiting_human_review','reviewing');
  const retry=await persistValidatedIntent(payload(),s.db,secret);
  assert.equal(retry.status,'reviewing');
  assert.equal(retry.requestId,first.requestId);
  assert.equal(s.rows.length,1);assert.equal(s.history.length,1);
});
test('approval is follow-up only and never changes payment status',async()=>{
  const s=mockStorage();await persistValidatedIntent(payload(),s.db,secret);
  await s.review('awaiting_human_review','reviewing');
  await s.review('reviewing','approved_for_followup');
  const retry=await persistValidatedIntent(payload(),s.db,secret);
  assert.equal(retry.status,'approved_for_followup');
  assert.equal(retry.checkoutEnabled,false);
  assert.equal(retry.paymentStatus,'not_requested');
  assert.equal(s.rows[0].payment_status,'not_requested');
});
test('stale review status cannot overwrite another human action',async()=>{
  const s=mockStorage();await persistValidatedIntent(payload(),s.db,secret);
  await s.review('awaiting_human_review','reviewing');
  await assert.rejects(s.review('awaiting_human_review','rejected'),/Review changed concurrently/);
  assert.equal(s.history.length,1);
});
test('no state machine path can mark a request paid',async()=>{
  const s=mockStorage();await persistValidatedIntent(payload(),s.db,secret);
  await assert.rejects(s.review('awaiting_human_review','paid'),TypeError);
  assert.equal(s.rows[0].status,'awaiting_human_review');
});
