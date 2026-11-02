const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')

const source = ts.transpileModule(fs.readFileSync('src/server/public-api-security.server.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture(responder = () => ({data: {allowed: true}, error: null})) {
  const timers = new Map(), calls = [], signals = []
  let now = 1000, wallClock = 1000, next = 0, clients = 0, statusReads = 0, statusClients = 0
  const mod = {exports: {}}
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, AbortController,
    Date: {now: () => wallClock},
    setTimeout: (fn, ms) => {const id = ++next; timers.set(id, {fn, ms}); return id},
    clearTimeout: id => timers.delete(id),
    require: name => {
      if (name === 'node:crypto') return crypto
      if (name === 'node:perf_hooks') return {performance: {now: () => now}}
      if (name !== './supabase-admin.server') throw new Error('Unexpected external import: ' + name)
      return {createSupabaseAdminClient() {
        clients++
        return {rpc(name, args) {
          calls.push({name, args})
          const index = calls.length - 1
          const query = {
            abortSignal(signal) {signals.push(signal); return query},
            single() {return responder(index, () => now, value => {now = value})},
          }
          return query
        }}
      }}
    },
  })
  const input = {request: new Request('https://bagelito.example.invalid/api/test', {
    headers: {'x-forwarded-for': '192.0.2.1', 'user-agent': 'synthetic-test'},
  }), scope: 'payments'}
  const routeMod = {exports: {}}
  const routeSource = ts.transpileModule(fs.readFileSync('src/routes/api/payments/culqi/status.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText
  vm.runInNewContext(routeSource, {module: routeMod, exports: routeMod.exports, Response,
    require: name => {
      if (name === '@tanstack/react-router') return {createFileRoute: () => value => value}
      if (name.endsWith('public-api-security.server')) return mod.exports
      if (name.endsWith('http-json.server')) return {readBoundedJsonObject: request => request.json()}
      if (name.endsWith('payment-config.server')) return {
        isPaymentStatusRequestAllowed: () => true,
        getPrivatePaymentConfig: () => ({configured: true, bridgeReady: true}),
        isGuidedReceiptRequestAllowed: () => false,
      }
      if (name.endsWith('supabase-admin.server')) return {createSupabaseAdminClient: () => {statusClients++; return {}}}
      if (name.endsWith('payment-status.server')) return {
        parsePaymentStatusReference: value => value, PaymentStatusNotFoundError: class extends Error {},
        readBoundPaymentStatus: async () => {statusReads++; return {ok: true, paymentStatus: 'pending'}},
      }
      throw new Error('Unexpected route import: ' + name)
    },
  })
  return {api: mod.exports, calls, signals, timers, clients: () => clients,
    run: extra => mod.exports.enforcePublicApiSecurity({...input, ...extra}),
    statusReads: () => statusReads, statusClients: () => statusClients,
    requestStatus: () => routeMod.exports.Route.server.handlers.POST({request: new Request(input.request.url, {
      method: 'POST', headers: input.request.headers, body: JSON.stringify({orderCode: 'BAG-SYNTHETIC', checkoutSessionId: 'synthetic'}),
    })}),
    advance: ms => {now += ms},
    setWallClock: value => {wallClock = value},
    expire: () => {for (const {fn, ms} of [...timers.values()]) {now += ms; fn()}},
  }
}
const unavailable = error => error.name === 'PublicApiError' && error.status === 503
  && error.message === 'This service is temporarily unavailable.'

test('stalled RPC has a finite deadline, aborts, and never retries or consumes the contact', async () => {
  const f = fixture(() => new Promise(() => {}))
  const pending = f.run({email: 'synthetic@example.invalid'})
  await flush()
  assert.equal(f.timers.size, 1, 'rate-limit RPC must remain inside a deadline')
  assert.equal([...f.timers.values()][0].ms, 2000)
  const rejected = assert.rejects(pending, unavailable)
  f.expire(); await rejected
  assert.equal(f.signals[0].aborted, true)
  assert.equal(f.timers.size, 0)
  assert.equal(f.calls.length, 1)
})

test('requester and contact share the same 2 s budget', async () => {
  const f = fixture((index, _get, set) => {
    if (index === 0) {set(2250); return {data: {allowed: true}, error: null}}
    return new Promise(() => {})
  })
  const pending = f.run({email: 'synthetic@example.invalid'})
  await flush()
  assert.equal(f.timers.size, 1)
  assert.equal([...f.timers.values()][0].ms, 750)
  const rejected = assert.rejects(pending, unavailable)
  f.expire(); await rejected
  assert.equal(f.calls.length, 2)
  assert.equal(f.signals[1].aborted, true)
})

test('late result cannot win after elapsed deadline even if timer has not fired', async () => {
  const f = fixture((_index, _get, set) => {set(3000); return {data: {allowed: true}, error: null}})
  await assert.rejects(f.run({email: 'synthetic@example.invalid'}), unavailable)
  assert.equal(f.calls.length, 1)
  assert.equal(f.signals[0].aborted, true)
  assert.equal(f.timers.size, 0)
})

test('wall-clock rollback never extends the shared monotonic budget', async () => {
  const f = fixture((index, _get, set) => {
    if (index === 0) {f.setWallClock(0); set(2250); return {data: {allowed: true}, error: null}}
    return new Promise(() => {})
  })
  const pending = f.run({email: 'synthetic@example.invalid'})
  await flush()
  assert.equal(f.timers.size, 1)
  assert.equal([...f.timers.values()][0].ms, 750)
  const rejected = assert.rejects(pending, unavailable)
  f.expire(); await rejected
  assert.equal(f.calls.length, 2)
  assert.equal(f.signals[1].aborted, true)
  assert.equal(f.timers.size, 0)
})

test('timely allowed response preserves exact scopes, hashing and sequential consumption', async () => {
  const f = fixture()
  await f.run({email: '  SYNTHETIC@example.invalid  '})
  assert.deepEqual(f.calls.map(x => x.name), ['consume_api_rate_limit', 'consume_api_rate_limit'])
  assert.deepEqual(f.calls.map(x => x.args.p_scope), ['payments_requester', 'payments_contact'])
  assert.equal(f.calls[0].args.p_identifier, crypto.createHash('sha256').update('ip:192.0.2.1').digest('hex'))
  assert.equal(f.calls[1].args.p_identifier, crypto.createHash('sha256').update('email:synthetic@example.invalid').digest('hex'))
  assert.equal(f.timers.size, 0)
  assert.ok(f.signals.every(signal => !signal.aborted))
})

test('valid denial stays 429 and never advances to contact consumption', async () => {
  const f = fixture(() => ({data: {allowed: false, retry_after_seconds: 42}, error: null}))
  await assert.rejects(f.run({email: 'synthetic@example.invalid'}), error => error.status === 429 && error.retryAfterSeconds === 42)
  assert.equal(f.calls.length, 1)
  assert.equal(f.timers.size, 0)
})

for (const [label, data] of [
  ['truthy string', {allowed: 'false'}], ['truthy number', {allowed: 1}],
  ['truthy array', {allowed: []}], ['missing boolean', {}], ['null', null],
  ['array row', []], ['false with NaN retry', {allowed: false, retry_after_seconds: NaN}],
  ['false with string retry', {allowed: false, retry_after_seconds: '1\r\nX-Test: unsafe'}],
  ['false with infinite retry', {allowed: false, retry_after_seconds: Infinity}],
  ['false with negative retry', {allowed: false, retry_after_seconds: -1}],
  ['false with fractional retry', {allowed: false, retry_after_seconds: 1.5}],
]) test(`malformed ${label} fails closed with 503, not permission or misleading throttling`, async () => {
  const f = fixture(() => ({data, error: null}))
  await assert.rejects(f.run(), unavailable)
  assert.equal(f.calls.length, 1)
  assert.equal(f.timers.size, 0)
})

for (const reply of [{data: {allowed: true}}, {data: {allowed: true}, error: {message: 'private db detail'}}]) {
  test('missing error envelope or RPC error fails closed without leaking details', async () => {
    const f = fixture(() => reply)
    await assert.rejects(f.run(), unavailable)
    assert.equal(f.timers.size, 0)
  })
}

test('throwing transport is sanitized and clears its timer', async () => {
  const f = fixture(() => {throw new Error('private transport detail')})
  await assert.rejects(f.run(), unavailable)
  assert.equal(f.timers.size, 0)
  assert.equal(f.calls.length, 1)
})

test('honeypot is rejected before creating a client', async () => {
  const f = fixture()
  await assert.rejects(f.run({trapValue: 'spam'}), error => error.status === 400)
  assert.equal(f.clients(), 0)
  assert.equal(f.timers.size, 0)
})

for (const [retry, expected] of [[undefined, 600], [null, 600], [0, 1], [999999, 600]]) {
  test(`valid denial retry ${retry} is bounded to the configured window`, async () => {
    const f = fixture(() => ({data: {allowed: false, retry_after_seconds: retry}, error: null}))
    await assert.rejects(f.run(), error => error.status === 429 && error.retryAfterSeconds === expected)
    assert.equal(f.timers.size, 0)
  })
}

test('late completion after timeout cannot authorize or trigger contact consumption', async () => {
  let resolve
  const f = fixture(() => new Promise(done => {resolve = done}))
  const pending = f.run({email: 'synthetic@example.invalid'})
  await flush()
  assert.equal(f.timers.size, 1)
  const rejected = assert.rejects(pending, unavailable)
  f.expire(); await rejected
  resolve({data: {allowed: true}, error: null})
  await flush()
  assert.equal(f.calls.length, 1)
  assert.equal(f.timers.size, 0)
})

test('real status route returns sanitized uncached 503 on limiter timeout before creating an order reader', async () => {
  const f = fixture(() => new Promise(() => {}))
  const pending = f.requestStatus()
  await flush()
  assert.equal(f.timers.size, 1)
  f.expire()
  const response = await pending
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {ok: false, error: 'This service is temporarily unavailable.'})
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store')
  assert.equal(f.statusClients(), 0)
  assert.equal(f.statusReads(), 0)
})

for (const [reply, expected] of [
  [{data: {allowed: 'true'}, error: null}, 503],
  [{data: {allowed: false, retry_after_seconds: 42}, error: null}, 429],
  [{data: {allowed: true}, error: null}, 200],
]) test(`real status route honors limiter outcome ${expected} before reading order state`, async () => {
  const f = fixture(() => reply)
  const response = await f.requestStatus()
  assert.equal(response.status, expected)
  assert.equal(f.statusClients(), expected === 200 ? 1 : 0)
  assert.equal(f.statusReads(), expected === 200 ? 1 : 0)
  assert.equal(f.timers.size, 0)
})
