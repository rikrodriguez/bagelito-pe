// Offline driver regression: no browser, GPU, provider, or server writes.
// QA_HDR_FIXTURE_PATH=/path/to/lebombo_1k.hdr node --test tests/qa-world-driver.test.cjs
// The runner's unrelated visual-source subprocess is stubbed in this VM only.
const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const { resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const root = resolve(__dirname, '..')
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Set QA_HDR_FIXTURE_PATH to the pinned HDR fixture used by qa:3d')
const fixturePath = resolve(process.env.QA_HDR_FIXTURE_PATH)
const outputRoot = fs.mkdtempSync(resolve(tmpdir(), 'bagelito-world-driver-'))
after(() => fs.rmSync(outputRoot, {recursive: true, force: true}))
const current = fs.readFileSync(resolve(root, 'scripts/qa-world-tour.cjs'), 'utf8')
const original = execFileSync('git', ['show', '925c050659ac7682488a9bc9c9c4906787663eb1:scripts/qa-world-tour.cjs'], {cwd: root, encoding: 'utf8'})
const originalMode = process.env.QA_DRIVER_TEST_ORIGINAL === 'true'
const source = originalMode ? original : current
const currentGuardTest = (name, run) => test(name, {skip: originalMode ? 'This guard does not exist in the historical baseline' : false}, run)
function load(overrides = {}, chromium = {}) {
  const cleared = []
  const env = {BASE_URL: 'http://127.0.0.1:3194', QA_OUTPUT: resolve(outputRoot, 'helper'), QA_HDR_FIXTURE_PATH: fixturePath, ...overrides}
  const context = vm.createContext({
    require(name) {
      if (name === 'playwright') return {chromium}
      if (name === 'node:child_process') return {execFileSync() {}}
      return require(name)
    },
    process: {env, execPath: process.execPath}, __dirname: resolve(root, 'scripts'),
    console: {log() {}, error() {}}, URL, Buffer, setTimeout, clearTimeout,
    sessionStorage: {removeItem(key) {cleared.push(key)}},
  })
  vm.runInContext(source.slice(0, source.lastIndexOf('audit().catch')), context)
  return {freshExplore: vm.runInContext('freshExplore', context), isolateRequests: vm.runInContext('typeof isolateRequests === "function" ? isolateRequests : undefined', context), audit: vm.runInContext('audit', context), cleared}
}
function page({status = 200, reads = [], origin = 'http://127.0.0.1:3194'} = {}) {
  const traffic = {reads: []}, visits = []
  return {
    traffic, visits,
    page: {url: () => origin + '/playable', evaluate: async fn => fn(), goto: async (url, options) => {
      visits.push({url, options}); traffic.reads.push(...reads); return {status: () => status}
    }},
  }
}
test('A healthy fresh journey resets only the in-tab product draft and keeps the reload', async () => {
  const driver = load(), fake = page({reads: [{status: 200, url: 'http://127.0.0.1:3194/assets/store.js'}]})
  await driver.freshExplore(fake.page, fake.traffic)
  assert.deepEqual(driver.cleared, ['bagelito.guided.product-draft.v1'])
  assert.equal(fake.visits[0].url, 'http://127.0.0.1:3194/playable')
  assert.equal(fake.visits[0].options.waitUntil, 'domcontentloaded')
})
test('A 200 HTML document with an HTTP 500 JS chunk reports the server artifact failure before UI lookup', async () => {
  const driver = load(), fake = page({reads: [{status: 500, url: 'http://127.0.0.1:3194/assets/retired-chunk.js'}]})
  await assert.rejects(driver.freshExplore(fake.page, fake.traffic), /Fresh exploration cannot mount while local resources return HTTP errors/)
})
test('A failed document is reported as an HTTP setup failure', async () => {
  const driver = load(), fake = page({status: 500})
  await assert.rejects(driver.freshExplore(fake.page, fake.traffic), /Fresh exploration must return an HTTP 200 document/)
})
test('A non-loopback target is refused before any browser launch', () => {
  assert.throws(() => load({BASE_URL: 'https://example.invalid'}), /3D QA requires/)
})
test('The original readiness and strafe logic remains intact apart from comments and result checkpoints', () => {
  const logic = text => text.replace(/\/\/[^\n]*/g, '').replace(/^\s*checkpoint\(\)\s*$/gm, '').split('\n').map(line => line.trim()).filter(Boolean).join('\n')
  const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
  assert.equal(section(current, 'async function waitForFrames(', 'async function waitForCamera('), section(original, 'async function waitForFrames(', 'async function waitForCamera('))
  assert.equal(logic(section(current, '        const readyDeadline = Date.now() + 30000', '        await page.locator(\'.tour-start-button\').click()')), logic(section(original, '        const readyDeadline = Date.now() + 30000', '        await page.locator(\'.tour-start-button\').click()')))
})
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {resolve = yes; reject = no})
  return {promise, resolve, reject}
}
async function routeHarness() {
  const driver = load(), failures = [], calls = []
  const traffic = {mode: 'fake', reads: [], fixtureReads: 0, blocked: []}
  let handler, closed = false
  const context = {
    async route(pattern, callback) {assert.equal(pattern, '**/*'); handler = callback},
    async close() {closed = true; calls.push('context-close')},
  }
  const firewall = await driver.isolateRequests(context, traffic, message => failures.push(message))
  function route({method = 'GET', url = 'http://127.0.0.1:3194/assets/store.js', fulfill, abort} = {}) {
    return {
      request: () => ({method: () => method, url: () => url}),
      fetch: async options => {assert.equal(options.maxRedirects, 0); calls.push('fetch'); return {status: () => 200}},
      fulfill: async options => {calls.push('fulfill'); if (fulfill) return fulfill(options)},
      abort: async reason => {calls.push('abort:' + reason); if (abort) return abort(reason)},
    }
  }
  return {firewall, route, handle: incoming => handler(incoming), traffic, failures, calls, closed: () => closed}
}
const settleMicrotasks = () => new Promise(resolve => setImmediate(resolve))
currentGuardTest('Teardown drains an in-flight fulfill before disposing the context and records a marked cancellation', async () => {
  const h = await routeHarness(), pending = deferred()
  const task = h.handle(h.route({fulfill: () => pending.promise}))
  await settleMicrotasks()
  const close = h.firewall.close()
  assert.equal(h.closed(), false, 'The API response must not be disposed while its handler is in flight')
  pending.reject(new Error('route.fulfill: Fetch response has been disposed'))
  await Promise.all([task, close])
  assert.equal(h.closed(), true)
  assert.deepEqual(h.failures, [])
  assert.equal(h.traffic.routeErrors.length, 1)
  assert.equal(h.traffic.routeErrors[0].phase, 'teardown')
  assert.equal(h.traffic.routeErrors[0].expected, true)
})
currentGuardTest('The same disposed fulfill error while the context is live remains a FAIL', async () => {
  const h = await routeHarness()
  await h.handle(h.route({fulfill: () => {throw new Error('route.fulfill: Fetch response has been disposed')}}))
  assert.equal(h.failures.length, 1)
  assert.equal(h.traffic.routeErrors[0].phase, 'active')
  assert.equal(h.traffic.routeErrors[0].expected, false)
  await h.firewall.close()
})
currentGuardTest('An unrelated fulfill error during teardown remains a FAIL', async () => {
  const h = await routeHarness(), pending = deferred()
  const task = h.handle(h.route({fulfill: () => pending.promise}))
  await settleMicrotasks()
  const close = h.firewall.close()
  pending.reject(new Error('Unexpected local fixture failure'))
  await Promise.all([task, close])
  assert.equal(h.failures.length, 1)
  assert.equal(h.traffic.routeErrors[0].expected, false)
})
currentGuardTest('New allowed reads during closing are aborted without fetching or fulfilling', async () => {
  const h = await routeHarness(), pending = deferred()
  const first = h.handle(h.route({fulfill: () => pending.promise}))
  await settleMicrotasks()
  const close = h.firewall.close(), callsBefore = h.calls.length
  await h.handle(h.route({abort: () => {throw new Error('Target page, context or browser has been closed')}}))
  assert.deepEqual(h.calls.slice(callsBefore), ['abort:blockedbyclient', 'abort:failed'])
  assert.equal(h.traffic.teardownAborts.length, 1)
  assert.ok(h.traffic.routeErrors.every(error => error.expected))
  pending.resolve()
  await Promise.all([first, close])
  assert.deepEqual(h.failures, [])
})
currentGuardTest('A POST during closing is aborted and remains a forbidden request FAIL with no egress', async () => {
  const h = await routeHarness(), pending = deferred()
  const first = h.handle(h.route({fulfill: () => pending.promise}))
  await settleMicrotasks()
  const close = h.firewall.close(), callsBefore = h.calls.length
  await h.handle(h.route({method: 'POST', url: 'https://provider.example/pay'}))
  assert.deepEqual(h.calls.slice(callsBefore), ['abort:blockedbyclient'])
  assert.equal(h.failures.length, 1)
  assert.equal(h.traffic.blocked[0].method, 'POST')
  assert.equal(h.traffic.blocked[0].phase, 'teardown')
  assert.equal(h.traffic.teardownAborts.length, 0)
  pending.resolve()
  await Promise.all([first, close])
})
currentGuardTest('The outer finally writes an explicit result even if browser launch fails', async () => {
  const output = resolve(outputRoot, 'launch-failure')
  const driver = load({QA_OUTPUT: output}, {launch: async () => {throw new Error('Deliberate fake browser launch failure')}})
  await driver.audit()
  const report = JSON.parse(fs.readFileSync(resolve(output, 'tour-results.json')))
  assert.equal(report.results.length, 0)
  assert.match(report.failures[0], /AUDIT_STOP: Error: Deliberate fake browser launch failure/)
})
