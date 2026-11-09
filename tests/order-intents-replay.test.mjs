import test from 'node:test';
import assert from 'node:assert/strict';
import { persistValidatedIntent, OrderIntentConflict } from '../src/lib/order-intents/repository.ts';

const id='b7a6c5d4-48ab-4d1e-9c37-7c5f83129060';
const secret='a-qa-only-replay-secret-not-for-production';
const payload=()=>({
 idempotencyKey:'39859d38-68bf-4000-b1f5-2f184dcb3839',
 customerName:'Demo',whatsapp:'987654321',email:'qa@example.test',
 district:'Lince',deliveryAddress:null,notes:'',marketingOptIn:false,
 consentAccepted:true,
 lines:[{sku:'pack-grande-6-un-sabor',quantity:1,flavors:[{flavor:'plain',quantity:6}]}]
});
function store(){
 const rows=[];
 return {rows, db:{
  insert:async row=>{
   if(rows.length)throw Object.assign(new Error('duplicate'),{code:'23505'});
   rows.push({...row,id});return {id};
  },
  findByKey:async key=>{
   const row=rows.find(x=>x.idempotency_key===key);
   return row ? {id,status:row.status,payload_fingerprint:row.payload_fingerprint}:null;
  }
 }};
}
test('new request is nonpayable and awaiting review',async()=>{
 const {db}=store();const r=await persistValidatedIntent(payload(),db,secret);
 assert.equal(r.status,'awaiting_human_review');
 assert.equal(r.checkoutEnabled,false);
 assert.equal(r.paymentStatus,'not_requested');
});
test('replay reflects review progress without creating a second record',async()=>{
 const {db,rows}=store();await persistValidatedIntent(payload(),db,secret);
 rows[0].status='reviewing';
 const replay=await persistValidatedIntent(payload(),db,secret);
 assert.equal(replay.status,'reviewing');
 assert.equal(replay.requestId,id);
 assert.equal(rows.length,1);
});
test('rejected request is never described as new pending review',async()=>{
 const {db,rows}=store();await persistValidatedIntent(payload(),db,secret);
 rows[0].status='rejected';
 const replay=await persistValidatedIntent(payload(),db,secret);
 assert.equal(replay.status,'rejected');
});
test('changed request cannot take over an idempotency key',async()=>{
 const {db}=store();await persistValidatedIntent(payload(),db,secret);
 await assert.rejects(persistValidatedIntent({...payload(),notes:'different'},db,secret),OrderIntentConflict);
});
test('unexpected storage status fails instead of faking a clean response',async()=>{
 const {db,rows}=store();await persistValidatedIntent(payload(),db,secret);
 rows[0].status='unknown_state';
 await assert.rejects(persistValidatedIntent(payload(),db,secret),/Unrecognized persisted review status/);
});
test('simultaneous requests do not multiply rows',async()=>{
 const {db,rows}=store();
 const results=await Promise.all(Array.from({length:12},()=>persistValidatedIntent(payload(),db,secret)));
 assert.equal(rows.length,1);
 assert.equal(new Set(results.map(x=>x.requestId)).size,1);
});
