import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDeliveryV2ReviewOnlyAdapter} from './review-only-quote-adapter.mjs';

const approvedPolicy=JSON.parse(readFileSync(new URL('./approved-policy-v2.json',import.meta.url),'utf8'));
const nowMs=1794590000000;
const destinationId='dest_1234567890';
const verificationId='a'.repeat(64);
const address=(patch={})=>({destinationId,addressRevision:3,verificationId,verifiedAtMs:nowMs-1000,
  district:'Lince',province:'Lima',adjacent:true,sector:null,status:'verified',...patch});
const route=(patch={})=>({destinationId,addressRevision:3,verificationId,measuredAtMs:nowMs-500,roadKm:8.4,status:'measured',...patch});
const make=(a=address(),r=route(),opts={})=>createDeliveryV2ReviewOnlyAdapter({
  lookupVerifiedAddress:async()=>a,measureTrustedRoute:async()=>r,approvedPolicy,now:()=>nowMs,...opts
});
const run=fn=>fn({destinationId});

test('valid Lince proof yields exactly an S/8 nonpayable review candidate',async()=>{
  const out=await run(make());
  assert.equal(out.ready,true);assert.equal(out.status,'review_candidate_only');
  assert.equal(out.payable,false);assert.equal(out.quote.payable,false);
  assert.equal(out.quote.feeMinor,800);assert.equal(out.quote.status,'candidate_only');
  assert.deepEqual(Object.keys(out).sort(),['payable','quote','ready','status']);
  assert.deepEqual(Object.keys(out.quote).sort(),approvedPolicy.public_response_fields.slice().sort());
  assert.equal(Object.isFrozen(out),true);assert.equal(Object.isFrozen(out.quote),true);
});
test('nonadjacent verified 12 km yields review-only S/10',async()=>{
  assert.equal((await run(make(address({adjacent:false}),route({roadKm:12})))).quote.feeMinor,1000);
});
test('over 15 km and over 25 km upgrades apply',async()=>{
  assert.equal((await run(make(address({adjacent:false}),route({roadKm:16})))).quote.feeMinor,1500);
  assert.equal((await run(make(address({adjacent:false}),route({roadKm:26})))).quote.feeMinor,2000);
});
test('over 40 km is manual only and never fixed fee',async()=>{
  const out=await run(make(address(),route({roadKm:40.1})));
  assert.equal(out.ready,false);assert.equal(out.status,'manual_review_required');
  assert.equal(out.quote.feeMinor,null);assert.equal(out.quote.status,'manual_review');
});
test('La Molina unknown sector under 25 km has no price',async()=>{
  const out=await run(make(address({district:'La Molina',adjacent:false}),route()));
  assert.equal(out.ready,false);assert.equal(out.quote.feeMinor,null);
});
test('La Planicie verified sector gives S/20 but remains nonpayable',async()=>{
  const out=await run(make(address({district:'La Molina',adjacent:false,sector:'La Planicie'}),route()));
  assert.equal(out.ready,true);assert.equal(out.quote.feeMinor,2000);assert.equal(out.payable,false);
});
test('non-Lima province cannot yield a fixed fee',async()=>{
  const out=await run(make(address({province:'Callao'})));
  assert.equal(out.ready,false);assert.equal(out.quote.feeMinor,null);
});
test('unverified address prevents route lookup and price',async()=>{
  let count=0;
  const out=await run(make(address({status:'pending'}),route(),{
    measureTrustedRoute:async()=>{count++;return route();}
  }));
  assert.deepEqual(out,{ready:false,status:'verification_required',payable:false,quote:null});
  assert.equal(count,0);
});
test('unmatched route revision fails closed',async()=>{
  const out=await run(make(address(),route({addressRevision:4})));
  assert.deepEqual(out,{ready:false,status:'verification_required',payable:false,quote:null});
});
test('expired address at completion fails closed',async()=>{
  let clock=nowMs;
  const a=address({verifiedAtMs:nowMs-10*60*1000+1});
  const out=await run(make(a,route(),{now:()=>clock,
    measureTrustedRoute:async()=>{clock+=2;return route({measuredAtMs:clock});}}));
  assert.equal(out.ready,false);assert.equal(out.quote,null);
});
test('client price, location or geo metadata rejected BEFORE provider call',async()=>{
  let calls=0;
  const fn=make(address(),route(),{lookupVerifiedAddress:async()=>{calls++;return address();}});
  for(const forbidden of [{destinationId,feeMinor:800},{destinationId,roadKm:2},
    {destinationId,payable:true},{destinationId,district:'Lince'},
    {destinationId,quote:{feeMinor:0}},{feeMinor:800},null,[]]) {
    await assert.rejects(fn(forbidden),/only an opaque destinationId/);
  }
  assert.equal(calls,0);
});
test('invalid opaque destination ID is never coerced',async()=>{
  await assert.rejects(make()({destinationId:'x'}),/opaque destinationId/);
});
test('provider outage yields no leaked error message, fee or private address',async()=>{
  const fn=make(address(),route(),{measureTrustedRoute:async()=>{
    throw Error('SECRET_TOKEN private Calle 123');
  }});
  const out=await run(fn);
  assert.deepEqual(out,{ready:false,status:'evidence_unavailable',payable:false,quote:null});
  assert.equal(JSON.stringify(out).includes('SECRET_TOKEN'),false);
});
test('tampered approved policy cannot yield a candidate',async()=>{
  const forged=structuredClone(approvedPolicy);forged.pricing.adjacent_minor=1;
  const out=await run(make(address(),route(),{approvedPolicy:forged}));
  assert.deepEqual(out,{ready:false,status:'policy_review_required',payable:false,quote:null});
});
test('server callbacks and policy mandatory',()=>{
  assert.throws(()=>createDeliveryV2ReviewOnlyAdapter({approvedPolicy}),/callbacks/);
  assert.throws(()=>createDeliveryV2ReviewOnlyAdapter({lookupVerifiedAddress:async()=>address(),measureTrustedRoute:async()=>route()}),/policy/);
});
test('nested candidate never discloses route, address ID or provider proof',async()=>{
  const text=JSON.stringify(await run(make()));
  for(const secret of ['dest_123','a'.repeat(64),'roadKm','verificationId','addressRevision','privateOrigin','latitude','street'])
    assert.equal(text.includes(secret),false,secret);
});
