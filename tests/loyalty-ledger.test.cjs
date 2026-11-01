const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {createLoyaltyService, LOYALTY_RULE} = require('./support/load-loyalty.cjs')
const {createStore} = require('./support/loyalty-sqlite-store.cjs')

function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-loyalty-'))
  const store = createStore(path.join(dir, 'ledger.sqlite'), options)
  store.seedSubject('customer-a', 'session-a')
  store.seedSubject('customer-b', 'session-b')
  t.after(() => { store.close(); fs.rmSync(dir, {recursive: true, force: true}) })
  return {store, service: createLoyaltyService(store), dbPath: path.join(dir, 'ledger.sqlite')}
}
function order(store, id, changes = {}) {
  store.seedOrder({orderId: id, subjectId: 'customer-a', paymentState: 'paid', verifiedSource: 'backend-confirmed', verificationId: 'verified-' + id, requiresReview: false, ...changes})
  return id
}
async function earn(store, service, count, prefix = 'order') {
  for (let i = 1; i <= count; i++) await service.creditPaidOrder(order(store, prefix + i))
  return service.getProgress('session-a')
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

// These execute the real core with an actual local SQL transaction, not a canned RPC.
test('ten unique backend-confirmed paid orders earn exactly 2 bagels and 1 schmear', async t => {
  const {store, service} = setup(t)
  let progress = await earn(store, service, 9)
  assert.equal(progress.creditedOrders, 9)
  assert.equal(progress.earnedRewards, 0)
  assert.equal(progress.ordersUntilNextReward, 1)
  await service.creditPaidOrder(order(store, 'order10'))
  progress = await service.getProgress('session-a')
  assert.equal(progress.creditedOrders, 10)
  assert.equal(progress.ordersInCurrentCycle, 0)
  assert.equal(progress.ordersUntilNextReward, 10)
  assert.equal(progress.earnedRewards, 1)
  assert.equal(progress.unredeemedRewards, 1)
  assert.equal(progress.requiresReview, false)
  const reward = progress.entitlements[0]
  assert.equal(reward.ruleId, LOYALTY_RULE.id)
  assert.equal(reward.cycle, 1)
  assert.equal(reward.bagels, 2)
  assert.equal(reward.schmears, 1)
  assert.equal(reward.redemption, null)
  assert.equal(store.count('loyalty_credits'), 10)
})

test('twenty orders earn two entitlements, and replay cannot create extra credits/rewards', async t => {
  const {store, service} = setup(t)
  const progress = await earn(store, service, 20)
  assert.deepEqual(progress.entitlements.map(x => x.cycle), [1, 2])
  const result = await service.creditPaidOrder('order10')
  assert.equal(result.status, 'already_credited')
  assert.equal(store.count('loyalty_credits'), 20)
  assert.equal(store.count('loyalty_entitlements'), 2)
  assert.equal((await service.getProgress('session-b')).creditedOrders, 0)
})

for (const state of ['pending', 'failed', 'cancelled', 'expired', 'refunded', 'review']) {
  test('does not credit payment state ' + state, async t => {
    const {store, service} = setup(t)
    await rejectsCode(service.creditPaidOrder(order(store, 'unpaid', {paymentState: state})), 'order_not_verified_paid')
    assert.equal(store.count('loyalty_credits'), 0)
  })
}
for (const source of [null, 'browser', 'ghl', 'unverified-webhook']) {
  test('rejects paid claims from ' + source, async t => {
    const {store, service} = setup(t)
    await rejectsCode(service.creditPaidOrder(order(store, 'untrusted', {verifiedSource: source})), 'order_not_verified_paid')
    assert.equal(store.count('loyalty_credits'), 0)
  })
}
for (const changes of [{verificationId: null}, {verificationId: ''}, {subjectId: null}, {requiresReview: true}]) {
  test('unresolved evidence or identity cannot accrue: ' + JSON.stringify(changes), async t => {
    const {store, service} = setup(t)
    await assert.rejects(service.creditPaidOrder(order(store, 'unresolved', changes)))
    assert.equal(store.count('loyalty_credits'), 0)
    assert.equal(store.count('loyalty_entitlements'), 0)
  })
}

test('missing order and structured browser payment claims cannot produce a credit', async t => {
  const {store, service} = setup(t)
  await rejectsCode(service.creditPaidOrder('missing'), 'order_unavailable')
  await rejectsCode(service.creditPaidOrder({orderId: 'fake', paid: true, subjectId: 'customer-a'}), 'invalid_input')
  assert.equal(store.count('loyalty_credits'), 0)
})

test('retries from both confirmation paths deduplicate by order, not verification/event id', async t => {
  const {store, service} = setup(t)
  await service.creditPaidOrder(order(store, 'same-order'))
  store.setOrder('same-order', {verificationId: 'second-backend-verification'})
  for (let i = 0; i < 12; i++) assert.equal((await service.creditPaidOrder('same-order')).status, 'already_credited')
  assert.equal(store.count('loyalty_credits'), 1)
  assert.equal((await service.getProgress('session-a')).requiresReview, false)
})

test('read and redemption require trusted authentication; browser customer ids do not authorize', async t => {
  const {store, service} = setup(t)
  const reward = (await earn(store, service, 10)).entitlements[0]
  for (const context of [null, undefined, 'customer-a', 'missing-session', {subjectId: 'customer-a'}, {token: 'session-a'}]) {
    await rejectsCode(service.getProgress(context), 'unauthenticated')
    await rejectsCode(service.redeem(context, {entitlementId: reward.id, requestId: 'request'}), 'unauthenticated')
  }
  await rejectsCode(service.redeem('session-b', {entitlementId: reward.id, requestId: 'request'}), 'reward_unavailable')
  assert.deepEqual((await service.getProgress('session-b')).entitlements, [])
  assert.equal(store.count('loyalty_redemptions'), 0)
})

test('redemption consumes one entitlement once and same request safely replays', async t => {
  const {store, service} = setup(t)
  const progress = await earn(store, service, 20)
  const input = {entitlementId: progress.entitlements[0].id, requestId: 'redeem-1'}
  const first = await service.redeem('session-a', input)
  assert.equal(first.status, 'redeemed')
  const replay = await service.redeem('session-a', input)
  assert.equal(replay.status, 'already_redeemed')
  assert.deepEqual(replay.redemption, first.redemption)
  await rejectsCode(service.redeem('session-a', {...input, requestId: 'another'}), 'reward_already_redeemed')
  await rejectsCode(service.redeem('session-a', {...input, entitlementId: progress.entitlements[1].id}), 'idempotency_conflict')
  const after = await service.getProgress('session-a')
  assert.equal(after.unredeemedRewards, 1)
  assert.equal(after.entitlements[0].redemption.id, first.redemption.id)
  assert.equal(store.count('loyalty_redemptions'), 1)
})

test('redemption idempotency keys are scoped to authenticated subjects', async t => {
  const {store, service} = setup(t)
  const a = (await earn(store, service, 10)).entitlements[0]
  for (let i = 1; i <= 10; i++) await service.creditPaidOrder(order(store, 'b' + i, {subjectId: 'customer-b'}))
  const b = (await service.getProgress('session-b')).entitlements[0]
  await service.redeem('session-a', {entitlementId: a.id, requestId: 'shared-key'})
  await service.redeem('session-b', {entitlementId: b.id, requestId: 'shared-key'})
  assert.equal(store.count('loyalty_redemptions'), 2)
})

for (const changes of [{paymentState: 'refunded'}, {requiresReview: true}, {verifiedSource: 'ghl'}, {subjectId: 'customer-b'}]) {
  test('changed authoritative evidence holds redemption for review without inventing reversal: ' + JSON.stringify(changes), async t => {
    const {store, service} = setup(t)
    const reward = (await earn(store, service, 10)).entitlements[0]
    store.setOrder('order1', changes)
    const progress = await service.getProgress('session-a')
    assert.equal(progress.requiresReview, true)
    assert.equal(progress.creditedOrders, 10)
    assert.equal(progress.earnedRewards, 1)
    assert.equal(progress.unredeemedRewards, 1)
    await rejectsCode(service.redeem('session-a', {entitlementId: reward.id, requestId: 'held'}), 'review_required')
    await assert.rejects(service.creditPaidOrder('order1'))
    assert.equal(store.count('loyalty_redemptions'), 0)
    assert.equal(store.count('loyalty_credits'), 10)
  })
}

test('an acknowledged redemption can be replayed after evidence becomes unresolved without another consumption', async t => {
  const {store, service} = setup(t)
  const reward = (await earn(store, service, 10)).entitlements[0]
  const input = {entitlementId: reward.id, requestId: 'already-committed'}
  const first = await service.redeem('session-a', input)
  store.setOrder('order1', {requiresReview: true})
  assert.deepEqual((await service.redeem('session-a', input)).redemption, first.redemption)
  assert.equal((await service.getProgress('session-a')).requiresReview, true)
  assert.equal(store.count('loyalty_redemptions'), 1)
})

for (const value of ['', ' ', 'x'.repeat(201), null, 17, {}]) {
  test('invalid identifiers fail closed without writes: ' + JSON.stringify(value), async t => {
    const {store, service} = setup(t)
    await rejectsCode(service.creditPaidOrder(value), 'invalid_input')
    await rejectsCode(service.redeem('session-a', {entitlementId: value, requestId: 'x'}), 'invalid_input')
    await rejectsCode(service.redeem('session-a', {entitlementId: 'x', requestId: value}), 'invalid_input')
    assert.equal(store.count('loyalty_credits'), 0)
    assert.equal(store.count('loyalty_redemptions'), 0)
  })
}

for (const stage of ['after_credit', 'after_entitlement', 'before_commit']) {
  test('credit/reward rollback is atomic on failure ' + stage, async t => {
    const {store, service} = setup(t)
    await earn(store, service, 9)
    store.fault = {at: stage}
    const id = order(store, 'tenth')
    await assert.rejects(service.creditPaidOrder(id), /injected/)
    assert.equal(store.count('loyalty_credits'), 9)
    assert.equal(store.count('loyalty_entitlements'), 0)
    await service.creditPaidOrder(id)
    assert.equal(store.count('loyalty_credits'), 10)
    assert.equal(store.count('loyalty_entitlements'), 1)
  })
}

test('commit followed by lost credit response survives reopen and safely replays', async t => {
  const {store, service, dbPath} = setup(t)
  await earn(store, service, 9)
  order(store, 'lost-tenth')
  store.fault = {at: 'after_commit'}
  await assert.rejects(service.creditPaidOrder('lost-tenth'), /injected/)
  assert.equal(store.count('loyalty_credits'), 10)
  const reopened = createStore(dbPath)
  t.after(() => reopened.close())
  const second = createLoyaltyService(reopened)
  assert.equal((await second.creditPaidOrder('lost-tenth')).status, 'already_credited')
  assert.equal((await second.getProgress('session-a')).earnedRewards, 1)
})

for (const stage of ['after_redemption', 'before_commit', 'after_commit']) {
  test('redemption retry after ' + stage + ' cannot double consume', async t => {
    const {store, service, dbPath} = setup(t)
    const reward = (await earn(store, service, 10)).entitlements[0]
    const input = {entitlementId: reward.id, requestId: 'lost-redemption'}
    store.fault = {at: stage}
    await assert.rejects(service.redeem('session-a', input), /injected/)
    assert.equal(store.count('loyalty_redemptions'), stage === 'after_commit' ? 1 : 0)
    const reopened = createStore(dbPath)
    t.after(() => reopened.close())
    const result = await createLoyaltyService(reopened).redeem('session-a', input)
    assert.equal(result.status, stage === 'after_commit' ? 'already_redeemed' : 'redeemed')
    assert.equal(store.count('loyalty_redemptions'), 1)
  })
}

test('same-connection concurrent retries preserve the tenth-order boundary', async t => {
  const {store, service} = setup(t)
  await earn(store, service, 9)
  order(store, 'raced-tenth')
  const results = await Promise.all(Array.from({length: 16}, () => service.creditPaidOrder('raced-tenth')))
  assert.equal(results.filter(x => x.status === 'credited').length, 1)
  assert.equal(store.count('loyalty_credits'), 10)
  assert.equal(store.count('loyalty_entitlements'), 1)
})

test('redemption snapshots validated input before asynchronous transaction scheduling', async t => {
  const {store, service} = setup(t)
  const progress = await earn(store, service, 20)
  const original = {entitlementId: progress.entitlements[0].id, requestId: 'original'}
  const input = {...original}
  const pending = service.redeem('session-a', input)
  input.entitlementId = progress.entitlements[1].id
  input.requestId = 'changed'
  const result = await pending
  assert.equal(result.redemption.entitlementId, original.entitlementId)
  assert.equal(result.redemption.requestId, original.requestId)
})

test('unresolved earlier evidence blocks new credit without deleting earned history', async t => {
  const {store, service} = setup(t)
  await earn(store, service, 10)
  store.setOrder('order1', {requiresReview: true})
  await rejectsCode(service.creditPaidOrder(order(store, 'new-paid')), 'review_required')
  assert.equal(store.count('loyalty_credits'), 10)
  assert.equal(store.count('loyalty_entitlements'), 1)
})

test('database constraints independently reject duplicate credits, cycles, requests and cross-owner consumption', async t => {
  const {store, service} = setup(t)
  const progress = await earn(store, service, 20)
  const [a, b] = progress.entitlements
  assert.throws(() => store.db.prepare('INSERT INTO loyalty_credits SELECT * FROM loyalty_credits WHERE orderId = ?').run('order1'), /UNIQUE/)
  assert.throws(() => store.db.prepare('INSERT INTO loyalty_entitlements (id, subjectId, cycle, ruleId, bagels, schmears, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run('duplicate-cycle', 'customer-a', 1, LOYALTY_RULE.id, 2, 1, 'test'), /UNIQUE/)
  assert.throws(() => store.db.prepare('INSERT INTO loyalty_redemptions VALUES (?, ?, ?, ?, ?)').run('wrong-owner', 'customer-b', a.id, 'key', 'test'), /FOREIGN KEY/)
  await service.redeem('session-a', {entitlementId: a.id, requestId: 'key'})
  assert.throws(() => store.db.prepare('INSERT INTO loyalty_redemptions VALUES (?, ?, ?, ?, ?)').run('duplicate-reward', 'customer-a', a.id, 'another', 'test'), /UNIQUE/)
  assert.throws(() => store.db.prepare('INSERT INTO loyalty_redemptions VALUES (?, ?, ?, ?, ?)').run('duplicate-key', 'customer-a', b.id, 'key', 'test'), /UNIQUE/)
  assert.equal(store.count('loyalty_credits'), 20)
  assert.equal(store.count('loyalty_entitlements'), 2)
  assert.equal(store.count('loyalty_redemptions'), 1)
})

test('corrupt reward data fails closed rather than silently granting a different reward', async t => {
  const {store, service} = setup(t)
  const reward = (await earn(store, service, 10)).entitlements[0]
  store.db.prepare('UPDATE loyalty_entitlements SET bagels = 3 WHERE id = ?').run(reward.id)
  await rejectsCode(service.getProgress('session-a'), 'ledger_integrity_error')
  await rejectsCode(service.redeem('session-a', {entitlementId: reward.id, requestId: 'corrupt'}), 'ledger_integrity_error')
  assert.equal(store.count('loyalty_redemptions'), 0)
})
