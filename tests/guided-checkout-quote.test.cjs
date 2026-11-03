const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function setup(batchOverride = {}) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
    const module = {exports: {}}
    cache.set(file, module.exports)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
    }).outputText
    vm.runInNewContext(source, {module, exports: module.exports, require(id) {
      if (id === './batch.server') return {getBatchReadOnly: async units => {
        calls.push(units)
        return {status: 200, batch: {accepting: true, deliveryDate: '2026-11-06T18:00:00Z'}, ...batchOverride}
      }}
      if (!id.startsWith('.')) throw new Error('Unexpected dependency: ' + id)
      const target = path.resolve(path.dirname(file), id)
      return load(target + (path.extname(target) === '.json' ? '' : '.ts'))
    }})
    return module.exports
  }
  return {quote: load(path.join(root, 'src/server/checkout-quote.server.ts')).quoteGuidedOrder, calls}
}
const pack = overrides => ({category: 'packs', packFormat: 'grande', packQty: 6, packMix: 'single', bagels: {plain: 6}, schmears: {}, schmearSize: 120, bagelMode: 'pack', ...overrides})
const pot = overrides => ({category: 'schmears', bagels: {}, schmears: {'whipped-original': 1}, schmearSize: 120, bagelMode: 'pack', ...overrides})
const combo = overrides => ({category: 'combos', comboId: 'two-bagel-schmear', bagelMode: 'combo', bagels: {plain: 1, sesame: 1}, schmears: {'whipped-original': 1}, schmearSize: 120, ...overrides})

test('malformed optional schmear is never silently discarded from a pack', async () => {
  for (const schmears of [[], 'whipped-original', null, {'whipped-original': -1}, {'whipped-original': 'bad'}, {'whipped-original': true}, {'whipped-original': '1'}]) {
    const {quote} = setup(), result = await quote(pack({schmears}))
    assert.equal(result.status, 'invalid', JSON.stringify(schmears)); assert.equal(result.checkoutAllowed, false)
  }
})
test('invalid bagel quantity is not coerced or filtered out', async () => {
  for (const bagels of [{plain: 6, sesame: -1}, {plain: '6'}, {plain: [6]}, {plain: 6, sesame: null}]) {
    assert.equal((await setup().quote(pack({bagels}))).status, 'invalid')
  }
})
test('malformed combos are invalid, not a generic unpriced offer', async () => {
  for (const overrides of [{comboId: 'perfect-pair'}, {bagels: {plain: 6}}, {schmears: {}}, {schmears: {unknown: 1}}]) {
    assert.equal((await setup().quote(combo(overrides))).status, 'invalid')
  }
})
test('capacity projection uses actual selected bagels for combo and standalone schmear', async () => {
  for (const [input, units] of [[combo(), 2], [pot(), 0], [pot({bagelMode: 'upsell8', bagels: {plain: 8}}), 8]]) {
    const {quote, calls} = setup(); await quote(input)
    assert.deepEqual(calls, [units])
  }
})
test('unpriced extra never presents a partial schmear price as the order total', async () => {
  const result = await setup().quote(pot({bagelMode: 'downsell2', bagels: {plain: 2}}))
  assert.equal(result.status, 'review_required'); assert.equal(result.amountPen, null)
})

test('four regular pack prices and same-flavor normalization stay unchanged', async () => {
  for (const [qty, bagels, mix, amount] of [[6, {plain: 6}, 'single', 50], [12, {plain: 12}, 'single', 100],
    [6, {plain: 3, sesame: 3}, 'mixed', 60], [12, {plain: 6, sesame: 6}, 'mixed', 115], [6, {plain: 6}, 'mixed', 50]]) {
    const {quote, calls} = setup(), result = await quote(pack({packQty: qty, bagels, packMix: mix}))
    assert.equal(result.status, 'ready'); assert.equal(result.amountPen, amount); assert.equal(result.checkoutAllowed, true)
    assert.deepEqual(calls, [qty]); assert.equal(result.lines.length, 1)
  }
})
test('a known 120 g optional pot keeps exact composition and dated published price, but cannot charge', async () => {
  for (const [flavor, price] of [['whipped-original', 12], ['aji-amarillo', 16], ['herb-roasted-garlic', 16], ['honey-cinnamon', 16], ['classic-strawberry', 16]]) {
    const result = await setup().quote(pack({schmears: {[flavor]: 1}}))
    assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false)
    assert.equal(result.amountPen, 50 + price); assert.equal(result.priceSourceDate, '2026-10-14')
    assert.equal(result.lines[1].publishedAmountPen, price)
    assert.deepEqual(JSON.parse(JSON.stringify(result.lines[1].schmears)), [{flavorId: flavor, quantity: 1, grams: 120}])
  }
})
test('standalone pots preserve selected size and all existing dated menu prices without opening checkout', async () => {
  for (const [size, original, flavored] of [[120, 12, 16], [180, 18, 23], [240, 22, 29]]) {
    for (const [flavor, price] of [['whipped-original', original], ['aji-amarillo', flavored]]) {
      const result = await setup().quote(pot({schmears: {[flavor]: 1}, schmearSize: size}))
      assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false)
      assert.equal(result.amountPen, price); assert.equal(result.lines[0].schmears[0].grams, size)
    }
  }
})
test('combo composition is represented without reusing historic six-bagel prices', async () => {
  const result = await setup().quote(combo())
  assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false); assert.equal(result.amountPen, null)
  assert.equal(result.lines.length, 1); assert.equal(result.lines[0].kind, 'combo')
  assert.equal(result.lines[0].bagels.reduce((n, item) => n + item.quantity, 0), 2)
  assert.equal(result.lines[0].schmears[0].grams, 120)
})
test('unknown extra prices do not hide the selected extra line', async () => {
  const result = await setup().quote(pot({bagelMode: 'upsell8', bagels: {plain: 8}}))
  assert.equal(result.lines.length, 2); assert.equal(result.lines[1].kind, 'bagel_extra')
  assert.equal(result.lines[1].publishedAmountPen, null); assert.equal(result.lines[1].bagels[0].quantity, 8)
})
test('malformed selections fail before any inventory read', async () => {
  for (const input of [pack({packQty: '6'}), pack({packMix: 'single', bagels: {plain: 3, sesame: 3}}),
    pack({schmears: {'whipped-original': 1}, schmearSize: 240}), pack({schmears: {'whipped-original': 2}}),
    pack({bagels: {plain: 6, unknown: 0}}), pot({bagels: {plain: 2}}), pot({bagelMode: 'downsell2', bagels: {plain: 8}}),
    combo({bagelMode: 'pack'}), pot({schmearSize: '120'}), {category: 'drinks'}, null]) {
    const {quote, calls} = setup(), result = await quote(input)
    assert.equal(result.status, 'invalid', JSON.stringify(input)); assert.equal(result.checkoutAllowed, false)
    assert.equal(result.amountPen, null); assert.deepEqual(calls, [])
  }
})
test('zero selected known flavors and omitted optional schmear still allow a regular pack', async () => {
  for (const overrides of [{schmears: undefined}, {schmears: {'whipped-original': 0}}, {bagels: {plain: 6, sesame: 0}}]) {
    assert.equal((await setup().quote(pack(overrides))).status, 'ready')
  }
})
test('premium and mini prices remain unresolved rather than claiming a complete total', async () => {
  for (const overrides of [{bagels: {cheddar: 6}}, {packFormat: 'mini'}, {packFormat: 'mini', packQty: 24, bagels: {plain: 24}}]) {
    const result = await setup().quote(pack(overrides))
    assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false); assert.equal(result.amountPen, null)
  }
})
test('inventory failure, closed batch, missing and malformed dates remain unavailable', async () => {
  for (const batchOverride of [{status: 503}, {batch: {accepting: false}}, {batch: {accepting: true, deliveryDate: null}},
    {batch: {accepting: true, deliveryDate: 'not-a-date'}}]) {
    const result = await setup(batchOverride).quote(pack())
    assert.equal(result.status, 'unavailable'); assert.equal(result.checkoutAllowed, false); assert.equal(result.amountPen, null)
  }
})

test('reconfirmed published combos preserve bundle prices, counts and every selected pot without enabling checkout', async () => {
  for (const [comboId, units, schmears, price] of [
    ['perfect-pair', 6, {'whipped-original': 1}, 74],
    ['brunch-pack', 12, {'whipped-original': 1, 'aji-amarillo': 1}, 140],
    ['schmear-lover', 6, {'classic-strawberry': 3}, 99],
  ]) {
    for (const sandboxCapability of [false, true]) {
      const {quote, calls} = setup()
      const result = await quote(combo({comboId, bagels: {plain: units}, schmears}), sandboxCapability)
      assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false)
      assert.equal(result.amountPen, price); assert.deepEqual(calls, [units])
      assert.equal(result.lines.length, 1); assert.equal(result.lines[0].id, comboId)
      assert.equal(result.lines[0].schmears.reduce((n, item) => n + item.quantity, 0), Object.values(schmears).reduce((n, x) => n + x, 0))
      assert.ok(result.lines[0].schmears.every(item => item.grams === 120))
    }
  }
})
test('published combo invalid quantities and unknown flavors fail before inventory lookup', async () => {
  for (const overrides of [
    {bagels: {plain: 2}}, {schmears: {}}, {schmears: {'whipped-original': 2}},
    {comboId: 'brunch-pack', bagels: {plain: 12}, schmears: {'whipped-original': 1}},
    {comboId: 'schmear-lover', schmears: {'whipped-original': 4}},
    {schmears: {'unknown': 1}}, {schmears: {'whipped-original': '1'}}, {bagelMode: 'pack'},
  ]) {
    const {quote, calls} = setup()
    const result = await quote(combo({comboId: 'perfect-pair', bagels: {plain: 6}, ...overrides}))
    assert.equal(result.status, 'invalid'); assert.equal(result.checkoutAllowed, false); assert.deepEqual(calls, [])
  }
})
test('published combo upgrades and premium bagels never acquire inferred payable prices', async () => {
  for (const overrides of [{schmearSize: 180}, {schmearSize: 240}, {bagels: {cheddar: 6}}]) {
    const result = await setup().quote(combo({comboId: 'perfect-pair', bagels: {plain: 6}, ...overrides}), true)
    assert.equal(result.status, 'review_required'); assert.equal(result.checkoutAllowed, false)
    assert.equal(result.amountPen, null); assert.equal(result.lines[0].publishedAmountPen, null)
  }
})
