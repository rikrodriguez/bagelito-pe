import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeliveryV2EvidenceGate} from './destination-evidence-gate.mjs';

const nowMs=1794590000000;
const destinationId='dest_1234567890';
const verificationId='a'.repeat(64);
const address=()=>({destinationId,addressRevision:3,verificationId,verifiedAtMs:nowMs-1000,
  district:'Lince',province:'Lima',adjacent:true,sector:null,status:'verified'});
const route=()=>({destinationId,addressRevision:3,verificationId,measuredAtMs:nowMs-500,roadKm:8.4,status:'measured'});
const gate=(a=address(),r=route(), hooks={})=>createDeliveryV2EvidenceGate({
  lookupVerifiedAddress:async()=>a, measureTrustedRoute:async()=>r, now:()=>nowMs,...hooks});

test('valid paired server evidence returns nonpayable fields only',async()=>{
  const out=await gate()({destinationId});
  assert.deepEqual(out,{ready:true,payable:false,status:'evidence_for_review_only',destination:{
    district:'Lince',province:'Lima',adjacent:true,sector:null,roadKm:8.4}});
  assert.equal(Object.isFrozen(out.destination),true);
});
test('unverified address never calls route callback',async()=>{
  let calls=0;
  const go=gate({...address(),status:'pending'},route(),{
    measureTrustedRoute:async()=>{calls++;return route();}});
  assert.deepEqual(await go({destinationId}),{ready:false,reason:'address_verification_required',payable:false});
  assert.equal(calls,0);
});
test('client-controlled geodata or payable fields rejected before lookup',async()=>{
  let calls=0;
  const go=gate(address(),route(),{lookupVerifiedAddress:async()=>{calls++;return address();}});
  for(const extra of [{feeMinor:0},{roadKm:3},{adjacent:true},{payable:true},{address:'private'}])
    await assert.rejects(go({destinationId,...extra}),/opaque destinationId only/);
  assert.equal(calls,0);
});
test('invalid destination id rejected before lookup',async()=>{
  await assert.rejects(gate()({destinationId:'x'}),/opaque destinationId/);
});
test('address fields added by provider are rejected',async()=>{
  assert.equal((await gate({...address(),feeMinor:800})({destinationId})).ready,false);
});
test('stale, future, or malformed address verification is rejected',async()=>{
  for (const bad of [nowMs-10*60*1000-1,nowMs+1,'now']) {
    assert.equal((await gate({...address(),verifiedAtMs:bad})({destinationId})).ready,false);
  }
});
test('stale route or future route cannot yield a candidate',async()=>{
  for(const bad of [nowMs-10*60*1000-1,nowMs+1]) {
    const out=await gate(address(),{...route(),measuredAtMs:bad})({destinationId});
    assert.equal(out.reason,'route_verification_required');
  }
});
test('route for a different destination or revision is rejected',async()=>{
  for(const bad of [{destinationId:'dest_99999999'},{addressRevision:4},{verificationId:'b'.repeat(64)}]) {
    assert.equal((await gate(address(),{...route(),...bad})({destinationId})).ready,false);
  }
});
test('no route measurement never creates a fee',async()=>{
  const out=await gate(address(),null)({destinationId});
  assert.deepEqual(out,{ready:false,reason:'route_verification_required',payable:false});
});
test('negative, nonfinite or string road distance rejected',async()=>{
  for(const roadKm of [-1,0,NaN,Infinity,'8.4'])
    assert.equal((await gate(address(),{...route(),roadKm})({destinationId})).ready,false);
});
test('provider cannot inject extra price or payment metadata',async()=>{
  assert.equal((await gate(address(),{...route(),checkout_enabled:true})({destinationId})).ready,false);
});
test('measurement receives only sealed identity binding',async()=>{
  let input;
  await gate(address(),route(),{measureTrustedRoute:async x=>{input=x;return route();}})({destinationId});
  assert.deepEqual(input,{destinationId,addressRevision:3,verificationId});
  assert.equal(Object.isFrozen(input),true);
});
test('provider error fails closed rather than producing a payable response',async()=>{
  await assert.rejects(gate(address(),route(),{measureTrustedRoute:async()=>{throw new Error('route unavailable')}})({destinationId}),/route unavailable/);
});
test('server callback and clock injection are mandatory',async()=>{
  assert.throws(()=>createDeliveryV2EvidenceGate({}),/callbacks/);
  await assert.rejects(gate(address(),route(),{now:()=>NaN})({destinationId}),/invalid server clock/);
});
test('provider mutation across await cannot silently change verified revision or district',async()=>{
  const mutable=address();
  const result=await gate(mutable,route(),{measureTrustedRoute:async () => {
    mutable.district='Surco'; mutable.addressRevision=4; return route();
  }})({destinationId});
  assert.equal(result.ready,true);
  assert.equal(result.destination.district,'Lince');
});
test('object destination IDs are rejected without coercion',async()=>{
  await assert.rejects(gate()({destinationId:{toString(){return 'dest_1234567890'}}}),/opaque destinationId/);
});


test('slow route cannot use an address that expired while awaiting its provider',async()=>{
  let clock=nowMs;
  const current=address();
  current.verifiedAtMs=nowMs-10*60*1000+1;
  const go=gate(current,route(),{
    now:()=>clock,
    measureTrustedRoute:async()=>{clock+=2; return {...route(),measuredAtMs:clock};}
  });
  const result=await go({destinationId});
  assert.deepEqual(result,{ready:false,reason:'address_verification_required',payable:false});
});

test('slow address lookup cannot use a proof already expired before route lookup',async()=>{
  let clock=nowMs, routeCalls=0;
  const current={...address(),verifiedAtMs:nowMs-10*60*1000+1};
  const go=gate(current,route(),{
    now:()=>clock,
    lookupVerifiedAddress:async()=>{clock+=2;return current;},
    measureTrustedRoute:async()=>{routeCalls++;return route();}
  });
  const result=await go({destinationId});
  assert.deepEqual(result,{ready:false,reason:'address_verification_required',payable:false});
  assert.equal(routeCalls,0);
});

test('route proof predating the verified address is not authoritative',async()=>{
  const current=address();
  const oldRoute={...route(),measuredAtMs:current.verifiedAtMs-1};
  const result=await gate(current,oldRoute)({destinationId});
  assert.equal(result.ready,false);
  assert.equal(result.reason,'route_verification_required');
});

test('server clock jumping backwards after address lookup fails closed',async()=>{
  let clock=nowMs;
  const go=gate(address(),route(),{now:()=>clock,
    lookupVerifiedAddress:async()=>{clock-=5;return address();}});
  await assert.rejects(go({destinationId}),/nonmonotonic server clock/);
});

test('server clock jumping backwards after route measurement fails closed',async()=>{
  let clock=nowMs;
  const go=gate(address(),route(),{now:()=>clock,
    measureTrustedRoute:async()=>{clock-=5;return route();}});
  await assert.rejects(go({destinationId}),/nonmonotonic server clock/);
});
