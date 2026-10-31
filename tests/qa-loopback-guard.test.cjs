const test = require('node:test')
const assert = require('node:assert/strict')
const { HDR_URL, readPinnedHDR, installLoopbackGuard } = require('../scripts/lib/qa-loopback-guard.cjs')

// The exact approved fixture is supplied explicitly. These tests use fake
// contexts/routes only; no browser, socket or provider request is created.
const hdr = readPinnedHDR(process.env.QA_HDR_FIXTURE_PATH)

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function fakeContext() {
  return {
    handler: null, closed: false, closeCalls: 0,
    async route(pattern, handler) { assert.equal(pattern, '**/*'); this.handler = handler },
    async close() { this.closed = true; this.closeCalls++ },
  }
}
function fakeRoute(options = {}) {
  return {
    fetchCalls: 0, fulfillCalls: 0, abortCalls: 0,
    request: () => ({ method: () => options.method || 'GET', url: () => options.url || 'http://127.0.0.1:3196/asset.js' }),
    async fetch(optionsPassed) {
      this.fetchCalls++
      assert.equal(optionsPassed.maxRedirects, 0)
      if (options.wait) await options.wait
      if (options.fetchError) throw Error(options.fetchError)
      return { status: () => options.status || 200 }
    },
    async fulfill() {
      this.fulfillCalls++
      if (options.dispose) throw Error('Fetch response has been disposed')
    },
    async abort(reason) {
      this.abortCalls++
      assert.equal(reason, 'blockedbyclient')
      if (options.abortDispose) throw Error('Context has been closed')
    },
  }
}
async function setup() {
  const context = fakeContext(), failures = [], events = []
  const guard = await installLoopbackGuard(context, {
    base: new URL('http://127.0.0.1:3196'), hdr,
    onFailure: entry => failures.push(entry), onEvent: entry => events.push(entry),
  })
  return { context, guard, failures, events }
}

test('a disposed response while the context is live is a real callback failure without a rejected handler', async () => {
  const { context, guard, failures } = await setup(), route = fakeRoute({ dispose: true })
  await context.handler(route)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].type, 'route-error')
  assert.equal(failures[0].phase, 'active')
  assert.equal(guard.traffic.routeErrors.length, 1)
  assert.equal(guard.traffic.closingRouteErrors.length, 0)
  assert.equal(guard.state().pendingRoutes, 0)
  assert.equal(route.abortCalls, 1)
  await guard.close()
})

test('close drains deferred reads before disposing context, records expected disposal, and is idempotent', async () => {
  const { context, guard, failures } = await setup(), wait = deferred()
  const route = fakeRoute({ wait: wait.promise, dispose: true })
  const pending = context.handler(route), closing = guard.close()
  assert.equal(context.closed, false, 'context cannot be disposed while its fetch is pending')
  assert.equal(guard.state().closing, true)
  wait.resolve()
  await pending
  await closing
  await guard.close()
  assert.equal(context.closed, true)
  assert.equal(context.closeCalls, 1)
  assert.equal(failures.length, 0)
  assert.equal(guard.traffic.closingRouteErrors.length, 1)
  assert.deepEqual(guard.state(), { closing: true, closed: true, pendingRoutes: 0 })
})

test('new loopback or exact-fixture GETs during close are safely aborted without any online fetch', async () => {
  const { context, guard, failures } = await setup(), wait = deferred()
  const pending = context.handler(fakeRoute({ wait: wait.promise })), closing = guard.close()
  const local = fakeRoute({ abortDispose: true }), fixture = fakeRoute({ url: HDR_URL, abortDispose: true })
  await context.handler(local)
  await context.handler(fixture)
  wait.resolve()
  await pending
  await closing
  for (const route of [local, fixture]) {
    assert.equal(route.fetchCalls, 0)
    assert.equal(route.fulfillCalls, 0)
    assert.equal(route.abortCalls, 1)
  }
  assert.equal(guard.traffic.closingAborts.length, 2)
  assert.equal(guard.traffic.closingRouteErrors.length, 2)
  assert.equal(guard.traffic.fixtureReads, 0)
  assert.equal(failures.length, 0)
})

test('closing never permits an unrelated destination or a write', async () => {
  const { context, guard, failures } = await setup(), wait = deferred()
  const pending = context.handler(fakeRoute({ wait: wait.promise })), closing = guard.close()
  const forbidden = fakeRoute({ method: 'POST', url: 'https://provider.example/charge' })
  await context.handler(forbidden)
  wait.resolve()
  await pending
  await closing
  assert.equal(forbidden.fetchCalls, 0)
  assert.equal(forbidden.fulfillCalls, 0)
  assert.equal(forbidden.abortCalls, 1)
  assert.equal(guard.traffic.blocked.length, 1)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].type, 'request-forbidden')
})

test('a local HTTP500 finishing during the closing drain immediately fails the caller', async () => {
  const { context, guard, failures } = await setup(), wait = deferred()
  const request = fakeRoute({ wait: wait.promise, status: 500 })
  const pending = context.handler(request), closing = guard.close()
  wait.resolve()
  await pending
  await closing
  assert.equal(failures.length, 1)
  assert.equal(failures[0].type, 'local-http-error')
  assert.equal(failures[0].phase, 'closing')
  assert.equal(failures[0].status, 500)
  assert.equal(guard.traffic.httpErrors.length, 1)
  assert.equal(context.closed, true)
})

test('a timeout during close is a failure even if its message also mentions context closed', async () => {
  const { context, guard, failures } = await setup(), wait = deferred()
  const request = fakeRoute({ wait: wait.promise, fetchError: 'Timeout 30000ms exceeded while waiting for context closed' })
  const pending = context.handler(request), closing = guard.close()
  wait.resolve()
  await pending
  await closing
  assert.equal(failures.length, 1)
  assert.equal(failures[0].type, 'route-error')
  assert.equal(failures[0].phase, 'closing')
  assert.equal(guard.traffic.routeErrors.length, 1)
  assert.equal(guard.traffic.closingRouteErrors.length, 0)
  assert.equal(guard.traffic.callbackErrors.length, 0)
})
