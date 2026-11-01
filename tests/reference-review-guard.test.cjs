const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { H3 } = require('h3')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/server/reference-review-guard.server.ts'), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText

function setup(flag) {
  const env = {BAGELITO_REFERENCE_REVIEW_ONLY: flag}, exports = {}
  // Only the actual server guard is loaded. No financial module, credentials,
  // database client, socket, or provider is used by this in-process H3 server.
  vm.runInNewContext(compiled, {exports, process: {env}, Response})
  const effects = {handler: 0, database: 0, provider: 0}
  const app = new H3().use(exports.default)
  app.on('', '/**', () => {
    effects.handler++; effects.database++; effects.provider++
    return Response.json({downstream: true})
  })
  return {app, effects, env}
}

test('review mode stops every HTTP method before downstream effects', async () => {
  const {app, effects} = setup('true')
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await app.request('http://preview.local/api/checkout/quote', {method})
    assert.equal(response.status, 503, method)
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store')
    assert.equal(response.headers.get('set-cookie'), null)
    if (method !== 'HEAD') assert.deepEqual(await response.json(), {ok: false, reviewOnly: true, error: 'API disabled in image reference review.'})
  }
  assert.deepEqual(effects, {handler: 0, database: 0, provider: 0})
})

test('all existing API families and canonical API paths are covered', async () => {
  const {app, effects} = setup('true')
  for (const route of ['/api', '/api/', '/api/batch', '/api/catalog', '/api/payments/culqi/config', '/api/payments/culqi/status', '/api/webhooks/culqi', '/%61pi/batch', '/API/batch', '/api%2Fbatch']) {
    assert.equal((await app.request('http://preview.local' + route)).status, 503, route)
  }
  assert.deepEqual(effects, {handler: 0, database: 0, provider: 0})
})

test('landing, image assets, and unrelated prefixes remain available', async () => {
  const {app, effects} = setup('true')
  for (const route of ['/', '/images/store-reference-approved.webp', '/assets/app.js', '/legal', '/apiary']) {
    assert.equal((await app.request('http://preview.local' + route)).status, 200, route)
  }
  assert.equal(effects.handler, 5)
})

test('false or absent flag leaves downstream behavior unchanged', async () => {
  for (const flag of ['false', undefined]) {
    const {app, effects} = setup(flag)
    const response = await app.request('http://preview.local/api/checkout/quote', {method: 'POST'})
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {downstream: true})
    assert.deepEqual(effects, {handler: 1, database: 1, provider: 1})
  }
})

test('flag is read at request time rather than frozen by the build/import', async () => {
  const {app, env, effects} = setup('false')
  assert.equal((await app.request('http://preview.local/api/batch')).status, 200)
  env.BAGELITO_REFERENCE_REVIEW_ONLY = 'true'
  assert.equal((await app.request('http://preview.local/api/batch')).status, 503)
  env.BAGELITO_REFERENCE_REVIEW_ONLY = 'false'
  assert.equal((await app.request('http://preview.local/api/batch')).status, 200)
  assert.equal(effects.handler, 2)
})

test('Nitro registers the guard as global middleware outside the financial routes', () => {
  const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
  assert.match(config, /route:\s*'\/\*\*'[\s\S]*middleware:\s*true[\s\S]*handler:\s*'\.\/src\/server\/reference-review-guard\.server\.ts'/)
  assert.doesNotMatch(source, /(?:from|require\()\s*['"].*(?:supabase|culqi|payment|batch|security)/i)
})
