import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createReviewOnlySqliteDraftStore} from './review-only-sqlite-draft-store.mjs';
import {createReviewOnlyDraftLink,isReviewOnlyDraftLinkCurrent} from './review-only-draft-link.mjs';
import {createDeliveryV2ReviewOnlyAdapter} from './review-only-quote-adapter.mjs';
import {readFileSync} from 'node:fs';

const at=1794606000000;
const dId='draft_qa_12345678';
const dest='dest_qa_12345678';
const snapshot={draftId:dId,revision:4,cartSha256:'a'.repeat(64),destinationId:dest,destinationRevision:9};
const key=Buffer.alloc(32,0x77);
const policy=JSON.parse(readFileSync(new URL('./approved-policy-v2.json',import.meta.url),'utf8'));
const open=()=>{
  const folder=mkdtempSync(join(tmpdir(),'bagelito-cas-'));
  const path=join(folder,'draft-test.sqlite');
  const dbA=new DatabaseSync(path),dbB=new DatabaseSync(path);
  const storeA=createReviewOnlySqliteDraftStore({db:dbA});
  const storeB=createReviewOnlySqliteDraftStore({db:dbB});
  storeA.insertInitialDraft(snapshot);
  return {storeA,storeB,finish(){dbB.close();dbA.close();rmSync(folder,{recursive:true,force:true});}};
};
const proposal=(patch={})=>({draftId:dId,expectedRevision:4,cartSha256:'b'.repeat(64),destinationId:dest,destinationRevision:9,...patch});
const reviewAdapter=createDeliveryV2ReviewOnlyAdapter({
  lookupVerifiedAddress:async()=>({destinationId:dest,addressRevision:9,verificationId:'c'.repeat(64),
    verifiedAtMs:at-1000,district:'Lince',province:'Lima',adjacent:true,sector:null,status:'verified'}),
  measureTrustedRoute:async()=>({destinationId:dest,addressRevision:9,verificationId:'c'.repeat(64),
    measuredAtMs:at-200,roadKm:8,status:'measured'}),approvedPolicy:policy,now:()=>at,
});

test('persistent draft read from second independent SQLite connection is exact and frozen',()=>{
  const s=open();try{
    assert.deepEqual(s.storeB.loadDraft(dId),snapshot);
    assert.equal(Object.isFrozen(s.storeB.loadDraft(dId)),true);
  }finally{s.finish();}
});

test('atomic compare-and-swap succeeds once; stale second writer cannot overwrite or revert',()=>{
  const s=open();try{
    assert.equal(s.storeA.compareAndSetDraft(proposal()),true);
    assert.equal(s.storeB.compareAndSetDraft(proposal({cartSha256:'c'.repeat(64)})),false);
    assert.deepEqual(s.storeB.loadDraft(dId),{...snapshot,revision:5,cartSha256:'b'.repeat(64)});
  }finally{s.finish();}
});

test('a stale revision does not mutate the DB even when destination changes',()=>{
  const s=open();try{
    assert.equal(s.storeB.compareAndSetDraft(proposal({expectedRevision:3,destinationId:'dest_qa_new_12345'})),false);
    assert.deepEqual(s.storeA.loadDraft(dId),snapshot);
  }finally{s.finish();}
});

test('review link issued for persistent snapshot becomes invalid after atomic edit on second connection',async()=>{
  const s=open();try{
    const issue=createReviewOnlyDraftLink({loadDraft:s.storeA.loadDraft,quoteDestination:reviewAdapter,serverKey:key,now:()=>at});
    const output=await issue({draftId:dId});
    assert.equal(output.ready,true);assert.equal(output.payable,false);
    const verify=()=>isReviewOnlyDraftLinkCurrent({link:output.link,loadDraft:s.storeA.loadDraft,serverKey:key,now:()=>at});
    assert.equal(await verify(),true);
    assert.equal(s.storeB.compareAndSetDraft(proposal({destinationId:'dest_qa_changed_12345',destinationRevision:10})),true);
    assert.equal(await verify(),false);
  }finally{s.finish();}
});

test('a draft changed during async route measurement is not issued a signed link',async()=>{
  const s=open();try{
    const issue=createReviewOnlyDraftLink({loadDraft:s.storeA.loadDraft,serverKey:key,now:()=>at,
      quoteDestination:async arg=>{s.storeB.compareAndSetDraft(proposal());return reviewAdapter(arg);}});
    const result=await issue({draftId:dId});
    assert.deepEqual(result,{ready:false,status:'draft_changed',payable:false,quote:null,link:null});
  }finally{s.finish();}
});

test('malformed or client-supplied fee cannot enter SQLite store',()=>{
  const s=open();try{
    assert.throws(()=>s.storeA.compareAndSetDraft(proposal({feeMinor:0})),/CAS/);
    assert.throws(()=>s.storeA.compareAndSetDraft(proposal({payable:true})),/CAS/);
    assert.throws(()=>s.storeA.insertInitialDraft({...snapshot,customerName:'private'}),/snapshot/);
    assert.deepEqual(s.storeB.loadDraft(dId),snapshot);
  }finally{s.finish();}
});

test('missing draft and duplicate bootstrap both fail safe',()=>{
  const s=open();try{
    assert.equal(s.storeA.loadDraft('draft_does_not_exist'),null);
    assert.equal(s.storeA.compareAndSetDraft(proposal({draftId:'draft_does_not_exist'})),false);
    assert.throws(()=>s.storeB.insertInitialDraft(snapshot));
  }finally{s.finish();}
});

test('invalid identities and unbounded revisions are rejected before writing',()=>{
  const s=open();try{
    for(const patch of [{draftId:'x'}, {expectedRevision:0}, {expectedRevision:Number.MAX_SAFE_INTEGER},
      {cartSha256:'not-sha'}, {destinationId:'bad'}, {destinationRevision:0}]) {
      assert.throws(()=>s.storeB.compareAndSetDraft(proposal(patch)),/CAS/);
    }
    assert.deepEqual(s.storeA.loadDraft(dId),snapshot);
  }finally{s.finish();}
});
