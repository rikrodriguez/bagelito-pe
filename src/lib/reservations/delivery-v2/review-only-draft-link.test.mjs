import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReviewOnlyDraftLink,isReviewOnlyDraftLinkCurrent} from './review-only-draft-link.mjs';
import {createDeliveryV2ReviewOnlyAdapter} from './review-only-quote-adapter.mjs';

const at=1794606000000;
const serverKey=Buffer.alloc(32,0x69); // synthetic QA-only, never used for production
const dId='draft_qa_12345678';
const dest='dest_qa_12345678';
const approvedPolicy=JSON.parse(readFileSync(new URL('./approved-policy-v2.json',import.meta.url),'utf8'));
const persisted={draftId:dId,revision:4,cartSha256:'a'.repeat(64),destinationId:dest,destinationRevision:9};
const address=()=>({destinationId:dest,addressRevision:9,verificationId:'c'.repeat(64),
  verifiedAtMs:at-1000,district:'Lince',province:'Lima',adjacent:true,sector:null,status:'verified'});
const route=()=>({destinationId:dest,addressRevision:9,verificationId:'c'.repeat(64),
  measuredAtMs:at-200,roadKm:8,status:'measured'});
const realAdapter=createDeliveryV2ReviewOnlyAdapter({
  lookupVerifiedAddress:async()=>address(),measureTrustedRoute:async()=>route(),approvedPolicy,now:()=>at
});
const make=(overrides={})=>createReviewOnlyDraftLink({
  loadDraft:async()=>persisted,quoteDestination:realAdapter,serverKey,now:()=>at,...overrides
});
const issue=(fn=make())=>fn({draftId:dId});
const verify=(link,overrides={})=>isReviewOnlyDraftLinkCurrent({
  link,loadDraft:async()=>persisted,serverKey,now:()=>at,...overrides
});

test('joins real offline evidence adapter, persisted draft snapshot and nonpayable signed review link',async()=>{
  const out=await issue();
  assert.equal(out.ready,true);assert.equal(out.payable,false);
  assert.equal(out.status,'review_only');assert.equal(out.quote.feeMinor,800);
  assert.equal(out.link.payable,false);assert.equal(out.link.status,'review_only');
  assert.equal(out.link.draftRevision,4);assert.equal(out.link.cartSha256,'a'.repeat(64));
  assert.equal(out.link.feeMinor,800);assert.equal(await verify(out.link),true);
  assert.equal(Object.isFrozen(out),true);assert.equal(Object.isFrozen(out.quote),true);
  assert.equal(Object.isFrozen(out.link),true);
});

test('only opaque draft id reaches server callbacks, never browser fees or destination metadata',async()=>{
  let calls=0;const fn=make({loadDraft:async()=>{calls++;return persisted;}});
  for(const bad of [null,[],{}, {draftId:'x'}, {draftId:dId,feeMinor:1},
    {draftId:dId,destinationId:dest},{draftId:dId,cartSha256:'0'.repeat(64)},
    {draftId:dId,payable:true}]) await assert.rejects(fn(bad),/only opaque draftId/);
  assert.equal(calls,0);
});

test('re-reads after async route calculation and refuses a changed cart revision',async()=>{
  const mutable={...persisted};let calls=0;
  const fn=make({loadDraft:async()=>{calls++;return {...mutable};},
    quoteDestination:async args=>{mutable.revision++;return realAdapter(args);}});
  const out=await issue(fn);
  assert.deepEqual(out,{ready:false,status:'draft_changed',payable:false,quote:null,link:null});
  assert.equal(calls,2);
});

test('destination revision change with unchanged cart digest is detected before issuing link',async()=>{
  const mutable={...persisted};
  const fn=make({loadDraft:async()=>({...mutable}),quoteDestination:async args=>{
    mutable.destinationRevision++;return realAdapter(args);
  }});
  assert.equal((await issue(fn)).status,'draft_changed');
});

test('destination replacement with unchanged cart is detected before issuing link',async()=>{
  const mutable={...persisted};
  const fn=make({loadDraft:async()=>({...mutable}),quoteDestination:async args=>{
    mutable.destinationId='dest_qa_87654321';return realAdapter(args);
  }});
  assert.equal((await issue(fn)).status,'draft_changed');
});

test('post-issuance cart, draft revision or destination revision changes invalidate the signed link',async()=>{
  const {link}=await issue();
  for(const patch of [{revision:5},{cartSha256:'b'.repeat(64)},
    {destinationId:'dest_qa_87654321'},{destinationRevision:10},
    {draftId:'draft_qa_87654321'}]) {
    assert.equal(await verify(link,{loadDraft:async()=>({...persisted,...patch})}),false,JSON.stringify(patch));
  }
});

test('tampering amount, tier, destination fingerprint, paid status, or signature is rejected',async()=>{
  const {link}=await issue();
  for(const patch of [{feeMinor:1},{tier:'regular'},{destinationFingerprint:'0'.repeat(64)},
    {payable:true},{status:'approved'},{signature:'0'.repeat(64)},
    {releaseApproved:true}]) assert.equal(await verify({...link,...patch}),false,JSON.stringify(patch));
  assert.equal(await verify(link,{serverKey:Buffer.alloc(32,0x70)}),false);
});

test('expiration at 15 minutes, future issuance, and clock reversal fail closed',async()=>{
  const {link}=await issue();
  assert.equal(await verify(link,{now:()=>at+900000-1}),true);
  assert.equal(await verify(link,{now:()=>at+900000}),false);
  assert.equal(await verify(link,{now:()=>at-1}),false);
  let counter=0;
  assert.equal(await verify(link,{now:()=>{counter++;return counter===1?at:at-1;}}),false);
});

test('unavailable server draft and invalid snapshots produce no candidate',async()=>{
  assert.equal((await issue(make({loadDraft:async()=>{throw Error('DB_SECRET');}}))).status,'draft_unavailable');
  assert.equal((await issue(make({loadDraft:async()=>({...persisted,revision:0})}))).status,'draft_unavailable');
  assert.equal((await issue(make({loadDraft:async()=>({...persisted,secret:'private'})}))).status,'draft_unavailable');
  assert.equal((await issue(make({loadDraft:async()=>({...persisted,draftId:'wrong_draft_99'})}))).status,'draft_unavailable');
});

test('provider failure returns opaque nonpayable result with no secrets or PII',async()=>{
  const result=await issue(make({quoteDestination:async()=>{throw Error('TOKEN private Calle 123');}}));
  assert.deepEqual(result,{ready:false,status:'verification_unavailable',payable:false,quote:null,link:null});
  assert.equal(JSON.stringify(result).includes('TOKEN'),false);
});

test('manual-review, forged payable quotes, and unsupported tariffs never sign',async()=>{
  for(const output of [
    {ready:false,status:'manual_review_required',payable:false,quote:null},
    {ready:true,status:'review_candidate_only',payable:true,quote:{feeMinor:800}},
    {ready:true,status:'review_candidate_only',payable:false,quote:{...((await issue()).quote),feeMinor:1}},
    {ready:true,status:'review_candidate_only',payable:false,quote:{...((await issue()).quote),extra:1}},
  ]){
    const result=await issue(make({quoteDestination:async()=>output}));
    assert.equal(result.ready,false);assert.equal(result.link,null);
  }
});

test('signed review link exposes neither raw destination ID nor address, verification or provider token',async()=>{
  const output=JSON.stringify(await issue());
  for(const p of [dest,'verificationId','roadKm','addressRevision','latitude','Calle 123',
    'providerToken','privateOrigin']) assert.equal(output.includes(p),false,p);
});

test('post-issuance draft loader errors fail closed and never throw contents to caller',async()=>{
  const {link}=await issue();
  assert.equal(await verify(link,{loadDraft:async()=>{throw Error('PRIVATE');}}),false);
});

test('signing key and callbacks must be server-only and valid',()=>{
  assert.throws(()=>createReviewOnlyDraftLink({serverKey:'browser',loadDraft:async()=>{},quoteDestination:async()=>{}}),/HMAC key/);
  assert.throws(()=>createReviewOnlyDraftLink({serverKey,loadDraft:async()=>{}}),/callback/);
});
