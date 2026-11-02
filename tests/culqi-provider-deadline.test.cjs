const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('src/server/culqi.server.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText
// Entire provider transport/configuration is mocked; no network or real credentials.
function fixture(body, responseOverrides = {}) {
  const timers = new Map(); let next = 0; let signal; let calls = 0
  const mod = {exports: {}}
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, AbortController, DOMException,
    require: () => ({getPrivatePaymentConfig: () => ({configured: true, bridgeReady: true,
      enabled: true, mode: 'sandbox', secretKey: 'MOCK_NOT_A_CREDENTIAL'})}),
    setTimeout: (callback, ms) => {assert.equal(ms, 10_000); timers.set(++next, callback); return next},
    clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => {
      signal = options.signal; calls++
      return {ok: true, status: 201, redirected: false, json: () => body(), ...responseOverrides}
    },
  })
  return {api: mod.exports, timers, signal: () => signal, calls: () => calls,
    expire: () => {for (const fn of [...timers.values()]) fn()}}
}
const charge = {object: 'charge', id: 'chr_test_abcdefgh'}
const input = {amountPen: 10, sourceId: 'tkn_test_abcdefgh', email: 'mock@example.invalid',
  orderCode: 'BAG-MOCK', customerName: 'Mock Person', phoneNumber: '999999999', address: 'Mock', district: 'Mock'}
const flush = () => new Promise(resolve => setImmediate(resolve))
for (const operation of ['create', 'lookup']) {
  const call = f => operation === 'create' ? f.api.createCulqiCharge(input) : f.api.fetchCulqiCharge(charge.id)
  test(`${operation}: deadline remains active while response body stalls and aborts it`, async () => {
    const f = fixture(() => new Promise(() => {}))
    const pending = call(f)
    const rejection = assert.rejects(pending, error => error.name === 'TimeoutError')
    await flush()
    assert.equal(f.timers.size, 1, 'body parsing must remain inside the deadline')
    f.expire(); await rejection
    assert.equal(f.signal().aborted, true)
    assert.equal(f.timers.size, 0)
    assert.equal(f.calls(), 1, 'timeout must never retry a charge')
  })
  test(`${operation}: successful body preserves result and clears timer`, async () => {
    const f = fixture(async () => charge)
    const result = await call(f)
    assert.equal(operation === 'create' ? result.charge.id : result.id, charge.id)
    assert.equal(f.timers.size, 0)
    assert.equal(f.signal().aborted, false)
    assert.equal(f.calls(), 1)
  })
  test(`${operation}: malformed JSON rejects and clears timer`, async () => {
    const f = fixture(async () => {throw new SyntaxError('mock malformed JSON')})
    await assert.rejects(call(f))
    assert.equal(f.timers.size, 0)
    assert.equal(f.calls(), 1)
  })
}

for (const operation of ['create', 'lookup']) {
  test(`${operation}: redirects are rejected before reading the body`, async () => {
    let read = false
    const f = fixture(async () => {read = true; return charge}, {redirected: true})
    await assert.rejects(operation === 'create' ? f.api.createCulqiCharge(input) : f.api.fetchCulqiCharge(charge.id), /cannot follow redirects/)
    assert.equal(read, false)
    assert.equal(f.timers.size, 0)
  })
}
test('create: existing 3DS REVIEW semantics are preserved', async () => {
  const f = fixture(async () => ({object: 'charge', action_code: 'REVIEW', capture: false}), {status: 200})
  const result = await f.api.createCulqiCharge(input)
  assert.equal(result.requires3DS, true)
  assert.equal(result.response.action_code, 'REVIEW')
  assert.equal(f.timers.size, 0)
})
