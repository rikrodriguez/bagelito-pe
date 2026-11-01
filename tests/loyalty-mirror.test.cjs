const nodeTest = require('node:test')
const test = (name, run) => nodeTest(name, {timeout:10000}, run)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {createLoyaltyService} = require('./support/load-loyalty.cjs')
const {createStore} = require('./support/loyalty-sqlite-store.cjs')
const {createLoyaltyMirror} = require('./support/load-loyalty-mirror.cjs')
const {createMirrorStore} = require('./support/loyalty-mirror-sqlite-store.cjs')
const {createFakeMirrorTransport} = require('./support/fake-loyalty-mirror-transport.cjs')

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-mirror-'))
  const backend = createStore(path.join(dir, 'backend.sqlite'))
  backend.seedSubject('a', 'session-a'); backend.seedSubject('b', 'session-b')
  const store = createMirrorStore(backend)
  store.bind('a', 'fake-contact-a'); store.bind('b', 'fake-contact-b')
  const receiver = createFakeMirrorTransport(path.join(dir, 'FAKE-destination.sqlite'))
  receiver.bind('a', 'fake-contact-a'); receiver.bind('b', 'fake-contact-b')
  const mirror = createLoyaltyMirror(store, receiver)
  const service = createLoyaltyService(backend)
  t.after(() => {receiver.close(); backend.close(); fs.rmSync(dir, {recursive: true, force: true})})
  return {dir, backend, store, receiver, mirror, service}
}
async function credit(fixture, count = 1, subjectId = 'a', prefix = 'order') {
  for (let i = 1; i <= count; i++) {
    const orderId = prefix + i
    fixture.backend.seedOrder({orderId, subjectId, paymentState: 'paid', verifiedSource: 'backend-confirmed', verificationId: 'fake-verification-' + orderId, requiresReview: false})
    await fixture.service.creditPaidOrder(orderId)
  }
}
function ledgerDump(backend) {
  return ['loyalty_credits', 'loyalty_entitlements', 'loyalty_redemptions'].map(table => backend.db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all().map(row => ({...row})))
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

// Real core+transactions/outbox; only the external receiver is an explicit local FAKE.
test('capture reads actual backend and delivers aggregates without payment or redemption identifiers', async t => {
  const f = setup(t)
  await credit(f, 10)
  const before = ledgerDump(f.backend)
  assert.equal((await f.mirror.capture('a')).status, 'captured')
  const projection = f.store.get('a')
  assert.equal(projection.pending, true)
  assert.equal(projection.envelope.revision, 1)
  assert.deepEqual(projection.envelope.summary, {
    creditedOrders: 10, ordersInCurrentCycle: 0, ordersUntilNextReward: 10,
    earnedRewards: 1, unredeemedRewards: 1, requiresReview: false,
    rule: {id: 'paid-orders-10-v1', orders: 10, bagels: 2, schmears: 1},
  })
  assert.equal((await f.mirror.deliver('a')).status, 'delivered')
  assert.equal(f.store.get('a').pending, false)
  assert.deepEqual(f.receiver.get('a').envelope, projection.envelope)
  assert.equal(f.receiver.get('a').applies, 1)
  assert.deepEqual(ledgerDump(f.backend), before)
  const text = JSON.stringify(projection.envelope)
  for (const privateValue of ['fake-verification-', 'order1', 'session-a', 'entitlementId', 'redemption', 'email', 'phone']) assert.equal(text.includes(privateValue), false, privateValue)
})

test('duplicate and delayed event hints reread current state instead of applying deltas', async t => {
  const f = setup(t)
  await credit(f, 1)
  await f.mirror.capture('a')
  await f.mirror.deliver('a')
  assert.equal((await f.mirror.capture('a')).status, 'unchanged')
  await credit(f, 1, 'a', 'new')
  await f.mirror.capture('a')
  for (let i = 0; i < 8; i++) assert.equal((await f.mirror.capture('a')).status, 'unchanged')
  assert.equal(f.store.get('a').envelope.revision, 2)
  assert.equal(f.store.get('a').envelope.summary.creditedOrders, 2)
  assert.equal(f.store.get('a').pending, true)
  await f.mirror.deliver('a')
  assert.equal(f.receiver.get('a').envelope.summary.creditedOrders, 2)
  assert.equal((await f.mirror.deliver('a')).status, 'no_pending')
  assert.equal(f.receiver.get('a').applies, 2)
})

test('impayments and forged payment objects cannot be supplied as mirror progress', async t => {
  const f = setup(t)
  f.backend.seedOrder({orderId: 'unpaid', subjectId: 'a', paymentState: 'pending', verifiedSource: null, verificationId: null, requiresReview: false})
  await f.mirror.capture('a')
  assert.equal(f.store.get('a').envelope.summary.creditedOrders, 0)
  await rejectsCode(f.mirror.capture({subjectId: 'a', creditedOrders: 100, paid: true}), 'invalid_input')
  assert.equal(f.backend.count('loyalty_credits'), 0)
})

test('mirror capture failure cannot roll back a committed credit and reconciliation discovers missing rows', async t => {
  const f = setup(t)
  await credit(f, 10)
  const before = ledgerDump(f.backend)
  f.store.fault = {at: 'after_projection_write'}
  await assert.rejects(f.mirror.capture('a'), /injected/)
  assert.equal(f.store.get('a'), null)
  assert.deepEqual(ledgerDump(f.backend), before)
  const result = await f.mirror.reconcile()
  assert.ok(result.some(row => row.subjectId === 'a' && row.status === 'captured'))
  assert.equal(f.store.get('a').envelope.summary.creditedOrders, 10)
  assert.equal(f.store.get('b').envelope.summary.creditedOrders, 0)
})

test('lost transport response retries the same durable message after destination applied it', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  const original = f.store.get('a').envelope
  const before = ledgerDump(f.backend)
  f.receiver.fault = {at: 'after_apply'}
  const failure = await f.mirror.deliver('a')
  assert.equal(failure.status, 'retry_pending')
  assert.equal(failure.code, 'transport_failed')
  assert.equal(f.store.get('a').pending, true)
  assert.equal(f.receiver.get('a').applies, 1)
  assert.equal((await f.mirror.deliver('a')).status, 'delivered')
  assert.deepEqual(f.receiver.get('a').envelope, original)
  assert.equal(f.receiver.get('a').applies, 1)
  assert.equal(f.store.get('a').attempts, 2)
  assert.equal(f.store.get('a').pending, false)
  assert.deepEqual(ledgerDump(f.backend), before)
})

function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => {resolve = ok; reject = fail})
  return {promise, resolve, reject}
}

test('a delayed old delivery cannot regress a newer destination revision', async t => {
  const f = setup(t)
  await credit(f, 9)
  await f.mirror.capture('a')
  const entered = deferred(), release = deferred()
  const delayed = createLoyaltyMirror(f.store, {async send(envelope) {
    if (envelope.revision === 1) {entered.resolve(); await release.promise}
    return f.receiver.send(envelope)
  }})
  const old = delayed.deliver('a')
  await Promise.race([entered.promise, old.then(() => {throw new Error('delivery ended before transport barrier')})])
  await credit(f, 1, 'a', 'tenth')
  await f.mirror.capture('a')
  await f.mirror.deliver('a')
  release.resolve()
  assert.equal((await old).code, 'destination_ahead')
  assert.equal(f.receiver.get('a').envelope.revision, 2)
  assert.equal(f.receiver.get('a').envelope.summary.creditedOrders, 10)
  assert.equal(f.receiver.get('a').applies, 1)
  assert.equal(f.store.get('a').pending, false)
  assert.equal(f.store.get('a').lastError, null)
})

test('old acknowledgement cannot clear a newer pending snapshot', async t => {
  const f = setup(t)
  await credit(f, 1)
  await f.mirror.capture('a')
  const entered = deferred(), release = deferred()
  const delayed = createLoyaltyMirror(f.store, {async send(envelope) {
    const receipt = await f.receiver.send(envelope)
    entered.resolve(); await release.promise
    return receipt
  }})
  const old = delayed.deliver('a')
  await Promise.race([entered.promise, old.then(() => {throw new Error('delivery ended before transport barrier')})])
  await credit(f, 1, 'a', 'another')
  await f.mirror.capture('a')
  release.resolve()
  assert.equal((await old).status, 'superseded')
  assert.equal(f.store.get('a').envelope.revision, 2)
  assert.equal(f.store.get('a').pending, true)
  assert.equal(f.store.get('a').attempts, 0)
  await f.mirror.deliver('a')
  assert.equal(f.store.get('a').pending, false)
  assert.equal(f.receiver.get('a').envelope.summary.creditedOrders, 2)
})

test('old transport failure cannot replace metadata of a newer snapshot', async t => {
  const f = setup(t)
  await credit(f, 1)
  await f.mirror.capture('a')
  const entered = deferred(), release = deferred()
  const delayed = createLoyaltyMirror(f.store, {async send() {
    entered.resolve(); await release.promise
    throw new Error('simulated secret should never be stored')
  }})
  const old = delayed.deliver('a')
  await Promise.race([entered.promise, old.then(() => {throw new Error('delivery ended before transport barrier')})])
  await credit(f, 1, 'a', 'new')
  await f.mirror.capture('a')
  release.resolve()
  assert.equal((await old).code, 'transport_failed')
  const row = f.store.get('a')
  assert.equal(row.pending, true)
  assert.equal(row.envelope.revision, 2)
  assert.equal(row.attempts, 0)
  assert.equal(row.lastError, null)
})

for (const patch of [{messageId:'wrong'}, {subjectId:'b'}, {destinationRef:'fake-contact-b'}, {revision:99}, {payloadHash:'0'.repeat(64)}, {status:'unverified'}]) {
  test('receipt mismatch cannot acknowledge or modify loyalty: ' + JSON.stringify(patch), async t => {
    const f = setup(t)
    await credit(f, 10)
    await f.mirror.capture('a')
    const before = ledgerDump(f.backend)
    const bad = createLoyaltyMirror(f.store, {async send(envelope) {
      return {...await f.receiver.send(envelope), ...patch}
    }})
    const result = await bad.deliver('a')
    assert.equal(result.status, 'retry_pending')
    assert.equal(result.code, 'invalid_receipt')
    assert.equal(f.store.get('a').pending, true)
    assert.equal(f.store.get('a').lastError, 'invalid_receipt')
    assert.deepEqual(ledgerDump(f.backend), before)
    await f.mirror.deliver('a')
    assert.equal(f.store.get('a').pending, false)
    assert.equal(f.receiver.get('a').applies, 1)
  })
}

test('backend redemption succeeds while mirror is unavailable, then latest snapshot catches up', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  f.receiver.fault = {at:'before_apply'}
  assert.equal((await f.mirror.deliver('a')).code, 'transport_failed')
  const failed = f.store.get('a')
  assert.equal(failed.lastError, 'transport_failed')
  assert.equal(f.receiver.get('a').applies, 0)
  assert.equal((await f.mirror.capture('a')).status, 'unchanged')
  assert.equal(f.store.get('a').envelope.messageId, failed.envelope.messageId)
  assert.equal(f.store.get('a').lastError, 'transport_failed')
  const reward = (await f.service.getProgress('session-a')).entitlements[0]
  await f.service.redeem('session-a', {entitlementId:reward.id, requestId:'real-core-test-redemption'})
  await rejectsCode(f.service.redeem('session-a', {entitlementId:reward.id, requestId:'another'}), 'reward_already_redeemed')
  const before = ledgerDump(f.backend)
  await f.mirror.reconcile()
  await f.mirror.deliver('a')
  assert.equal(f.receiver.get('a').envelope.summary.unredeemedRewards, 0)
  assert.equal(f.receiver.get('a').envelope.summary.earnedRewards, 1)
  assert.deepEqual(ledgerDump(f.backend), before)
})

test('review flag changes version even when credited/reward counts do not change', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  const first = f.store.get('a').envelope
  f.backend.setOrder('order1', {requiresReview:true})
  await f.mirror.capture('a')
  const second = f.store.get('a').envelope
  assert.equal(second.revision, 2)
  assert.notEqual(second.payloadHash, first.payloadHash)
  assert.equal(second.summary.creditedOrders, 10)
  assert.equal(second.summary.unredeemedRewards, 1)
  assert.equal(second.summary.requiresReview, true)
  await f.mirror.deliver('a')
  const reward = (await f.service.getProgress('session-a')).entitlements[0]
  await rejectsCode(f.service.redeem('session-a', {entitlementId:reward.id, requestId:'blocked'}), 'review_required')
  f.backend.setOrder('order1', {requiresReview:false})
  await f.mirror.capture('a')
  assert.equal(f.store.get('a').envelope.revision, 3)
  assert.equal(f.store.get('a').envelope.summary.requiresReview, false)
})

test('customers stay isolated even with equal revision numbers and concurrent deliveries', async t => {
  const f = setup(t)
  await credit(f, 10)
  await credit(f, 1, 'b', 'customer-b-order')
  await Promise.all([f.mirror.capture('a'), f.mirror.capture('b')])
  const before = ledgerDump(f.backend)
  await Promise.all([f.mirror.deliver('b'), f.mirror.deliver('a')])
  assert.equal(f.receiver.get('a').envelope.subjectId, 'a')
  assert.equal(f.receiver.get('a').envelope.destinationRef, 'fake-contact-a')
  assert.equal(f.receiver.get('a').envelope.summary.creditedOrders, 10)
  assert.equal(f.receiver.get('b').envelope.subjectId, 'b')
  assert.equal(f.receiver.get('b').envelope.destinationRef, 'fake-contact-b')
  assert.equal(f.receiver.get('b').envelope.summary.creditedOrders, 1)
  assert.throws(() => f.store.bind('b', 'fake-contact-a'), /UNIQUE/)
  assert.deepEqual(ledgerDump(f.backend), before)
})

test('destination binding mismatch keeps the right customer pending and never updates another', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  f.receiver.db.prepare('DELETE FROM fake_mirror_bindings WHERE subjectId=?').run('a')
  assert.equal((await f.mirror.deliver('a')).code, 'transport_failed')
  assert.equal(f.store.get('a').pending, true)
  assert.equal(f.receiver.get('a').envelope, null)
  assert.equal(f.receiver.get('b').envelope, null)
  assert.equal((await f.service.getProgress('session-a')).creditedOrders, 10)
})

test('reconciliation includes authoritative subjects without an outbox and isolates unresolved bindings', async t => {
  const f = setup(t)
  f.backend.seedSubject('unmapped', 'unmapped-session')
  const result = await f.mirror.reconcile()
  assert.ok(result.some(row => row.subjectId==='a' && row.status==='captured'))
  assert.ok(result.some(row => row.subjectId==='b' && row.status==='captured'))
  assert.ok(result.some(row => row.subjectId==='unmapped' && row.status==='failed' && row.code==='binding_unavailable'))
  assert.equal(f.store.get('unmapped'), null)
  assert.equal(f.backend.count('loyalty_credits'), 0)
})

test('durable pending message and destination state survive reopening both files', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  const envelope = f.store.get('a').envelope
  f.receiver.fault = {at:'after_apply'}
  await f.mirror.deliver('a')
  f.receiver.close(); f.backend.close()
  const backend = createStore(path.join(f.dir, 'backend.sqlite'))
  const store = createMirrorStore(backend)
  const receiver = createFakeMirrorTransport(path.join(f.dir, 'FAKE-destination.sqlite'))
  t.after(() => {receiver.close(); backend.close()})
  const mirror = createLoyaltyMirror(store, receiver)
  assert.deepEqual(store.get('a').envelope, envelope)
  assert.equal((await mirror.deliver('a')).status, 'delivered')
  assert.equal(receiver.get('a').applies, 1)
  assert.equal(store.get('a').pending, false)
})

test('ack persistence failure preserves pending and replay does not apply twice', async t => {
  const f = setup(t)
  await credit(f, 1)
  await f.mirror.capture('a')
  const before = ledgerDump(f.backend)
  f.store.fault = {at:'after_ack_write'}
  await assert.rejects(f.mirror.deliver('a'), /injected/)
  assert.equal(f.store.get('a').pending, true)
  assert.equal(f.receiver.get('a').applies, 1)
  assert.equal((await f.mirror.deliver('a')).status, 'delivered')
  assert.equal(f.receiver.get('a').applies, 1)
  assert.deepEqual(ledgerDump(f.backend), before)
})

test('independent capture connections deduplicate snapshots under real SQL serialization', async t => {
  const f = setup(t)
  await credit(f, 9)
  const secondBackend = createStore(path.join(f.dir, 'backend.sqlite'))
  const secondStore = createMirrorStore(secondBackend)
  t.after(() => secondBackend.close())
  const second = createLoyaltyMirror(secondStore, f.receiver)
  const results = await Promise.all(Array.from({length:16}, (_, i) => (i%2 ? second : f.mirror).capture('a')))
  assert.equal(results.filter(row => row.status==='captured').length, 1)
  assert.equal(results.filter(row => row.status==='unchanged').length, 15)
  assert.equal(f.store.get('a').envelope.revision, 1)
  assert.equal(f.store.get('a').envelope.summary.creditedOrders, 9)
})

test('capture holds authoritative read and revision in one transaction across a concurrent credit', async t => {
  const f = setup(t)
  await credit(f, 9)
  const secondBackend = createStore(path.join(f.dir, 'backend.sqlite'))
  const secondStore = createMirrorStore(secondBackend)
  const secondService = createLoyaltyService(secondBackend)
  t.after(() => secondBackend.close())
  secondBackend.seedOrder({orderId:'tenth', subjectId:'a', paymentState:'paid', verifiedSource:'backend-confirmed', verificationId:'verified-tenth', requiresReview:false})
  const entered = deferred(), release = deferred()
  const pausedStore = {transaction: work => f.store.transaction(tx => work({...tx, async readProgress(subject) {
    const progress = await tx.readProgress(subject)
    entered.resolve(); await release.promise
    return progress
  }}))}
  const paused = createLoyaltyMirror(pausedStore, f.receiver)
  const capture = paused.capture('a')
  await Promise.race([entered.promise, capture.then(() => {throw new Error('capture ended before read barrier')})])
  let credited = false
  const pendingCredit = secondService.creditPaidOrder('tenth').then(result => {credited=true; return result})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(credited, false, 'credit on the other connection waits for the capture transaction')
  release.resolve()
  await Promise.all([capture, pendingCredit])
  await createLoyaltyMirror(secondStore, f.receiver).capture('a')
  assert.equal(f.store.get('a').envelope.revision, 2)
  assert.equal(f.store.get('a').envelope.summary.creditedOrders, 10)
})

for (const bad of ['', ' ', null, {}, 'x'.repeat(201)]) {
  test('invalid internal subject is rejected before capture/delivery: ' + JSON.stringify(bad), async t => {
    const f = setup(t)
    await rejectsCode(f.mirror.capture(bad), 'invalid_input')
    await rejectsCode(f.mirror.deliver(bad), 'invalid_input')
    assert.equal(f.store.get('a'), null)
    assert.equal(f.receiver.get('a').envelope, null)
  })
}

test('persisted JSON key order does not change the projection or block acknowledgement', async t => {
  const f = setup(t)
  await credit(f, 10)
  await f.mirror.capture('a')
  const original = f.store.get('a').envelope
  const reordered = {...original.summary, rule:{schmears:1, bagels:2, orders:10, id:'paid-orders-10-v1'}}
  f.backend.db.prepare('UPDATE mirror_projection SET summaryJSON=? WHERE subjectId=?').run(JSON.stringify(reordered), 'a')
  assert.equal((await f.mirror.deliver('a')).status, 'delivered')
  assert.deepEqual(f.receiver.get('a').envelope, original)
  assert.equal(f.store.get('a').pending, false)
})
