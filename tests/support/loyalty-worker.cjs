'use strict'

// Each thread opens its own real SQLite connection. Only fictitious local
// fixture data is accepted by the parent test; there are no app/network clients.
const {parentPort, workerData, threadId} = require('node:worker_threads')
const {createStore} = require('./loyalty-sqlite-store.cjs')
const {createLoyaltyService} = require('./load-loyalty.cjs')

async function run() {
  const store = createStore(workerData.dbPath)
  try {
    // Native waiting is safe across independent worker event loops. The fixture
    // also retries BEGIN IMMEDIATE on contention instead of faking transactions.
    store.db.exec('PRAGMA busy_timeout = 1000')
    const busyTimeout = store.db.prepare('PRAGMA busy_timeout').get().timeout
    const service = createLoyaltyService(store)
    const gate = new Int32Array(workerData.startGate)
    parentPort.postMessage({type: 'ready', threadId, busyTimeout})
    while (Atomics.load(gate, 0) === 0) Atomics.wait(gate, 0, 0)

    const results = []
    for (const action of workerData.actions) {
      try {
        let value
        if (action.type === 'credit') value = await service.creditPaidOrder(action.orderId)
        else if (action.type === 'redeem') value = await service.redeem(action.context, action.input)
        else throw new Error('Unknown local loyalty worker action: ' + action.type)
        results.push({status: 'fulfilled', value})
      } catch (error) {
        results.push({status: 'rejected', reason: {
          code: error.code ?? null, name: error.name, message: error.message,
        }})
      }
    }
    parentPort.postMessage({type: 'results', threadId, results})
  } finally {
    store.close()
  }
}

run().catch(error => {
  parentPort.postMessage({type: 'fatal', message: error.stack || String(error)})
  process.exitCode = 1
})
