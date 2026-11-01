'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {Worker} = require('node:worker_threads')
const {createLoyaltyService, LOYALTY_RULE} = require('./support/load-loyalty.cjs')
const {createStore} = require('./support/loyalty-sqlite-store.cjs')

const workerFile = path.join(__dirname, 'support/loyalty-worker.cjs')
const timeout = 40000

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-loyalty-concurrency-'))
  const dbPath = path.join(dir, 'ledger.sqlite')
  const store = createStore(dbPath)
  const workers = new Set()
  store.seedSubject('customer-a', 'session-a')
  store.seedSubject('customer-b', 'session-b')
  t.after(async () => {
    // Also runs on assertion failures, readiness errors and test timeouts.
    await Promise.allSettled([...workers].map(worker => worker.terminate()))
    store.close()
    fs.rmSync(dir, {recursive: true, force: true})
  })
  return {dbPath, store, workers, service: createLoyaltyService(store)}
}

function seedOrder(store, orderId) {
  store.seedOrder({orderId, subjectId: 'customer-a', paymentState: 'paid',
    verifiedSource: 'backend-confirmed', verificationId: 'verified-' + orderId, requiresReview: false})
  return orderId
}

async function earn(fixture, count) {
  for (let i = 1; i <= count; i++) {
    await fixture.service.creditPaidOrder(seedOrder(fixture.store, 'earned-' + i))
  }
  return fixture.service.getProgress('session-a')
}

async function race(fixture, actionLists) {
  const startGate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const gate = new Int32Array(startGate)
  const records = actionLists.map(actions => {
    const worker = new Worker(workerFile, {workerData: {dbPath: fixture.dbPath, actions, startGate}})
    fixture.workers.add(worker)
    let readyResolve, readyReject, doneResolve, doneReject, readyMessage, resultMessage, fatal
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    const done = new Promise((resolve, reject) => { doneResolve = resolve; doneReject = reject })
    // A startup error must not become an unhandled rejection while the caller
    // awaits every worker's readiness before releasing the shared gate.
    done.catch(() => {})
    const timer = setTimeout(() => {
      const error = new Error('Independent SQLite worker did not become ready within 15 seconds')
      readyReject(error)
      doneReject(error)
    }, 15000)
    worker.on('message', message => {
      if (message.type === 'ready') {
        readyMessage = message
        clearTimeout(timer)
        readyResolve(message)
      } else if (message.type === 'results') resultMessage = message
      else if (message.type === 'fatal') fatal = message.message
    })
    worker.on('error', error => { clearTimeout(timer); readyReject(error); doneReject(error) })
    worker.on('exit', code => {
      clearTimeout(timer)
      fixture.workers.delete(worker)
      if (code !== 0 || !readyMessage || !resultMessage) {
        const error = new Error(fatal || `SQLite worker exited ${code} without completing its actions`)
        readyReject(error)
        doneReject(error)
      } else doneResolve({ready: readyMessage, ...resultMessage})
    })
    return {ready, done}
  })
  const ready = await Promise.all(records.map(record => record.ready))
  assert.equal(new Set(ready.map(message => message.threadId)).size, actionLists.length)
  assert.ok(ready.every(message => message.busyTimeout === 1000), 'Each SQLite connection has a native busy timeout')
  Atomics.store(gate, 0, 1)
  Atomics.notify(gate, 0, actionLists.length)
  const completed = await Promise.all(records.map(record => record.done))
  for (let i = 0; i < completed.length; i++) assert.equal(completed[i].results.length, actionLists[i].length)
  return completed.map(record => record.results)
}

function fulfilled(results) {
  for (const result of results) assert.equal(result.status, 'fulfilled', JSON.stringify(result))
  return results.map(result => result.value)
}

function persistedRedemption(store) {
  return {...store.db.prepare('SELECT * FROM loyalty_redemptions').get()}
}

function assertReward(reward, cycle) {
  assert.equal(reward.cycle, cycle)
  assert.equal(reward.ruleId, LOYALTY_RULE.id)
  assert.equal(reward.bagels, 2)
  assert.equal(reward.schmears, 1)
}

test('four independent SQLite writers deduplicate 80 attempts into 20 credits and two rewards', {timeout}, async t => {
  const fixture = setup(t)
  const ids = Array.from({length: 20}, (_, i) => seedOrder(fixture.store, 'concurrent-' + (i + 1)))
  const orders = [ids, [...ids].reverse(), [...ids.slice(7), ...ids.slice(0, 7)], [...ids.slice(13), ...ids.slice(0, 13)]]
  const results = await race(fixture, orders.map(list => list.map(orderId => ({type: 'credit', orderId}))))
  const values = fulfilled(results.flat())
  assert.equal(values.filter(value => value.status === 'credited').length, 20)
  assert.equal(values.filter(value => value.status === 'already_credited').length, 60)
  for (const orderId of ids) {
    const attempts = orders.map((list, i) => results[i][list.indexOf(orderId)].value)
    assert.equal(attempts.filter(value => value.status === 'credited').length, 1, orderId)
    assert.equal(attempts.filter(value => value.status === 'already_credited').length, 3, orderId)
  }
  assert.equal(fixture.store.count('loyalty_credits'), 20)
  assert.equal(fixture.store.count('loyalty_entitlements'), 2)
  assert.equal(fixture.store.count('loyalty_redemptions'), 0)
  const progress = await fixture.service.getProgress('session-a')
  assert.equal(progress.creditedOrders, 20)
  assert.equal(progress.earnedRewards, 2)
  assert.equal(progress.unredeemedRewards, 2)
  assert.equal(progress.ordersInCurrentCycle, 0)
  assert.equal(progress.ordersUntilNextReward, 10)
  assert.equal(progress.requiresReview, false)
  assert.equal(progress.entitlements.length, 2)
  progress.entitlements.forEach((reward, i) => { assertReward(reward, i + 1); assert.equal(reward.redemption, null) })
  assert.equal((await fixture.service.getProgress('session-b')).creditedOrders, 0)
})

test('independent connections racing the same tenth order create exactly one boundary reward', {timeout}, async t => {
  const fixture = setup(t)
  const before = await earn(fixture, 9)
  assert.equal(before.creditedOrders, 9)
  assert.equal(before.earnedRewards, 0)
  const orderId = seedOrder(fixture.store, 'raced-tenth')
  const lists = Array.from({length: 4}, () => Array.from({length: 4}, () => ({type: 'credit', orderId})))
  const values = fulfilled((await race(fixture, lists)).flat())
  assert.equal(values.filter(value => value.status === 'credited').length, 1)
  assert.equal(values.filter(value => value.status === 'already_credited').length, 15)
  assert.equal(fixture.store.count('loyalty_credits'), 10)
  assert.equal(fixture.store.count('loyalty_entitlements'), 1)
  const progress = await fixture.service.getProgress('session-a')
  assert.equal(progress.creditedOrders, 10)
  assert.equal(progress.earnedRewards, 1)
  assert.equal(progress.unredeemedRewards, 1)
  assert.equal(progress.requiresReview, false)
  assert.equal(progress.entitlements.length, 1)
  assertReward(progress.entitlements[0], 1)
})

test('two redemption requests for one reward have one winner and one already-consumed error', {timeout}, async t => {
  const fixture = setup(t)
  const reward = (await earn(fixture, 10)).entitlements[0]
  const actions = ['request-one', 'request-two'].map(requestId => [{type: 'redeem', context: 'session-a', input: {entitlementId: reward.id, requestId}}])
  const results = (await race(fixture, actions)).flat()
  const winners = results.filter(result => result.status === 'fulfilled')
  const losers = results.filter(result => result.status === 'rejected')
  assert.equal(winners.length, 1)
  assert.equal(losers.length, 1)
  assert.equal(winners[0].value.status, 'redeemed')
  assert.equal(losers[0].reason.code, 'reward_already_redeemed')
  assert.equal(fixture.store.count('loyalty_redemptions'), 1)
  assert.deepEqual(persistedRedemption(fixture.store), winners[0].value.redemption)
  const progress = await fixture.service.getProgress('session-a')
  assert.equal(progress.unredeemedRewards, 0)
  assert.deepEqual(progress.entitlements[0].redemption, winners[0].value.redemption)
})

test('same redemption request racing on separate connections replays the same persisted redemption', {timeout}, async t => {
  const fixture = setup(t)
  const reward = (await earn(fixture, 10)).entitlements[0]
  const input = {entitlementId: reward.id, requestId: 'same-request'}
  const actions = Array.from({length: 2}, () => [{type: 'redeem', context: 'session-a', input}])
  const values = fulfilled((await race(fixture, actions)).flat())
  assert.deepEqual(values.map(value => value.status).sort(), ['already_redeemed', 'redeemed'])
  assert.deepEqual(values[0].redemption, values[1].redemption)
  assert.equal(fixture.store.count('loyalty_redemptions'), 1)
  assert.deepEqual(persistedRedemption(fixture.store), values[0].redemption)
  assert.equal((await fixture.service.getProgress('session-a')).unredeemedRewards, 0)
})

test('wrong-customer competitor cannot consume a reward or poison the legitimate request', {timeout}, async t => {
  const fixture = setup(t)
  const reward = (await earn(fixture, 10)).entitlements[0]
  const input = {entitlementId: reward.id, requestId: 'shared-concurrent-request'}
  const [authorized, unauthorized] = await race(fixture, [
    [{type: 'redeem', context: 'session-a', input}],
    [{type: 'redeem', context: 'session-b', input}],
  ])
  assert.equal(authorized[0].status, 'fulfilled', JSON.stringify(authorized[0]))
  assert.equal(authorized[0].value.status, 'redeemed')
  assert.equal(unauthorized[0].status, 'rejected')
  assert.equal(unauthorized[0].reason.code, 'reward_unavailable')
  assert.equal(fixture.store.count('loyalty_redemptions'), 1)
  assert.deepEqual(persistedRedemption(fixture.store), authorized[0].value.redemption)
  assert.equal(persistedRedemption(fixture.store).subjectId, 'customer-a')
  const a = await fixture.service.getProgress('session-a')
  const b = await fixture.service.getProgress('session-b')
  assert.equal(a.unredeemedRewards, 0)
  assert.equal(b.creditedOrders, 0)
  assert.equal(b.earnedRewards, 0)
  assert.deepEqual(b.entitlements, [])
})
