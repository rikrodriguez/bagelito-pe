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
