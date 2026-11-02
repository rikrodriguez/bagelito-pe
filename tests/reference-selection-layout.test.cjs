const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const css = fs.readFileSync(path.resolve(__dirname, '../src/reference/rebuilt-flow.css'), 'utf8')
const start = css.indexOf('/* Product selection inherits')
const selection = css.slice(start)

test('reference-only selection styles preserve the existing storefront and legacy commerce', () => {
  assert.ok(start > 0)
  // Each actual selector is explicitly rooted in the reference-only storefront.
  for (const line of selection.split('\n').filter(line => line.includes('{') && !line.trim().startsWith('@'))) {
    assert.match(line, /^\s*\.reference-storefront \.guided-commerce\.reference-mode\[data-reference-mode="true"\]/)
  }
  assert.doesNotMatch(selection, /url\(|@import|animation:|transition:/)
})

test('quantity row is removed from normal flow with a reserved button action area', () => {
  assert.match(selection, /min-height:278px;padding:18px 12px 68px/)
  assert.match(selection, /min-height:254px;padding:14px 8px 66px/)
  assert.match(selection, /\.mobile-product-count\{\s*position:absolute;/)
  assert.match(selection, /width:44px;height:44px/)
  assert.match(selection, /pointer-events:none/)
  assert.match(selection, /\.mobile-product-count>button\{\s*pointer-events:auto/)
  assert.match(selection, /:has\(\.mobile-product-count\)>button>b\{color:transparent!important\}/,
    'The legacy !important white check must be suppressed when the quantity occupies its circle')
})

test('selection has a readable hierarchy, focus and narrow-zoom reflow', () => {
  assert.match(selection, /header>h2\{\s*grid-column:1;grid-row:2/)
  assert.match(selection, /header>span\{grid-column:1;grid-row:3/)
  assert.match(selection, /font-size:18px!important;line-height:1.25/)
  assert.match(selection, /:focus-visible\{\s*outline:3px solid #c55e4a/)
  assert.match(selection, /@media\(max-width:300px\)/)
  assert.match(selection, /grid-template-columns:minmax\(0,1fr\)!important/)
})
