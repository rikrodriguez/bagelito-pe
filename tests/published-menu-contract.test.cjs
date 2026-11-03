const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const file = path.join(__dirname, '../src/domain/lib/approved-shop-contract.ts')
const menu = require('../src/domain/data/verified-menu-2026-10-21.json')
const moduleObject = {exports: {}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText,
  {module: moduleObject, exports: moduleObject.exports, require: () => menu})
const api = moduleObject.exports
const plain = n => [{flavorId: 'plain', quantity: n}]
test('display menu exposes the three reconfirmed named bundles and exact composition', () => {
  assert.deepEqual(api.getVerifiedDisplayMenu().publishedCombos.map(c => [c.id, c.bagels, c.schmear_count, c.schmear_grams_each, c.price]), [
    ['perfect-pair',6,1,120,74], ['brunch-pack',12,2,120,140], ['schmear-lover',6,3,120,99]])
  assert.equal(menu.menu_price_confirmation.verified_on, '2026-11-03')
  assert.equal(menu.menu_price_confirmation.source_sha256.length, 3)
})
test('every large and mini pack displays the exact printed base price without asserting mini stock', () => {
  for (const [format, qty, mixed, single] of [['grande',6,60,50], ['grande',12,115,100], ['mini',6,25,20], ['mini',12,40,35], ['mini',24,75,70]]) {
    for (const [mix, price] of [['mixed', mixed], ['single', single]]) {
      const q = api.quotePublishedPack({format, quantity: qty, mix, selection: plain(qty)})
      assert.equal(q.publishedBasePen, price)
      if (format === 'mini') {assert.equal(q.status,'review_required');assert.equal(q.checkoutAllowed,false)}
    }
  }
})
test('Custom Colors reference retains exact minimum and extras without a new transaction path', () => {
  const c = api.getVerifiedDisplayMenu().customColors
  assert.deepEqual([c.minimum_quantity,c.base_price,c.one_two_colors_extra,c.three_five_colors_extra,c.six_seven_rainbow_colors_extra],[6,50,0,10,15])
})
test('published bundle cannot become checkout-ready even with caller-supplied live flags', () => {
  for (const c of menu.combos) {
    const q = api.quotePublishedCombo({comboId:c.id,bagels:plain(c.bagels),schmears:[{flavorId:'whipped-original',quantity:c.schmear_count}]})
    assert.equal(q.publishedBasePen,c.price)
    assert.equal(api.canProceedToCheckout(q,{liveInventoryAvailable:true,currentOfferApproved:true}),false)
  }
})
test('duplicate pot rows cannot bypass composition validation', () => {
  const q = api.quotePublishedCombo({comboId:'brunch-pack',bagels:plain(12),schmears:[{flavorId:'whipped-original',quantity:1},{flavorId:'whipped-original',quantity:1}]})
  assert.equal(q.status,'invalid')
})
