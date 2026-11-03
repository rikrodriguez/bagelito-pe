const test = require('node:test'), assert = require('node:assert/strict')
const menu = require('../src/domain/data/verified-menu-2026-10-21.json')

test('current user-supplied schmear menu confirms all three existing price pairs, not an editable draft', () => {
  assert.equal(menu.schmear_price_confirmation.verified_on, '2026-11-02')
  assert.equal(menu.schmear_price_confirmation.source_sha256, 'db730c30cd00acae2f5af50b0684f1ef5f3e4e63068cf02e8c6b33d7489f58f4')
  assert.deepEqual(menu.schmear_sizes.map(row => [row.grams, row.original_price, row.flavoured_price]),
    [[120, 12, 16], [180, 18, 23], [240, 22, 29]])
  assert.equal(menu.source_date, '2026-10-14', 'do not change the original whole-menu source date')
})
test('separate Halloween promotion does not replace ordinary pack or historical combo prices', () => {
  assert.deepEqual(menu.packs.map(row => row.price), [60, 50, 115, 100])
  assert.deepEqual(menu.combos.map(row => row.price), [74, 140, 99])
})
