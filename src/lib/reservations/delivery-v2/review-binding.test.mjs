import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeliveryV2ReviewBinding, isDeliveryV2ReviewBindingCurrent} from './review-binding.mjs';

const serverKey = Buffer.alloc(32,0x42); // synthetic QA-only key, never for production
const nowMs = 1794393000000;
const draft = {draftId:'draft_qa_123456',revision:7,cartSha256:'a'.repeat(64)};
const candidate = {tier:'regular',feeMinor:1000,status:'candidate_only',
  tariffVersion:'bagelito.delivery-tiers.2026-11-06.v2',payable:false};
const issue = (overrides={})=>createDeliveryV2ReviewBinding({draft,candidate,serverKey,nowMs,...overrides});
const check = (binding, overrides={})=>isDeliveryV2ReviewBindingCurrent({binding,draft,serverKey,nowMs,...overrides});

test('issues a frozen, nonpayable envelope with no private destination or customer data',()=>{
  const binding=issue();
  assert.equal(check(binding),true);
  assert.equal(binding.payable,false);
  assert.equal(binding.status,'review_only');
  assert.equal(Object.isFrozen(binding),true);
  assert.equal(binding.expiresAtMs-binding.issuedAtMs,900000);
  const serialized=JSON.stringify(binding).toLowerCase();
  for(const privateField of ['address','street','phone','latitude','longitude','customer','origin','sector']) {
    assert.equal(serialized.includes(privateField),false,privateField);
  }
});

test('draft revision, identity and composition hash cannot be substituted',()=>{
  const binding=issue();
  assert.equal(check(binding,{draft:{...draft,revision:8}}),false);
  assert.equal(check(binding,{draft:{...draft,draftId:'draft_qa_654321'}}),false);
  assert.equal(check(binding,{draft:{...draft,cartSha256:'b'.repeat(64)}}),false);
});

test('signature rejects altered fee/tier/status/time and extra browser flags',()=>{
  const binding=issue();
  for(const change of [{feeMinor:800},{tier:'adjacent'},{payable:true},
    {status:'approved'},{expiresAtMs:binding.expiresAtMs+1},{issuedAtMs:binding.issuedAtMs+1},
    {signature:'0'.repeat(64)},{browserVerified:true}]) {
    assert.equal(check({...binding,...change}),false,JSON.stringify(change));
  }
  assert.equal(check(binding,{serverKey:Buffer.alloc(32,0x43)}),false);
});

test('expired and not-yet-issued envelopes fail closed',()=>{
  const binding=issue();
  assert.equal(check(binding,{nowMs:nowMs+899999}),true);
  assert.equal(check(binding,{nowMs:nowMs+900000}),false);
  assert.equal(check(binding,{nowMs:nowMs-1}),false);
});

test('unverified, manual or payable candidates are refused before signing',()=>{
  for(const update of [{status:'verification_required'},{status:'manual_review'},
    {payable:true},{feeMinor:null},{feeMinor:0},{tier:'manual'},
    {tariffVersion:'v1'}]) {
    assert.throws(()=>issue({candidate:{...candidate,...update}}),TypeError);
  }
});

test('invalid server key, order revision, cart digest and timestamps are refused',()=>{
  assert.throws(()=>issue({serverKey:'browser-secret'}),TypeError);
  assert.throws(()=>issue({serverKey:Buffer.alloc(16)}),TypeError);
  assert.throws(()=>issue({draft:{...draft,revision:0}}),TypeError);
  assert.throws(()=>issue({draft:{...draft,cartSha256:'not-a-hash'}}),TypeError);
  assert.throws(()=>issue({nowMs:NaN}),TypeError);
  assert.equal(check(issue(),{draft:{...draft,revision:0}}),false);
});
