const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')

function scene() {
  function load(file) {
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file,'utf8'))
    const source=fs.readFileSync(file,'utf8')
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
    const module={exports:{}}
    vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
      if(name.endsWith('.css'))return {}
      if(!name.startsWith('.'))return require(name)
      const resolved=path.resolve(path.dirname(file),name)
      return load([resolved,resolved+'.ts',resolved+'.tsx',resolved+'.json'].find(p=>fs.existsSync(p)))
    }})
    return module.exports
  }
  return load(path.join(__dirname,'../src/reference/ReferenceScene.tsx')).ReferenceScene
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

test('separate display buttons keep real text outside the photograph with numbered trays', () => {
  const html = renderToStaticMarkup(React.createElement(ReferenceScene, props))
  assert.equal((html.match(/class="boutique-display boutique-display-/g) || []).length, 2)
  assert.match(html, /aria-label="Acercarte a la vitrina de bagels"/)
  assert.match(html, /aria-label="Acercarte a la vitrina de schmears"/)
  assert.match(html, /viewBox="0 169 1165 493"/)
  assert.match(html, /viewBox="1165 169 855 493"/)
  assert.equal((html.match(/class="boutique-tray-number"/g) || []).length, 13)
  assert.equal((html.match(/class="boutique-flavour-legend"/g) || []).length, 2)
  assert.doesNotMatch(html, /rebuilt-product-placard|rebuilt-case-link|logoInitialBPath/)
  assert.match(html, /Herb &amp; Roasted Garlic/)
})

test('the authentic supplied logo is used without font reconstruction or gallery badge', () => {
  const html = renderToStaticMarkup(React.createElement(ReferenceScene, props))
  assert.match(html, /href="\/images\/bagelito-authentic-logo.jpeg"/)
  assert.match(html, /viewBox="110 20 1080 270"/)
  assert.match(html, /clipPath id="bagelito-authentic-crop"/)
  assert.doesNotMatch(html, /rebuilt-initial-b|bagelito-a-counter|bagelito-tagline-curve/)
  assert.ok(fs.statSync(path.join(__dirname, '../public/images/bagelito-authentic-logo.jpeg')).size > 1000)
})

test('very narrow native-zoom layouts reflow categories and progress without smaller text', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/reference/reference-aligned.css'), 'utf8')
  const zoom = css.slice(css.indexOf('@media(max-width:300px)'))
  assert.match(zoom, /\.rebuilt-categories \{ grid-template-columns:minmax\(0,1fr\); \}/)
  assert.match(zoom, /grid-template-columns:88px minmax\(0,1fr\)/)
  assert.match(zoom, /\.rebuilt-progress \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\); \}/)
  assert.doesNotMatch(zoom, /font-size|transform:scale|zoom:|overflow:hidden|overflow:clip/)
})
