const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Execute the actual component handler with state-setter spies, not a copy of
// its logic. This checks transitions; it is not a mounted React/browser test.
const source = fs.readFileSync('src/playable/GuidedCommerce.tsx', 'utf8')
const handler = source.match(/  function chooseCategory\(value: Category\) \{[\s\S]*?\n  \}/)?.[0]
assert.ok(handler, 'actual chooseCategory handler must exist')
const js = ts.transpileModule(handler, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText
function fixture(overrides = {}) {
  const state = {category: 'combos', bagelMode: 'combo', schmearSize: 240, comboId: 'two-bagel-schmear',
    bagels: {plain: 2}, schmears: {'whipped-original': 1}, scene: 'cashier', ...overrides}
  const context = {get category() {return state.category},
    resetSelections: () => {state.bagels = {}; state.schmears = {}},
    setCategory: value => {state.category = value},
    setComboId: value => {state.comboId = value},
    setBagelMode: value => {state.bagelMode = value},
    setSchmearSize: value => {state.schmearSize = value},
    setScene: value => {state.scene = value}}
  vm.createContext(context); vm.runInContext(js, context)
  return {state, choose: context.chooseCategory}
}
test('Combo to standalone Schmears clears stale combo mode and selections', () => {
  const f = fixture(); f.choose('schmears')
  assert.equal(f.state.bagelMode, 'pack'); assert.equal(f.state.comboId, null)
  assert.deepEqual(f.state.bagels, {}); assert.deepEqual(f.state.schmears, {})
  assert.equal(f.state.scene, 'schmear-size')
  assert.equal(f.state.schmearSize, 240, 'standalone size remains an explicit next-step choice')
})
test('Schmears to Packs resets an inherited larger pot to the optional 120 g size', () => {
  const f = fixture({category: 'schmears', bagelMode: 'downsell2'}); f.choose('packs')
  assert.equal(f.state.bagelMode, 'pack'); assert.equal(f.state.schmearSize, 120)
  assert.deepEqual(f.state.bagels, {}); assert.deepEqual(f.state.schmears, {})
  assert.equal(f.state.scene, 'pack-size')
})
test('changing to Combos resets the configured default to one 120 g pot', () => {
  const f = fixture({category: 'schmears', bagelMode: 'upsell8'}); f.choose('combos')
  assert.equal(f.state.bagelMode, 'combo'); assert.equal(f.state.schmearSize, 120)
  assert.equal(f.state.comboId, null); assert.equal(f.state.scene, 'combos')
})
test('returning to the same category keeps selected products and mode', () => {
  for (const category of ['packs', 'combos', 'schmears']) {
    const f = fixture({category}); const before = JSON.stringify(f.state)
    f.choose(category)
    const expected = JSON.parse(before); expected.scene = category === 'packs' ? 'pack-size' : category === 'combos' ? 'combos' : 'schmear-size'
    assert.deepEqual(f.state, expected)
  }
})
