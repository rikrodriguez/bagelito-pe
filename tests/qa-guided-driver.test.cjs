const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { createHash } = require('node:crypto')

// Exercise the actual runner registration/classifier with deferred fake routes.
// No browser is launched and no request is sent, including to the fixture URL.
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide QA_HDR_FIXTURE_PATH with the approved offline HDR')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
assert.equal(createHash('sha256').update(hdr).digest('hex'), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const sourcePath = process.env.QA_GUIDED_DRIVER_PATH || resolve(__dirname, '../scripts/qa-guided.cjs')
const source = readFileSync(sourcePath, 'utf8')
const begin = source.indexOf("      await context.route('**/*', route => {")
const end = source.indexOf('\n      const page = await context.newPage()', begin)
assert.ok(begin >= 0 && end > begin, 'Locate the real guided route registration')
const helperBegin = source.indexOf('      const reportRouteError = (entry, allowedGet) => {')
const helperEnd = source.indexOf('      network.push(traffic)', helperBegin)
const helper = helperBegin >= 0 ? source.slice(helperBegin, helperEnd) : ''
const cleanupBegin = source.indexOf("        closing = true\n        record('context-closing'")
const cleanupEnd = source.indexOf('\n        activePage = null', cleanupBegin)
assert.ok(cleanupBegin >= 0 && cleanupEnd > cleanupBegin, 'Locate the real context drain/close sequence')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const create = new AsyncFunction('context', 'hdr', `
  const mode = { name: 'offline-driver-test' };
  const traffic = { reads: [], fixtureReads: 0, blocked: [], httpErrors: [], routeErrors: [], closingRouteErrors: [], closingAborts: [] };
  const failures = [], events = [], record = (type, details) => events.push({ type, ...details });
  const baseURL = new URL('http://127.0.0.1:3196');
  const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr';
  const pendingRoutes = new Set(); let closing = false;
  ${helper}
  ${source.slice(begin, end)}
  return { traffic, failures, events, pendingRoutes, close: async () => {
    ${source.slice(cleanupBegin, cleanupEnd)}
  }};
`)

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function context() {
  return {
    handler: null, closed: false,
    async route(_, handler) { this.handler = handler },
    async close() { this.closed = true },
  }
}

function route(options = {}) {
  return {
    fetchCalls: 0, fulfillCalls: 0, abortCalls: 0,
    request: () => ({ method: () => options.method || 'GET', url: () => options.url || 'http://127.0.0.1:3196/asset.js' }),
    async fetch() {
      this.fetchCalls++
      if (options.wait) await options.wait
      if (options.fetchError) throw Error(options.fetchError)
      return { status: () => options.status || 200 }
    },
    async fulfill() {
      this.fulfillCalls++
      if (options.dispose) throw Error('Fetch response has been disposed')
    },
    async abort() {
      this.abortCalls++
      if (options.abortDispose) throw Error('Context has been closed')
    },
  }
}

test('a disposed response while the context is live remains a failure without an unhandled rejection', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), request = route({ dispose: true })
  await ctx.handler(request)
  assert.equal(firewall.traffic.routeErrors.length, 1)
  assert.equal(firewall.failures.length, 1)
  assert.equal(request.abortCalls, 1)
  assert.equal(firewall.pendingRoutes.size, 0)
  await firewall.close()
  assert.equal(ctx.closed, true)
})

test('closing drains pending requests before context.close and records expected disposal separately', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), wait = deferred()
  const request = route({ wait: wait.promise, dispose: true })
  const running = ctx.handler(request), closing = firewall.close()
  assert.equal(ctx.closed, false, 'context.close must wait for the pending response')
  wait.resolve()
  await running
  await closing
  assert.equal(firewall.traffic.closingRouteErrors.length, 1)
  assert.equal(firewall.failures.length, 0)
  assert.equal(ctx.closed, true)
  assert.equal(firewall.pendingRoutes.size, 0)
})

test('new allowed GETs during closing are aborted without fetching online', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), wait = deferred()
  const pending = ctx.handler(route({ wait: wait.promise })), closing = firewall.close()
  const request = route({ abortDispose: true })
  await ctx.handler(request)
  wait.resolve()
  await pending
  await closing
  assert.equal(request.fetchCalls, 0)
  assert.equal(request.fulfillCalls, 0)
  assert.equal(request.abortCalls, 1)
  assert.equal(firewall.traffic.closingAborts.length, 1)
  assert.equal(firewall.traffic.closingRouteErrors.length, 1)
  assert.equal(firewall.failures.length, 0)
})

test('closing never permits an unrelated destination or write', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), wait = deferred()
  const pending = ctx.handler(route({ wait: wait.promise })), closing = firewall.close()
  const request = route({ method: 'POST', url: 'https://provider.example/charge' })
  await ctx.handler(request)
  wait.resolve()
  await pending
  await closing
  assert.equal(request.fetchCalls, 0)
  assert.equal(request.fulfillCalls, 0)
  assert.equal(request.abortCalls, 1)
  assert.equal(firewall.traffic.blocked.length, 1)
  assert.equal(firewall.failures.length, 1)
})

test('HTTP500 completing during the closing drain is an immediate failure', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), wait = deferred()
  const request = route({ wait: wait.promise, status: 500 })
  const running = ctx.handler(request), closing = firewall.close()
  wait.resolve()
  await running
  await closing
  assert.equal(firewall.failures.length, 1, 'a late HTTP500 must fail after final UI/network asserts have already run')
  assert.equal(firewall.traffic.httpErrors.length, 1)
  assert.equal(ctx.closed, true)
})

test('a timeout during closing remains a failure even when its text also mentions context closed', async () => {
  const ctx = context(), firewall = await create(ctx, hdr), wait = deferred()
  const request = route({ wait: wait.promise, fetchError: 'Timeout 30000ms exceeded while waiting for context closed' })
  const running = ctx.handler(request), closing = firewall.close()
  wait.resolve()
  await running
  await closing
  assert.equal(firewall.failures.length, 1, 'a timeout is not an expected disposal')
  assert.equal(firewall.traffic.routeErrors.length, 1)
  assert.equal(firewall.traffic.closingRouteErrors.length, 0)
})
