const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

// Synthetic in-process DB and rate-limit fixtures; no credentials, sockets or provider.
function setup({forceQuoteReady = false, persistedOverride = {}} = {}) {
  const effects = {rpc: [], clients: 0, security: 0}, cache = new Map()
  let persisted = null, items = []
  const db = {
    from(table) {
      const builder = {
        select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
        async maybeSingle() {
          if (table === 'orders') return {data: persisted, error: null}
          if (table === 'batches') return {data: {id: 'fixture-batch', status: 'orders_open', delivery_date: '2026-11-06T18:00:00Z'}, error: null}
          throw new Error('Unexpected table ' + table)
        },
        then(resolve) {
          assert.equal(table, 'order_items'); return Promise.resolve({data: items, error: null}).then(resolve)
        },
      }
      return builder
    },
    rpc(name, args) {
      effects.rpc.push({name, args})
      if (name === 'next_order_code') return Promise.resolve({data: 'BAG-FIXTURE', error: null})
      assert.equal(name, 'create_culqi_reservation_order')
      return {async single() {
        persisted = {id: 'fixture-order', email: args.p_email, pack_slug: args.p_pack_slug, total_amount: args.p_total_amount,
          order_code: args.p_order_code, payment_expires_at: args.p_payment_expires_at, status: 'payment_pending_review', ...persistedOverride}
        items = args.p_items
        return {data: {}, error: null}
      }}
    },
  }
  class PublicApiError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
    const module = {exports: {}}
    cache.set(file, module.exports)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
    }).outputText
    vm.runInNewContext(source, {module, exports: module.exports, Date, require(id) {
      if (id === 'node:crypto') return {randomBytes() { throw new Error('Fallback randomness not expected') }}
      if (id === './public-api-security.server') return {PublicApiError, enforcePublicApiSecurity: async () => { effects.security++ }}
      if (id === './supabase-admin.server') return {createSupabaseAdminClient: () => {effects.clients++; return db}}
      if (id === './batch.server') return {getBatchReadOnly: async () => ({status: 200, batch: {accepting: true, deliveryDate: '2026-11-06T18:00:00Z'}})}
      if (id === './checkout-quote.server' && forceQuoteReady) return {quoteGuidedOrder: async () => ({status: 'ready', checkoutAllowed: true, amountPen: 50})}
      if (!id.startsWith('.')) throw new Error('Unexpected dependency: ' + id)
      const target = path.resolve(path.dirname(file), id)
      return load(target + (path.extname(target) === '.json' ? '' : '.ts'))
    }})
    return module.exports
  }
  return {create: load(path.join(root, 'src/server/checkout-session.server.ts')).createGuidedCheckoutSession, effects}
}
const input = overrides => ({
  checkoutSessionId: '11111111-1111-4111-8111-111111111111', customerName: 'Fixture Customer', email: 'fixture@example.test',
  whatsapp: '000000000', deliveryAddress: 'Fixture address 123', district: 'Lince', termsAccepted: true, termsVersion: '2026-10-28',
  category: 'packs', packFormat: 'grande', packQty: 6, packMix: 'single', bagelMode: 'pack', bagels: {plain: 6}, schmears: {}, schmearSize: 120,
  ...overrides,
})
const request = () => new Request('https://fixture.example.test/api/checkout/session')

test('ordinary pack persists every selected bagel at unchanged subtotal plus delivery', async () => {
  const {create, effects} = setup(), result = await create(request(), input())
  assert.equal(result.amountPen, 58); assert.equal(result.amountMinor, 5800)
  const reservation = effects.rpc.find(call => call.name === 'create_culqi_reservation_order').args
  assert.equal(reservation.p_pack_slug, '6-single'); assert.equal(reservation.p_pack_units, 6)
  assert.equal(reservation.p_total_amount, 58); assert.equal(reservation.p_terms_accepted, true)
  assert.deepEqual(JSON.parse(JSON.stringify(reservation.p_items)), [{flavor_name: 'Plain', flavor_slug: 'plain', quantity: 6}])
  assert.equal(effects.security, 1)
})
test('same session retry returns persisted pack without another reservation', async () => {
  const {create, effects} = setup(), first = await create(request(), input()), second = await create(request(), input())
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)))
  assert.equal(effects.rpc.filter(call => call.name === 'create_culqi_reservation_order').length, 1)
})
test('same-total changed flavor cannot reuse a session', async () => {
  const {create} = setup(); await create(request(), input())
  await assert.rejects(create(request(), input({bagels: {sesame: 6}})), error => error.status === 409)
})
test('adding a pot to an existing session never reuses the bagel-only reservation', async () => {
  const {create, effects} = setup(); await create(request(), input())
  await assert.rejects(create(request(), input({schmears: {'whipped-original': 1}})), error => error.status === 409)
  assert.equal(effects.rpc.filter(call => call.name === 'create_culqi_reservation_order').length, 1)
})
test('schmears, combos, extras and malformed selections cannot write a partial order', async () => {
  for (const overrides of [
    {schmears: {'whipped-original': 1}}, {schmears: []}, {bagels: {plain: 6, sesame: -1}},
    {category: 'schmears', bagels: {}, schmears: {'whipped-original': 1}},
    {category: 'schmears', bagelMode: 'downsell2', bagels: {plain: 2}, schmears: {'whipped-original': 1}},
    {category: 'combos', comboId: 'two-bagel-schmear', bagelMode: 'combo', bagels: {plain: 2}, schmears: {'whipped-original': 1}},
  ]) {
    const {create, effects} = setup()
    await assert.rejects(create(request(), input(overrides)), error => error.status === 409)
    assert.equal(effects.clients, 0); assert.deepEqual(effects.rpc, [])
  }
})
test('session independently rejects a lossy legacy projection even if quote adapter mistakenly says ready', async () => {
  for (const overrides of [{schmears: {'whipped-original': 1}}, {schmears: []}, {packFormat: 'mini'}, {bagels: {cheddar: 6}},
    {category: 'schmears', bagels: {}, schmears: {'whipped-original': 1}}]) {
    const {create, effects} = setup({forceQuoteReady: true})
    await assert.rejects(create(request(), input(overrides)), error => error.status === 409)
    assert.equal(effects.clients, 0); assert.deepEqual(effects.rpc, [])
  }
})
test('a mismatched ready quote amount cannot enter persistence', async () => {
  const {create, effects} = setup({forceQuoteReady: true})
  await assert.rejects(create(request(), input({packMix: 'mixed', bagels: {plain: 3, sesame: 3}})), error => error.status === 409)
  assert.equal(effects.clients, 0)
})
test('post-transaction re-read still rejects mismatched persisted results', async () => {
  const {create} = setup({persistedOverride: {total_amount: 1}})
  await assert.rejects(create(request(), input()), error => error.status === 409)
})
test('legal acceptance remains required before security, inventory or persistence', async () => {
  for (const overrides of [{termsAccepted: false}, {termsVersion: 'old'}]) {
    const {create, effects} = setup()
    await assert.rejects(create(request(), input(overrides)), error => error.status === 400)
    assert.equal(effects.security, 0); assert.equal(effects.clients, 0)
  }
})


test('legacy session post-RPC reread rejects a v2 contract even with identical bagels and amount', async () => {
  const {create} = setup({persistedOverride: {pack_slug: 'guided-v1:6-single'}})
  await assert.rejects(create(request(), input()), error => error.status === 409)
})
