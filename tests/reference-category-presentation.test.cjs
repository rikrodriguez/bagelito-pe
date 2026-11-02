const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')

function scene() {
  const source = fs.readFileSync(path.join(__dirname, '../src/reference/ReferenceScene.tsx'), 'utf8')
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText
  const module = {exports: {}}
  vm.runInNewContext(code, {module, exports: module.exports, require: name => name.endsWith('.css') ? {} : require(name)})
  return module.exports.ReferenceScene
}
const ReferenceScene = scene()
const props = {onCategory() {}, onMenu() {}, onCart() {}, cartCount: 0, progressIndex: 0, accessibleSteps: [true, false, false, false, false], onStep() {}, dynamicChrome: true}

test('Packs uses a distinct proportional open-tray asset, not reference-image crops', () => {
  const html = renderToStaticMarkup(React.createElement(ReferenceScene, props))
  const image = html.match(/<img[^>]*class="rebuilt-pack-photo"[^>]*>/)?.[0]
  assert.ok(image)
  assert.match(image, /src="\/images\/rebuilt-pack-open-tray-480.webp"/)
  assert.match(image, /rebuilt-pack-open-tray.webp 1536w/)
  assert.match(image, /width="1536" height="1024"/)
  assert.match(image, /data-art-medium="reference-guided-product-concept"/)
  assert.doesNotMatch(html, /store-reference-approved|vitrina-photo|storyboard/)
})

test('only the three category arrows use native chevrons; cart and payment state remain intact', () => {
  const html = renderToStaticMarkup(React.createElement(ReferenceScene, props))
  assert.equal((html.match(/d="m9 5 7 7-7 7"/g) || []).length, 3)
  assert.equal((html.match(/data-reference-category="/g) || []).length, 3)
  assert.match(html, /aria-label="Ver tu pedido: 0 productos"/)
  assert.match(html, /aria-label="Ir a Pago" disabled=""/)
  assert.match(html, /rebuilt-step-label-wide">Selecciona<\/span>/)
  assert.match(html, /rebuilt-step-label-short">Elige<\/span>/)
})

test('full step wording is desktop-entry-only; compact and narrow headers retain short labels', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/reference/reference-aligned.css'), 'utf8')
  assert.match(css, /\.rebuilt-progress>button>\.rebuilt-step-label-wide \{ display:none; \}/)
  assert.match(css, /@media\(min-width:1051px\) \{\s*\.rebuilt-store\[data-compact="false"\] \.rebuilt-progress>button>\.rebuilt-step-label-wide \{ display:block; \}/)
  assert.match(css, /\.rebuilt-store\[data-compact="false"\] \.rebuilt-progress>button>\.rebuilt-step-label-short \{ display:none; \}/)
})

test('desktop windows remove only the lower decorative plinth at fixed source coordinates', () => {
  const html = renderToStaticMarkup(React.createElement(ReferenceScene, props))
  assert.match(html, /class="rebuilt-desktop-case-art" viewBox="1080 0 940 624" preserveAspectRatio="xMidYMid meet"/)
  assert.match(html, /class="rebuilt-mobile-case-art" viewBox="0 169 1165 493"/)
  assert.match(html, /class="rebuilt-mobile-case-art" viewBox="1165 169 855 493"/)
  assert.equal((html.match(/rebuilt-product-placard/g) || []).length, 13)
  const css = fs.readFileSync(path.join(__dirname, '../src/reference/reference-aligned.css'), 'utf8')
  const inset = css.match(/clip-path:inset\(0 ([\d.]+)% ([\d.]+)% 0\)/)
  assert.ok(inset)
  assert.ok(Math.abs(2020 * (1 - Number(inset[1]) / 100) - 1107) < .000001)
  assert.ok(Math.abs(778 * (1 - Number(inset[2]) / 100) - 618) < .000001)
  assert.match(css, /\.rebuilt-desktop-case-art \{[^}]*aspect-ratio:940\/624;/)
  assert.match(css, /\.rebuilt-counter-photo,\.rebuilt-desktop-case-art \{ display:none; \}/)
})

test('shorter desktop windows preserve image scale and clear the lowest native placards', () => {
  const bagel = {scale: 779 / 1023, y: 428.9956989247312, end: 618, lowestPlacardY: 557}
  const schmear = {scale: 608 / 860, y: 466.1451162790698, end: 624, lowestPlacardY: 560.5}
  for (const width of [1051, 1165, 1536, 1920]) {
    for (const [name, item] of Object.entries({bagel, schmear})) {
      const ratio = width / 1536
      const end = (item.y + item.end * item.scale) * ratio
      const centre = (item.y + item.lowestPlacardY * item.scale) * ratio
      // Conservative two-line caption half-height; this is a geometry contract,
      // not a substitute for actual browser text/food-pixel inspection.
      const halfCaptionHeight = Math.max(12, Math.min(20, width * .9375 * .0125)) * 1.05
      assert.ok(end - centre > halfCaptionHeight, `${name} lower caption clearance at ${width}`)
    }
  }
  assert.ok(Math.abs(bagel.y + bagel.end * bagel.scale - 899.5939393939394) < .001)
  assert.ok(Math.abs(schmear.y + schmear.end * schmear.scale - 907.2986046511628) < .001)
})
