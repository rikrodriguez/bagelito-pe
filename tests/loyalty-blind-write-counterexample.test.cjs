'use strict'

// NOT GHL: an intentionally unsafe, local-only receiver used to demonstrate
// why a client-side GET followed by a blind PUT is not destination-side CAS.
// No HTTP, real customer/contact identifiers or production adapters are used.
const assert = require('node:assert/strict')
const {DatabaseSync} = require('node:sqlite')
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads')

function createBlindReceiver(filename) {
  const db = new DatabaseSync(filename)
  db.exec(`
    PRAGMA busy_timeout = 10000;
    CREATE TABLE IF NOT EXISTS not_ghl_blind_state (
      subjectId TEXT PRIMARY KEY NOT NULL,
      envelopeJSON TEXT NOT NULL CHECK (json_valid(envelopeJSON))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS not_ghl_blind_idempotency (
      messageId TEXT PRIMARY KEY NOT NULL,
      subjectId TEXT NOT NULL,
      revision INTEGER NOT NULL
    ) STRICT;
  `)
  return {
    db,
    read(subjectId) {
      const row = db.prepare('SELECT envelopeJSON FROM not_ghl_blind_state WHERE subjectId = ?').get(subjectId)
      return row ? JSON.parse(row.envelopeJSON) : null
    },
    write(envelope) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const old = db.prepare('SELECT subjectId, revision FROM not_ghl_blind_idempotency WHERE messageId = ?').get(envelope.messageId)
        if (old) {
          assert.equal(old.subjectId, envelope.subjectId)
          assert.equal(old.revision, envelope.revision)
          db.exec('COMMIT')
          return {status: 'duplicate', revision: envelope.revision}
        }
        db.prepare('INSERT INTO not_ghl_blind_idempotency (messageId, subjectId, revision) VALUES (?, ?, ?)')
          .run(envelope.messageId, envelope.subjectId, envelope.revision)
        // Deliberately unsafe: atomic SQL writes and idempotency keys exist,
        // but there is NO revision comparison in the receiving transaction.
        db.prepare(`INSERT INTO not_ghl_blind_state (subjectId, envelopeJSON) VALUES (?, ?)
          ON CONFLICT(subjectId) DO UPDATE SET envelopeJSON = excluded.envelopeJSON`)
          .run(envelope.subjectId, JSON.stringify(envelope))
        db.exec('COMMIT')
        return {status: 'applied', revision: envelope.revision}
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK')
        throw error
      }
    },
    close() { db.close() },
  }
}

if (!isMainThread) {
  const receiver = createBlindReceiver(workerData.filename)
  try {
    const previous = receiver.read(workerData.envelope.subjectId)
    const seenRevision = previous?.revision ?? null
    // Both writers perform this apparently protective GET/check before PUT.
    const eligible = previous === null || previous.revision < workerData.envelope.revision
    parentPort.postMessage({type: 'read', writer: workerData.writer, seenRevision, eligible})
    const gate = new Int32Array(workerData.gate)
    while (Atomics.load(gate, 0) === 0) Atomics.wait(gate, 0, 0)
    const receipt = eligible ? receiver.write(workerData.envelope) : {status: 'client-skipped', revision: workerData.envelope.revision}
    receiver.close()
    parentPort.postMessage({type: 'completed', writer: workerData.writer, receipt})
  } catch (error) {
    try { receiver.close() } catch {}
    parentPort.postMessage({type: 'fatal', error: error.stack || String(error)})
    process.exitCode = 1
  }
} else {
  const test = require('node:test')
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const {createStore} = require('./support/loyalty-sqlite-store.cjs')
  const {createLoyaltyService} = require('./support/load-loyalty.cjs')
  const {createMirrorStore} = require('./support/loyalty-mirror-sqlite-store.cjs')
  const {createLoyaltyMirror} = require('./support/load-loyalty-mirror.cjs')
  const {createFakeMirrorTransport} = require('./support/fake-loyalty-mirror-transport.cjs')

  function launchWriter(filename, envelope, writer, workers) {
    const gateBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const gate = new Int32Array(gateBuffer)
    const worker = new Worker(__filename, {workerData: {filename, envelope, writer, gate: gateBuffer}})
    workers.add(worker)
    let readResolve, readReject, doneResolve, doneReject, completed, fatal
    const read = new Promise((resolve, reject) => {readResolve = resolve; readReject = reject})
    const done = new Promise((resolve, reject) => {doneResolve = resolve; doneReject = reject})
    done.catch(() => {})
    const timer = setTimeout(() => {
      const error = new Error('Local blind-write worker did not reach its read barrier')
      readReject(error); doneReject(error)
    }, 5000)
    worker.on('message', message => {
      if (message.type === 'read') {clearTimeout(timer); readResolve(message)}
      else if (message.type === 'completed') completed = message
      else if (message.type === 'fatal') fatal = message.error
    })
    worker.on('error', error => {clearTimeout(timer); readReject(error); doneReject(error)})
    worker.on('exit', code => {
      clearTimeout(timer)
      workers.delete(worker)
      if (code === 0 && completed) doneResolve(completed)
      else {
        const error = new Error(fatal || `Local blind-write worker exited ${code} without completion`)
        readReject(error); doneReject(error)
      }
    })
    return {read, done, threadId: worker.threadId, release() {Atomics.store(gate, 0, 1); Atomics.notify(gate, 0)}}
  }

  function dumpLedger(backend) {
    return ['loyalty_credits', 'loyalty_entitlements', 'loyalty_redemptions']
      .map(table => backend.db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all().map(row => ({...row})))
  }

  test('NOT GHL: GET-before-blind-PUT regresses revision 2 to 1 despite idempotency; conditional local fake does not', {timeout: 20000}, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-NOT-GHL-blind-write-'))
    const workers = new Set()
    const backend = createStore(path.join(dir, 'authoritative-backend.sqlite'))
    const destinationFile = path.join(dir, 'NOT-GHL-blind-destination.sqlite')
    const receiver = createBlindReceiver(destinationFile)
    const conditional = createFakeMirrorTransport(path.join(dir, 'NOT-GHL-conditional-destination.sqlite'))
    t.after(async () => {
      await Promise.allSettled([...workers].map(worker => worker.terminate()))
      receiver.close(); conditional.close(); backend.close()
      fs.rmSync(dir, {recursive: true, force: true})
    })
    const subjectId = 'synthetic-customer-a', session = 'synthetic-session-a', destinationRef = 'NOT-GHL-synthetic-destination-a'
    backend.seedSubject(subjectId, session)
    const service = createLoyaltyService(backend)
    const mirrorStore = createMirrorStore(backend)
    mirrorStore.bind(subjectId, destinationRef)
    const mirror = createLoyaltyMirror(mirrorStore, {async send(envelope) {return receiver.write(envelope)}})
    async function credit(number) {
      const orderId = 'synthetic-paid-order-' + number
      backend.seedOrder({orderId, subjectId, paymentState: 'paid', verifiedSource: 'backend-confirmed',
        verificationId: 'synthetic-backend-verification-' + number, requiresReview: false})
      await service.creditPaidOrder(orderId)
    }
    for (let i = 1; i <= 9; i++) await credit(i)
    const oldCapture = await mirror.capture(subjectId)
    assert.equal(oldCapture.status, 'captured')
    const older = oldCapture.envelope
    assert.equal(older.revision, 1)
    assert.equal(older.summary.creditedOrders, 9)
    assert.equal(older.summary.earnedRewards, 0)
    await credit(10)
    const newCapture = await mirror.capture(subjectId)
    assert.equal(newCapture.status, 'captured')
    const newer = newCapture.envelope
    assert.equal(newer.revision, 2)
    assert.equal(newer.summary.creditedOrders, 10)
    assert.equal(newer.summary.earnedRewards, 1)
    assert.notEqual(older.messageId, newer.messageId)
    const authoritativeBefore = dumpLedger(backend)
    const projectionBefore = mirrorStore.get(subjectId)

    const trace = []
    const writerA = launchWriter(destinationFile, older, 'A', workers)
    const readA = await writerA.read
    assert.equal(readA.seenRevision, null)
    assert.equal(readA.eligible, true)
    trace.push({writer: 'A', operation: 'GET', seenRevision: null, incomingRevision: 1})
    // A is blocked AFTER GET and BEFORE PUT. B reads the same old state.
    const writerB = launchWriter(destinationFile, newer, 'B', workers)
    assert.notEqual(writerA.threadId, writerB.threadId)
    const readB = await writerB.read
    assert.equal(readB.seenRevision, null)
    assert.equal(readB.eligible, true)
    trace.push({writer: 'B', operation: 'GET', seenRevision: null, incomingRevision: 2})
    writerB.release()
    assert.deepEqual((await writerB.done).receipt, {status: 'applied', revision: 2})
    assert.deepEqual(receiver.read(subjectId), newer)
    trace.push({writer: 'B', operation: 'blind-PUT', storedRevision: 2, creditedOrders: 10})
    writerA.release()
    assert.deepEqual((await writerA.done).receipt, {status: 'applied', revision: 1})
    assert.deepEqual(receiver.read(subjectId), older, 'Expected counterexample: delayed old PUT overwrites the newer destination snapshot')
    trace.push({writer: 'A', operation: 'blind-PUT', storedRevision: 1, creditedOrders: 9})
    assert.equal(receiver.db.prepare('SELECT COUNT(*) AS count FROM not_ghl_blind_idempotency').get().count, 2)
    assert.deepEqual(receiver.write(newer), {status: 'duplicate', revision: 2})
    assert.deepEqual(receiver.read(subjectId), older, 'An idempotent retry of B cannot repair this receiver after A regressed it')

    // Identical envelopes and arrival order, a DIFFERENT local receiver contract.
    // This is not a claim about capabilities of any actual GHL endpoint.
    conditional.bind(subjectId, destinationRef)
    assert.equal((await conditional.send(newer)).status, 'applied')
    assert.equal((await conditional.send(older)).status, 'stale')
    assert.deepEqual(conditional.get(subjectId), {envelope: newer, applies: 1})
    assert.deepEqual(dumpLedger(backend), authoritativeBefore)
    assert.deepEqual(mirrorStore.get(subjectId), projectionBefore)
    const progress = await service.getProgress(session)
    assert.equal(progress.creditedOrders, 10)
    assert.equal(progress.earnedRewards, 1)
    assert.equal(progress.unredeemedRewards, 1)
    assert.equal(backend.count('loyalty_credits'), 10)
    assert.equal(backend.count('loyalty_entitlements'), 1)
    assert.equal(backend.count('loyalty_redemptions'), 0)
    t.diagnostic(JSON.stringify({scope: 'NOT GHL; local SQLite receivers and synthetic identifiers only; no HTTP',
      trace, blindFinal: {revision: 1, creditedOrders: 9, appliedDistinctMessageIds: 2},
      conditionalLocalFakeFinal: {revision: 2, creditedOrders: 10, oldDeliveryStatus: 'stale', applies: 1},
      authoritativeBackend: {creditedOrders: 10, earnedRewards: 1, unchanged: true}}))
  })
}
