const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

// Execute the actual QA-only gate with a deterministic native RAF scheduler.
// This imports neither Playwright nor the application and launches no browser.
const source = readFileSync(resolve(__dirname, '../scripts/qa-movement-events.cjs'), 'utf8')
const begin = source.indexOf('function installRafGate() {')
const end = source.indexOf('\nasync function state(', begin)
assert.ok(begin >= 0 && end > begin, 'Locate the real QA RAF gate')
const implementation = source.slice(begin, end)

function setup() {
  let next = 0, now = 0
  const nativeQueue = new Map(), cancelled = []
  const window = {
    requestAnimationFrame(callback) {
      if (typeof callback !== 'function') throw TypeError('RAF callback must be callable')
      const id = ++next
      nativeQueue.set(id, callback)
      return id
    },
    cancelAnimationFrame(id) { cancelled.push(id); nativeQueue.delete(id) },
    addEventListener() {},
  }
  const context = vm.createContext({ window, document: { addEventListener() {} }, performance: { now: () => now }, Element: class {} })
  vm.runInContext('(' + implementation + ')()', context)
  const gate = window.__bagelitoQaRafGate
  async function tick(timestamp) {
    now = timestamp
    const batch = [...nativeQueue]
    nativeQueue.clear()
    for (const [, callback] of batch) callback(timestamp)
    await Promise.resolve()
  }
  return { window, gate, tick, nativeQueue, cancelled }
}

test('requestAnimationFrame returns its original native ID', () => {
  const { window, nativeQueue } = setup()
  const id = window.requestAnimationFrame(() => {})
  assert.equal(id, 1)
  assert.ok(nativeQueue.has(id))
})

test('paused app callbacks stay queued while native pause fences complete', async () => {
  const { window, gate, tick } = setup(), delivered = []
  window.requestAnimationFrame(timestamp => delivered.push(timestamp))
  const paused = gate.pause()
  await tick(16)
  await tick(32)
  await paused
  assert.equal(delivered.length, 0)
  assert.equal(gate.snapshot().queued, 1)
  assert.equal(gate.snapshot().paused, true)
})

test('cancelling a queued original ID prevents delivery after resume', async () => {
  const { window, gate, tick } = setup(), delivered = []
  const id = window.requestAnimationFrame(timestamp => delivered.push(timestamp))
  const paused = gate.pause()
  await tick(16)
  await tick(32)
  await paused
  window.cancelAnimationFrame(id)
  gate.resume()
  await tick(48)
  assert.equal(delivered.length, 0)
})

test('cancel(original ID) also cancels its reprogrammed native handle', async () => {
  const { window, gate, tick, nativeQueue, cancelled } = setup(), delivered = []
  const originalId = window.requestAnimationFrame(timestamp => delivered.push(timestamp))
  const paused = gate.pause()
  await tick(16)
  await tick(32)
  await paused
  gate.resume()
  const replayId = [...nativeQueue.keys()][0]
  assert.notEqual(replayId, originalId)
  window.cancelAnimationFrame(originalId)
  assert.ok(cancelled.includes(replayId))
  await tick(48)
  assert.equal(delivered.length, 0)
})

test('resume supplies a fresh native timestamp without rebasing the real clock', async () => {
  const { window, gate, tick } = setup(), delivered = []
  window.requestAnimationFrame(timestamp => delivered.push(timestamp))
  const paused = gate.pause()
  await tick(16)
  await tick(32)
  await paused
  gate.resume()
  await tick(300)
  assert.deepEqual(delivered, [300])
  assert.equal(gate.snapshot().now, 300)
})

test('callbacks retain the native Window receiver', async () => {
  const { window, tick } = setup()
  let receiver
  window.requestAnimationFrame(function () { receiver = this })
  await tick(16)
  assert.equal(receiver, window)
})

test('invalid callbacks retain native synchronous validation', () => {
  const { window } = setup()
  assert.throws(() => window.requestAnimationFrame(null), TypeError)
})
