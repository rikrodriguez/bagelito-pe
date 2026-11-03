const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Synthetic strings only: no process.env, credentials, DB or provider network.
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/server/payment-config.server.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText
function config(overrides = {}) {
  const env = {
    PAYMENT_PROVIDER: 'culqi', CULQI_MODE: 'sandbox', VERCEL_ENV: 'preview',
    PUBLIC_SITE_URL: 'https://qa.example.test', CULQI_PUBLIC_KEY: 'pk_test_fixture_not_a_credential',
    CULQI_SECRET_KEY: 'sk_test_fixture_not_a_credential', CULQI_RSA_ID: 'fixture-rsa-id',
    CULQI_RSA_PUBLIC_KEY: 'fixture-public-key', CULQI_ENABLED: 'true',
    CULQI_TANSTACK_BRIDGE_READY: 'true', CULQI_TANSTACK_WEBHOOK_READY: 'true', CULQI_TANSTACK_CLIENT_READY: 'true',
    ...overrides,
  }
  const module = {exports: {}}
  vm.runInNewContext(compiled, {module, exports: module.exports, process: {env}, URL})
  return module.exports
}
const req = (origin = 'https://qa.example.test', headers = {}) => new Request(origin + '/api/payments/culqi/charge', {headers})

test('complete synthetic sandbox configuration alone authorizes its exact test origin', () => {
  const api = config(), result = api.getPublicPaymentConfig()
  assert.equal(result.configured, true); assert.equal(result.enabled, true)
  assert.equal(api.isPaymentRequestAllowed(req()), true)
  assert.equal(result.currency, 'PEN')
})

test('each readiness gate independently closes new intake', () => {
  for (const key of ['CULQI_ENABLED', 'CULQI_TANSTACK_BRIDGE_READY', 'CULQI_TANSTACK_WEBHOOK_READY', 'CULQI_TANSTACK_CLIENT_READY']) {
    const api = config({[key]: 'false'})
    assert.equal(api.getPublicPaymentConfig().enabled, false, key)
    assert.equal(api.isPaymentRequestAllowed(req()), false, key)
  }
})

test('merchant review overrides all coherent keys and ready flags', () => {
  const api = config({BAGELITO_MERCHANT_REVIEW_ONLY: 'true'})
  const result = api.getPublicPaymentConfig()
  assert.equal(result.configured, true); assert.equal(result.intakeEnabled, false); assert.equal(result.enabled, false)
  assert.equal(api.isPaymentRequestAllowed(req()), false)
})

test('closing intake retains authenticated same-origin status recovery', () => {
  for (const flags of [{CULQI_ENABLED: 'false'}, {BAGELITO_MERCHANT_REVIEW_ONLY: 'true'}]) {
    const api = config(flags)
    assert.equal(api.isPaymentRequestAllowed(req()), false)
    assert.equal(api.isPaymentStatusRequestAllowed(req()), true)
  }
  assert.equal(config({CULQI_TANSTACK_BRIDGE_READY: 'false'}).isPaymentStatusRequestAllowed(req()), false)
})

test('missing keys or a mixed key environment never configure Culqi', () => {
  for (const key of ['CULQI_PUBLIC_KEY', 'CULQI_SECRET_KEY', 'CULQI_RSA_ID', 'CULQI_RSA_PUBLIC_KEY']) {
    const result = config({[key]: ''}).getPublicPaymentConfig()
    assert.equal(result.configured, false, key); assert.equal(result.enabled, false, key)
    assert.equal(result.publicKey, '', key); assert.equal(result.rsaPublicKey, '', key)
  }
  assert.equal(config({CULQI_SECRET_KEY: 'sk_live_fixture_not_a_credential'}).getPublicPaymentConfig().configured, false)
})

test('sandbox cannot run on production environment or public storefront hosts', () => {
  for (const overrides of [{VERCEL_ENV: 'production'}, ...['bagelito.pe', 'www.bagelito.pe', 'bagelito-pe.vercel.app'].map(host => ({PUBLIC_SITE_URL: 'https://' + host}))]) {
    const api = config(overrides)
    assert.equal(api.getPublicPaymentConfig().configured, false)
    assert.equal(api.getPublicPaymentConfig().enabled, false)
  }
})

test('live fixtures require explicit live approval independently of merchant activation', () => {
  const live = {CULQI_MODE: 'live', VERCEL_ENV: 'production', PUBLIC_SITE_URL: 'https://bagelito.pe',
    CULQI_PUBLIC_KEY: 'pk_live_fixture_not_a_credential', CULQI_SECRET_KEY: 'sk_live_fixture_not_a_credential'}
  assert.equal(config(live).getPublicPaymentConfig().enabled, false)
  assert.equal(config({...live, CULQI_LIVE_APPROVED: 'true'}).getPublicPaymentConfig().enabled, true)
  assert.equal(config({...live, CULQI_LIVE_APPROVED: 'true', BAGELITO_MERCHANT_REVIEW_ONLY: 'true'}).getPublicPaymentConfig().enabled, false)
})

test('origin, request host, forwarded host and forwarded protocol must match exactly', () => {
  const api = config()
  for (const request of [req('https://other.example.test'), req('http://qa.example.test'),
    req('https://qa.example.test', {origin: 'https://other.example.test'}),
    req('https://qa.example.test', {'x-forwarded-host': 'other.example.test'}),
    req('https://qa.example.test', {'x-forwarded-proto': 'http'})]) {
    assert.equal(api.isPaymentRequestAllowed(request), false)
    assert.equal(api.isPaymentStatusRequestAllowed(request), false)
  }
  assert.equal(api.isPaymentRequestAllowed(req('https://qa.example.test', {origin: 'https://qa.example.test', 'x-forwarded-host': 'qa.example.test', 'x-forwarded-proto': 'https'})), true)
})

test('public configuration never includes the provider secret', () => {
  const api = config(), result = api.getPublicPaymentConfig()
  assert.equal(Object.hasOwn(result, 'secretKey'), false)
  assert.equal(JSON.stringify(result).includes('sk_test_fixture_not_a_credential'), false)
  assert.equal(api.getPrivatePaymentConfig().secretKey, 'sk_test_fixture_not_a_credential')
})

test('unknown provider, mode or malformed origin fails closed; visual QA cannot enable payment', () => {
  for (const overrides of [{PAYMENT_PROVIDER: 'manual'}, {CULQI_MODE: 'unknown'}, {PUBLIC_SITE_URL: 'not a URL'}, {PUBLIC_SITE_URL: ''}]) {
    assert.equal(config({...overrides, BAGELITO_VISUAL_QA_ENABLED: 'true'}).getPublicPaymentConfig().enabled, false)
  }
  assert.equal(config({BAGELITO_VISUAL_QA_ENABLED: 'true', VERCEL_ENV: 'production'}).getPublicPaymentConfig().visualQaAllowed, false)
})
