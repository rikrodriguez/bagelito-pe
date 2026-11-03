const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/server/http-json.server.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText

function setup() {
  const timers = new Map(), module = {exports: {}}
  let clock = 0, next = 0
  class PublicApiError extends Error { constructor(message, status) { super(message); this.status = status } }
  vm.runInNewContext(compiled, {module, exports: module.exports, TextDecoder, Uint8Array,
    Date: {now: () => clock}, setTimeout(fn, ms) { const id = ++next; timers.set(id, {fn, at: clock + ms}); return id },
    clearTimeout(id) {timers.delete(id)}, require(id) {assert.equal(id, './public-api-security.server'); return {PublicApiError}}})
  return {read: module.exports.readBoundedJsonObject, timers,
    advance(ms) {clock += ms; for (const {fn, at} of [...timers.values()]) if (at <= clock) fn()}}
}
function request(body, headers = {}) {
  return new Request('https://fixture.example.test/api/checkout/quote', {
    method: 'POST', body, duplex: 'half', headers: {'content-type': 'application/json', ...headers},
  })
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('408 deadline returns even when underlying body cancellation never settles', async () => {
  const f = setup(); let cancelled = 0, error
  const body = new ReadableStream({cancel() {cancelled++; return new Promise(() => {})}})
  const req = request(body), pending = f.read(req).catch(value => {error = value})
  await flush(); f.advance(2000); await flush()
  assert.equal(error?.status, 408, 'cleanup cannot extend the request deadline')
  assert.equal(cancelled, 1); assert.equal(f.timers.size, 0); assert.equal(req.body.locked, false)
  await pending
})
test('oversize stream rejects promptly even when underlying cancellation never settles', async () => {
  const f = setup(); let cancelled = 0, error
  const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(9))},
    cancel() {cancelled++; return new Promise(() => {})}})
  const pending = f.read(request(body), 8).catch(value => {error = value})
  await flush()
  assert.equal(error?.status, 413, 'oversize rejection must not await cleanup')
  assert.equal(cancelled, 1); assert.equal(f.timers.size, 0)
  await pending
})

test('asynchronous cancellation failure does not replace the original 413', async () => {
  const f = setup()
  const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(9))},
    cancel() {return Promise.reject(new Error('fixture cleanup failure'))}})
  await assert.rejects(f.read(request(body), 8), error => error.status === 413)
  await flush(); assert.equal(f.timers.size, 0)
})
test('deadline is shared across chunks, not restarted after every chunk', async () => {
  const f = setup(); let controller, error
  const body = new ReadableStream({start(value) {controller = value}})
  const pending = f.read(request(body)).catch(value => {error = value})
  await flush(); f.advance(1500); controller.enqueue(new TextEncoder().encode('{')); await flush()
  assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].at, 2000)
  f.advance(500); await flush(); assert.equal(error?.status, 408); await pending
})
test('valid multi-chunk UTF-8 object is decoded once and retains exact byte-limit semantics', async () => {
  const f = setup(), value = {name: 'Ají'}, bytes = new TextEncoder().encode(JSON.stringify(value))
  const body = new ReadableStream({start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  }})
  assert.deepEqual(JSON.parse(JSON.stringify(await f.read(request(body), bytes.length))), value)
  assert.equal(f.timers.size, 0)
})
test('actual bytes reject oversized input even without content-length', async () => {
  const f = setup()
  await assert.rejects(f.read(request('{"a":1}'), 6), error => error.status === 413)
  assert.equal(f.timers.size, 0)
})
test('unsupported content type and invalid or oversized declared length remain rejected', async () => {
  for (const [headers, status] of [[{'content-type': 'text/plain'}, 400], [{'content-length': '-1'}, 413],
    [{'content-length': 'bad'}, 413], [{'content-length': '20'}, 413]]) {
    const f = setup()
    await assert.rejects(f.read(request('{}', headers), 8), error => error.status === status)
    assert.equal(f.timers.size, 0)
  }
})
test('malformed JSON, invalid UTF-8, null, arrays and scalar roots remain 400', async () => {
  for (const body of ['{', 'null', '[]', '1', '"string"', Uint8Array.of(0xff)]) {
    const f = setup()
    await assert.rejects(f.read(request(body)), error => error.status === 400)
    assert.equal(f.timers.size, 0)
  }
})
test('empty request body is rejected without scheduling a timer', async () => {
  const f = setup()
  await assert.rejects(f.read(request(undefined)), error => error.status === 400)
  assert.equal(f.timers.size, 0)
})
test('stream failure propagates and clears deadline timers', async () => {
  const f = setup(), failure = new Error('fixture stream failure')
  const body = new ReadableStream({start(controller) {controller.error(failure)}})
  await assert.rejects(f.read(request(body)), error => error === failure)
  assert.equal(f.timers.size, 0)
})
