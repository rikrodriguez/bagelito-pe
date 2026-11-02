const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
const session = '11111111-1111-4111-8111-111111111111'
const defaults = {
  PAYMENT_PROVIDER: 'culqi', CULQI_MODE: 'sandbox', VERCEL_ENV: 'preview', PUBLIC_SITE_URL: 'https://fixture.example.test',
  CULQI_PUBLIC_KEY: 'pk_test_fixture', CULQI_SECRET_KEY: 'sk_test_fixture', CULQI_RSA_ID: 'fixture', CULQI_RSA_PUBLIC_KEY: 'fixture',
  CULQI_ENABLED: 'true', CULQI_TANSTACK_BRIDGE_READY: 'true', CULQI_TANSTACK_WEBHOOK_READY: 'true', CULQI_TANSTACK_CLIENT_READY: 'true',
  BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED: 'true', BAGELITO_REFERENCE_REVIEW_ONLY: 'false',
}
function setup(options = {}) {
  const effects = {clients: 0, rpc: [], coordinate: 0, provider: 0, selects: []}, cache = new Map()
  const env = {...defaults, ...options.env}
  const db = {from() {return {
    select(columns) {effects.selects.push(columns); return this}, eq() {return this},
    async maybeSingle() {return {error: null, data: {
      id: '22222222-2222-4222-8222-222222222222', order_code: 'BAG-FIXTURE', checkout_session_id: session,
      email: 'fixture@example.test', customer_name: 'Synthetic Customer', whatsapp: '000000000',
      delivery_address: 'Synthetic address', district: 'Lince', total_amount: 70,
      pack_slug: options.slug ?? 'guided-v1:6-single', status: 'payment_pending_review', payment_status: 'pending',
      payment_provider: 'culqi', payment_lane: 'token', payment_order_id: null,
      payment_expires_at: new Date(Date.now() + 600000).toISOString(),
    }}},
  }}, async rpc(name) {effects.rpc.push(name); return {data: {sessionId: 'synthetic-session', amount: 7000}, error: null}}}
  class PublicApiError extends Error {constructor(message, status = 400) {super(message); this.status = status}}
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = {exports: {}}; cache.set(file, module.exports)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText
    vm.runInNewContext(code, {module, exports: module.exports, process: {env}, URL, Response, Date,
      require(id) {
        if (id === '@tanstack/react-router') return {createFileRoute: () => value => value}
        if (id.endsWith('http-json.server')) return {readBoundedJsonObject: request => request.json()}
        if (id.endsWith('public-api-security.server')) return {PublicApiError, enforcePublicApiSecurity: async () => {}}
        if (id.endsWith('supabase-admin.server')) return {createSupabaseAdminClient: () => {effects.clients++; return db}}
        if (id.endsWith('charge-coordinator.server')) return {coordinateCulqiCharge: async input => {
          effects.coordinate++; await input.createCharge(); return {ok: true, paymentStatus: 'pending'}
        }}
        if (id.endsWith('culqi.server')) return {createCulqiCharge: async () => {effects.provider++; return {}}, fetchCulqiCharge: () => {throw Error('Unexpected lookup')}}
        if (!id.startsWith('.')) throw Error('Unexpected external dependency: ' + id)
        return load(path.resolve(path.dirname(file), id) + '.ts')
      },
    })
    return module.exports
  }
  const config = load(path.join(root, 'src/server/payment-config.server.ts'))
  const request = (headers = {}) => new Request('https://fixture.example.test/api/payments/culqi/charge', {
    method: 'POST', headers: {'content-type': 'application/json', origin: 'https://fixture.example.test', ...headers},
    body: JSON.stringify({checkoutSessionId: session, orderCode: 'BAG-FIXTURE', email: 'fixture@example.test',
      sourceId: `tkn_${env.CULQI_MODE === 'live' ? 'live' : 'test'}_abcdefgh`, deviceId: 'fixture_device_123'}),
  })
  return {effects, config, request, async call(route, headers = {}) {
    return load(path.join(root, `src/routes/api/payments/culqi/${route}.ts`)).Route.server.handlers.POST({request: request(headers)})
  }}
}

test('full-product flag defaults closed and never appears in public configuration', () => {
  for (const value of [undefined, '', 'false', 'TRUE', ' true ', '1']) {
    const f = setup({env: {BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED: value}})
    assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request()), false)
    assert.equal(f.config.isGuidedProductCheckoutPageAllowed(f.request()), false)
  }
  const f = setup()
  assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request()), true)
  assert.equal(f.config.isGuidedProductCheckoutPageAllowed(f.request()), true)
  assert.doesNotMatch(JSON.stringify(f.config.getPublicPaymentConfig()), /GUIDED_PRODUCT|sk_test_fixture/)
})

test('explicit Origin, matching proxy origin, same-site metadata and every intake flag remain mandatory', () => {
  for (const key of ['CULQI_ENABLED','CULQI_TANSTACK_BRIDGE_READY','CULQI_TANSTACK_WEBHOOK_READY','CULQI_TANSTACK_CLIENT_READY']) {
    const f = setup({env: {[key]: 'false'}}); assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request()), false, key)
  }
  for (const env of [{BAGELITO_REFERENCE_REVIEW_ONLY: 'true'}, {BAGELITO_MERCHANT_REVIEW_ONLY: 'true'}, {CULQI_SECRET_KEY: ''}]) {
    const f = setup({env}); assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request()), false)
    assert.equal(f.config.isGuidedProductCheckoutPageAllowed(f.request()), false)
  }
  const f = setup()
  for (const headers of [{origin: ''}, {origin: 'https://other.example.test'}, {'sec-fetch-site': 'cross-site'}, {'sec-fetch-site': 'same-site'},
    {'x-forwarded-host': 'other.example.test'}, {'x-forwarded-proto': 'http'}]) {
    assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request(headers)), false)
  }
  assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(f.request({'sec-fetch-site': 'same-origin'})), true)
  const get = new Request('https://fixture.example.test/sandbox-checkout')
  assert.equal(f.config.isGuidedProductCheckoutPageAllowed(get), true, 'GET availability is not payment authority')
  assert.equal(f.config.isGuidedProductCheckoutRequestAllowed(get), false)
})

for (const route of ['order', 'charge']) {
  test(`${route}: complete guided reservations cannot enter live, production, review-only or closed sandbox lanes`, async () => {
    for (const env of [
      {BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED: 'false'}, {BAGELITO_REFERENCE_REVIEW_ONLY: 'true'},
      {VERCEL_ENV: 'production'}, {CULQI_MODE: 'live', CULQI_LIVE_APPROVED: 'true', CULQI_PUBLIC_KEY: 'pk_live_fixture', CULQI_SECRET_KEY: 'sk_live_fixture'},
    ]) {
      const f = setup({env}); const response = await f.call(route)
      assert.equal(response.status, 503)
      assert.equal(f.effects.rpc.length, 0); assert.equal(f.effects.coordinate, 0); assert.equal(f.effects.provider, 0)
    }
  })
  test(`${route}: cross-site guided payment cannot reach preparation or provider`, async () => {
    for (const headers of [{origin: ''}, {'sec-fetch-site': 'same-site'}, {'sec-fetch-site': 'cross-site'}]) {
      const f = setup(); assert.equal((await f.call(route, headers)).status, 503)
      assert.equal(f.effects.rpc.length, 0); assert.equal(f.effects.coordinate, 0); assert.equal(f.effects.provider, 0)
    }
  })
  test(`${route}: allowed sandbox preserves complete pack/pot contract and exact namespace`, async () => {
    for (const slug of ['guided-v1:6-single','guided-v1:12-mixed','guided-v1:schmear-120','guided-v1:schmear-180','guided-v1:schmear-240']) {
      const f = setup({slug}); assert.equal((await f.call(route)).status, 200)
      assert.ok(f.effects.selects.every(columns => columns.includes('pack_slug')))
      assert.equal(route === 'order' ? f.effects.rpc.length : f.effects.coordinate, 1)
    }
  })
  test(`${route}: unknown guided contracts stay closed even with sandbox opt-in`, async () => {
    for (const slug of ['guided-v2:6-single','guided-v1:combo','guided-v1:schmear-121','guided-v1:6-single-extra']) {
      const f = setup({slug}); assert.equal((await f.call(route)).status, 503)
      assert.equal(f.effects.rpc.length, 0); assert.equal(f.effects.coordinate, 0)
    }
  })
  test(`${route}: legacy reservation keeps its existing live path without the new opt-in`, async () => {
    const f = setup({slug: '6-single', env: {BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED: 'false',
      CULQI_MODE: 'live', CULQI_LIVE_APPROVED: 'true', CULQI_PUBLIC_KEY: 'pk_live_fixture', CULQI_SECRET_KEY: 'sk_live_fixture'}})
    assert.equal((await f.call(route)).status, 200)
    assert.equal(route === 'order' ? f.effects.rpc.length : f.effects.coordinate, 1)
  })
}
