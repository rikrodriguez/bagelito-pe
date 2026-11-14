import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createReviewOnlyOwnedDraftStore} from './review-only-owned-draft-store.mjs';
import {createReviewOnlyDraftLink,isReviewOnlyDraftLinkCurrent} from './review-only-draft-link.mjs';

const tenantA='tenant_bagelito_1234', tenantB='tenant_other_1234567';
const ownerA='owner_customer_a123', ownerB='owner_customer_b123';
const draftId='draft_same_id_12345', dest='destination_12345';
const base={draftId,revision:4,cartSha256:'a'.repeat(64),destinationId:dest,destinationRevision:2};
const change=(patch={})=>({draftId,expectedRevision:4,cartSha256:'b'.repeat(64),destinationId:dest,destinationRevision:2,...patch});
const timestamp=1794606000000;
const quoteFixture=()=>({ready:true,status:'review_candidate_only',payable:false,quote:{district:'Lince',province:'Lima',feeMinor:800,tier:'adjacent',status:'candidate_only',payable:false,tariffVersion:'bagelito.delivery-tiers.2026-11-06.v2'}});
function fixture() {
  const folder=mkdtempSync(join(tmpdir(),'bagelito-owned-'));
  const path=join(folder,'owned.sqlite');
  const dbA=new DatabaseSync(path),dbB=new DatabaseSync(path);
  let pA={tenantId:tenantA,ownerId:ownerA},pB={tenantId:tenantA,ownerId:ownerA};
  const a=createReviewOnlyOwnedDraftStore({db:dbA,getTrustedPrincipal:()=>pA});
  const b=createReviewOnlyOwnedDraftStore({db:dbB,getTrustedPrincipal:()=>pB});
  return {a,b,setA:p=>{pA=p},setB:p=>{pB=p},finish(){dbB.close();dbA.close();rmSync(folder,{recursive:true,force:true})}};
}
test('separate connections read the same persistent and frozen owner-scoped draft',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);assert.deepEqual(f.b.loadDraft(draftId),base);
    assert.ok(Object.isFrozen(f.b.loadDraft(draftId)));}finally{f.finish()}
});
test('different owners under one tenant cannot read or change one another\'s draft',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    f.setB({tenantId:tenantA,ownerId:ownerB});
    assert.equal(f.b.loadDraft(draftId),null);
    assert.equal(f.b.compareAndSetDraft(change()),false);
    f.setB({tenantId:tenantA,ownerId:ownerA});assert.deepEqual(f.b.loadDraft(draftId),base);
  }finally{f.finish()}
});
test('same owner ID in another tenant is isolated from both reads and writes',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    f.setB({tenantId:tenantB,ownerId:ownerA});
    assert.equal(f.b.loadDraft(draftId),null);
    assert.equal(f.b.compareAndSetDraft(change()),false);
    f.setB({tenantId:tenantA,ownerId:ownerA});assert.deepEqual(f.b.loadDraft(draftId),base);
  }finally{f.finish()}
});
test('same draft ID can safely coexist for distinct owner and tenant composite keys',()=>{
  const f=fixture();try{
    f.a.insertInitialDraft(base);
    f.setB({tenantId:tenantB,ownerId:ownerA});
    f.b.insertInitialDraft({...base,cartSha256:'c'.repeat(64)});
    assert.equal(f.b.loadDraft(draftId).cartSha256,'c'.repeat(64));
    assert.equal(f.b.compareAndSetDraft(change()),true);
    assert.deepEqual(f.a.loadDraft(draftId),base);
  }finally{f.finish()}
});
test('CAS remains atomic for competing writers of the same principal',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    assert.equal(f.a.compareAndSetDraft(change()),true);
    assert.equal(f.b.compareAndSetDraft(change({cartSha256:'c'.repeat(64)})),false);
    assert.deepEqual(f.b.loadDraft(draftId),{...base,revision:5,cartSha256:'b'.repeat(64)});
  }finally{f.finish()}
});
test('principal is re-resolved per operation and cannot be cached across a session switch',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    assert.deepEqual(f.a.loadDraft(draftId),base);
    f.setA({tenantId:tenantA,ownerId:ownerB});
    assert.equal(f.a.loadDraft(draftId),null);
    assert.equal(f.a.compareAndSetDraft(change()),false);
  }finally{f.finish()}
});
test('invalid/missing or asynchronous principals fail closed, not as global admin',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    for(const p of [null,{}, {tenantId:tenantA}, {tenantId:tenantA,ownerId:'x'},
      {tenantId:tenantA,ownerId:ownerA,isAdmin:true},Promise.resolve({tenantId:tenantA,ownerId:ownerA})]) {
      f.setB(p);assert.throws(()=>f.b.loadDraft(draftId),/principal/);
      assert.throws(()=>f.b.compareAndSetDraft(change()),/principal/);
    }
  }finally{f.finish()}
});
test('caller-supplied tenant/owner or price metadata cannot enter the table or CAS',()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    for(const patch of [{tenantId:tenantB},{ownerId:ownerB},{payable:true},{feeMinor:0}]) {
      assert.throws(()=>f.a.compareAndSetDraft({...change(),...patch}),/CAS/);
      assert.throws(()=>f.a.insertInitialDraft({...base,...patch}),/snapshot/);
    }
    assert.deepEqual(f.a.loadDraft(draftId),base);
  }finally{f.finish()}
});
test('owner-specific HMAC review link becomes invalid upon authorized atomic edit',async()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    const key=Buffer.alloc(32,0x22);
    const issue=createReviewOnlyDraftLink({
      loadDraft:f.a.loadDraft,serverKey:key,now:()=>timestamp,
      quoteDestination:async()=>quoteFixture()
    });
    const issued=await issue({draftId});
    assert.equal(issued.ready,true);assert.equal(issued.payable,false);
    const verify=()=>isReviewOnlyDraftLinkCurrent({link:issued.link,loadDraft:f.a.loadDraft,serverKey:key,now:()=>timestamp});
    assert.equal(await verify(),true);
    f.setB({tenantId:tenantA,ownerId:ownerB});
    assert.equal(f.b.compareAndSetDraft(change()),false);
    f.setB({tenantId:tenantA,ownerId:ownerA});
    assert.equal(f.b.compareAndSetDraft(change()),true);
    assert.equal(await verify(),false);
  }finally{f.finish()}
});
test('wrong owner cannot validate a signed review link for another owner draft',async()=>{
  const f=fixture();try{f.a.insertInitialDraft(base);
    const key=Buffer.alloc(32,0x33);
    const issue=createReviewOnlyDraftLink({loadDraft:f.a.loadDraft,serverKey:key,now:()=>timestamp,
      quoteDestination:async()=>quoteFixture()});
    const issued=await issue({draftId});assert.equal(issued.ready,true);
    f.setA({tenantId:tenantA,ownerId:ownerB});
    assert.equal(await isReviewOnlyDraftLinkCurrent({link:issued.link,loadDraft:f.a.loadDraft,serverKey:key,now:()=>timestamp}),false);
  }finally{f.finish()}
});

test('bootstrap rejects nonstring digest with a deceptive toString before touching SQLite',()=>{
  const f=fixture();try{
    const deceptive={toString:()=> 'a'.repeat(64)};
    assert.throws(()=>f.a.insertInitialDraft({...base,cartSha256:deceptive}),/snapshot/);
    assert.equal(f.a.loadDraft(draftId),null);
  }finally{f.finish()}
});
