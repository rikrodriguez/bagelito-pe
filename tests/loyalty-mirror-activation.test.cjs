const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {createStore} = require('./support/loyalty-sqlite-store.cjs')
const {createLoyaltyService} = require('./support/load-loyalty.cjs')
const {createMirrorStore} = require('./support/loyalty-mirror-sqlite-store.cjs')
const {createLoyaltyMirror} = require('./support/load-loyalty-mirror.cjs')
const {createFakeMirrorTransport} = require('./support/fake-loyalty-mirror-transport.cjs')
const {createActivationStore} = require('./support/loyalty-mirror-activation-store.cjs')
const {assessMirrorActivation, createGuardedMirrorTransport} = require('./support/load-loyalty-mirror-activation.cjs')

const scope = {tenantId:'fixture-tenant-a', subjectId:'a'}
const descriptor = {mode:'local-fixture', tenantId:'fixture-tenant-a', locationId:'fixture-location-a'}
function evidence(proofScope = 'local-fixture') {
  return {status:'verified', scope:proofScope, reference:'synthetic-evidence-NOT-real-identity-or-CAS'}
}
function facts(proofScope = 'local-fixture') {
  return {
    tenant:{tenantId:'fixture-tenant-a', locationId:'fixture-location-a', evidence:evidence(proofScope)},
    binding:{tenantId:'fixture-tenant-a', subjectId:'a', locationId:'fixture-location-a', contactId:'fake-contact-a', evidence:evidence(proofScope)},
    contact:{locationId:'fixture-location-a', contactId:'fake-contact-a', evidence:evidence(proofScope)},
    capability:{locationId:'fixture-location-a', conditionalWrite:'verified', evidence:evidence(proofScope)},
  }
}
function seed(store, data) {
  store.seedTenant('fixture-tenant-a', data.tenant)
  store.seedBinding('fixture-tenant-a', 'a', data.binding)
  store.seedContact('fixture-location-a', 'fake-contact-a', data.contact)
  store.seedCapabilities('fixture-location-a', data.capability)
}
function dump(backend) {
  return ['loyalty_credits','loyalty_entitlements','loyalty_redemptions'].map(table => backend.db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all().map(row=>({...row})))
}
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-activation-'))
  const backend = createStore(path.join(dir, 'backend.sqlite'))
  backend.seedSubject('a','session-a')
  const service = createLoyaltyService(backend)
  for (let i=1;i<=10;i++) {
    backend.seedOrder({orderId:'paid-'+i, subjectId:'a', paymentState:'paid', verifiedSource:'backend-confirmed', verificationId:'fake-payment-'+i, requiresReview:false})
    await service.creditPaidOrder('paid-'+i)
  }
  const mirrorStore = createMirrorStore(backend)
  mirrorStore.bind('a','fake-contact-a')
  const receiver = createFakeMirrorTransport(path.join(dir, 'FAKE-receiver.sqlite'))
  receiver.bind('a','fake-contact-a')
  const store = createActivationStore(backend)
  seed(store, facts())
  const target = {...descriptor, transport:receiver}
  const transport = createGuardedMirrorTransport(store, scope, target)
  const mirror = createLoyaltyMirror(mirrorStore, transport)
  await mirror.capture('a')
  t.after(()=>{receiver.close();backend.close();fs.rmSync(dir,{recursive:true,force:true})})
  return {backend, service, mirrorStore, receiver, store, target, transport, mirror}
}
const rejectsCode = (promise, code) => assert.rejects(promise, error=>error.code===code)

test('fully verified LOCAL fixtures permit only the fake transport and preserve the ledger', async t=>{
  const f=await setup(t), before=dump(f.backend)
  assert.deepEqual(await assessMirrorActivation(f.store, scope, descriptor), {status:'local-fixture-only',code:'local_fixture_only'})
  assert.equal((await f.mirror.deliver('a')).status,'delivered')
  assert.equal(f.receiver.get('a').envelope.summary.creditedOrders,10)
  assert.equal(f.receiver.get('a').envelope.summary.unredeemedRewards,1)
  assert.equal(f.mirrorStore.get('a').pending,false)
  assert.deepEqual(dump(f.backend),before)
})

const blockedFacts = [
  ['tenant missing', d=>{d.tenant=null}, 'tenant_unverified'],
  ['tenant evidence unverified', d=>{d.tenant.evidence.status='unverified'}, 'tenant_unverified'],
  ['tenant location belongs elsewhere', d=>{d.tenant.locationId='fixture-location-b'}, 'tenant_location_mismatch'],
  ['tenant response belongs elsewhere', d=>{d.tenant.tenantId='fixture-tenant-b'}, 'tenant_scope_mismatch'],
  ['binding missing', d=>{d.binding=null}, 'binding_unverified'],
  ['binding inferred by email only', d=>{d.binding.evidence.status='unverified';d.binding.matchedBy='email'}, 'binding_unverified'],
  ['binding revoked', d=>{d.binding.evidence.status='revoked'}, 'binding_unverified'],
  ['binding no evidence reference', d=>{d.binding.evidence.reference=null}, 'binding_unverified'],
  ['binding another tenant', d=>{d.binding.tenantId='fixture-tenant-b'}, 'binding_scope_mismatch'],
  ['binding another subject', d=>{d.binding.subjectId='b'}, 'binding_scope_mismatch'],
  ['binding another location', d=>{d.binding.locationId='fixture-location-b'}, 'binding_scope_mismatch'],
  ['contact observation missing', d=>{d.contact=null}, 'contact_unverified'],
  ['contact observation unverified', d=>{d.contact.evidence.status='unverified'}, 'contact_unverified'],
  ['contact observation wrong contact', d=>{d.contact.contactId='fake-contact-b'}, 'contact_scope_mismatch'],
  ['contact observation wrong location', d=>{d.contact.locationId='fixture-location-b'}, 'contact_scope_mismatch'],
  ['capability missing', d=>{d.capability=null}, 'update_capability_unknown'],
  ['conditional update unknown', d=>{d.capability.conditionalWrite='unknown'}, 'update_capability_unknown'],
  ['conditional update unsupported', d=>{d.capability.conditionalWrite='unsupported'}, 'update_capability_unsupported'],
  ['capability different location', d=>{d.capability.locationId='fixture-location-b'}, 'capability_scope_mismatch'],
  ['capability evidence unverified', d=>{d.capability.evidence.status='unverified'}, 'capability_unverified'],
]
for(const [label,change,code] of blockedFacts) {
  test('blocks without delegate effects: '+label, async t=>{
    const f=await setup(t), data=facts(), before=dump(f.backend)
    change(data);seed(f.store,data)
    assert.deepEqual(await assessMirrorActivation(f.store,scope,descriptor),{status:'blocked',code})
    const envelope=f.mirrorStore.get('a').envelope
    await rejectsCode(f.transport.send(envelope),code)
    assert.equal((await f.mirror.deliver('a')).code,'transport_failed')
    assert.equal(f.receiver.get('a').envelope,null)
    assert.equal(f.receiver.get('a').applies,0)
    assert.equal(f.mirrorStore.get('a').pending,true)
    assert.deepEqual(dump(f.backend),before)
  })
}

for(const [conditionalWrite,code] of [['unknown','update_capability_unknown'],['unsupported','update_capability_unsupported'],['verified','real_adapter_absent']]) {
  test('REMOTE stays blocked with conditional capability '+conditionalWrite, async t=>{
    const f=await setup(t), data=facts('remote'), before=dump(f.backend)
    data.capability.conditionalWrite=conditionalWrite
    seed(f.store,data)
    const remote={...descriptor,mode:'remote',transport:f.receiver} // Extra JS delegate cannot unlock remote mode.
    assert.deepEqual(await assessMirrorActivation(f.store,scope,remote),{status:'blocked',code})
    const guard=createGuardedMirrorTransport(f.store,scope,remote)
    await rejectsCode(guard.send(f.mirrorStore.get('a').envelope),code)
    assert.equal(f.receiver.get('a').applies,0)
    assert.deepEqual(dump(f.backend),before)
  })
}

test('local-fixture capability evidence cannot certify remote conditional writes',async t=>{
  const f=await setup(t), data=facts('remote')
  data.capability.evidence=evidence('local-fixture');seed(f.store,data)
  assert.deepEqual(await assessMirrorActivation(f.store,scope,{...descriptor,mode:'remote'}),{status:'blocked',code:'capability_unverified'})
})

test('API Version and a connector idempotency key do not establish CAS capability',async t=>{
  const f=await setup(t), data=facts('remote')
  data.capability.conditionalWrite='unknown'
  data.capability.apiVersion='v3';data.capability.idempotencyKey='fixture-retry-key'
  seed(f.store,data)
  assert.deepEqual(await assessMirrorActivation(f.store,scope,{...descriptor,mode:'remote'}),{status:'blocked',code:'update_capability_unknown'})
  assert.equal(f.receiver.get('a').applies,0)
})

test('an empty tenant lookup never falls back to another configured tenant or location',async t=>{
  const f=await setup(t)
  f.store.seedTenant('fixture-tenant-a',null)
  f.store.seedTenant('fixture-tenant-b',{tenantId:'fixture-tenant-b',locationId:'fixture-location-b',evidence:evidence()})
  assert.deepEqual(await assessMirrorActivation(f.store,scope,descriptor),{status:'blocked',code:'tenant_unverified'})
  assert.deepEqual(await assessMirrorActivation(f.store,scope,{...descriptor,tenantId:'fixture-tenant-b'}),{status:'blocked',code:'target_tenant_mismatch'})
  await rejectsCode(f.transport.send(f.mirrorStore.get('a').envelope),'tenant_unverified')
  assert.equal(f.receiver.get('a').applies,0)
})

test('facts are rechecked at each send; revocation after construction blocks delivery',async t=>{
  const f=await setup(t), data=facts()
  assert.equal((await assessMirrorActivation(f.store,scope,descriptor)).status,'local-fixture-only')
  data.binding.evidence.status='revoked';seed(f.store,data)
  assert.equal((await f.mirror.deliver('a')).code,'transport_failed')
  assert.equal(f.receiver.get('a').applies,0)
  assert.equal(f.mirrorStore.get('a').pending,true)
  const reward=(await f.service.getProgress('session-a')).entitlements[0]
  assert.equal((await f.service.redeem('session-a',{entitlementId:reward.id,requestId:'core-still-works'})).status,'redeemed')
})

test('a valid binding cannot send another subject or contact envelope',async t=>{
  const f=await setup(t), envelope=f.mirrorStore.get('a').envelope
  await rejectsCode(f.transport.send({...envelope,subjectId:'b'}),'envelope_subject_mismatch')
  await rejectsCode(f.transport.send({...envelope,destinationRef:'fake-contact-b'}),'envelope_contact_mismatch')
  assert.equal(f.receiver.get('a').applies,0)
})

test('constructor snapshots target scope rather than following mutable configuration objects',async t=>{
  const f=await setup(t), mutableScope={...scope}, mutableTarget={...descriptor,transport:f.receiver}
  const guard=createGuardedMirrorTransport(f.store,mutableScope,mutableTarget)
  mutableScope.tenantId='fixture-tenant-b';mutableScope.subjectId='b'
  mutableTarget.mode='remote';mutableTarget.locationId='fixture-location-b'
  const receipt=await guard.send(f.mirrorStore.get('a').envelope)
  assert.equal(receipt.status,'applied')
  assert.equal(f.receiver.get('a').envelope.subjectId,'a')
})
