/** Non-transactional order fallback smoke test, no network or secrets. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const src = fs.readFileSync(path.join(__dirname, '../src/domain/lib/manual-order.ts'), 'utf8')
const output = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
})
assert.equal(output.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error), false)
const loaded = { exports: {} }
new Function('module', 'exports', output.outputText)(loaded, loaded.exports)
const { formatManualOrderInquiry, createManualOrderWhatsAppHref, BAGELITO_WHATSAPP_PHONE } = loaded.exports

assert.equal(BAGELITO_WHATSAPP_PHONE, '51917547745')

const mixed = {
  category: 'packs',
  format: 'mini',
  packQuantity: 12,
  packMix: 'mixed',
  bagels: [{ name: 'Plain', quantity: 5 }, { name: 'Everything', quantity: 7 }],
  schmears: [{ name: 'Ají Amarillo', quantity: 1 }],
}
const message = formatManualOrderInquiry(mixed)
assert.match(message, /Pack de 12 bagels minis \(mixto\)/)
assert.match(message, /5 × Plain/)
assert.match(message, /7 × Everything/)
assert.match(message, /1 × Ají Amarillo/)
assert.match(message, /precio final, el delivery y la fecha/)
assert.match(message, /no confirma ni paga el pedido/)
assert.doesNotMatch(message, /pagado|reserva confirmada|S\/\d+/)

const url = new URL(createManualOrderWhatsAppHref(mixed))
assert.equal(url.host, 'wa.me')
assert.equal(url.pathname, '/51917547745')
assert.equal(url.searchParams.get('text'), message)

const combo = formatManualOrderInquiry({
  category: 'combos',
  comboName: '2 Bagels + Schmear',
  bagels: [{ name: 'Blueberry', quantity: 2 }],
  schmears: [{ name: 'Classic Strawberry', quantity: 1 }],
})
assert.match(combo, /2 Bagels \+ Schmear/)
assert.match(combo, /2 × Blueberry/)
assert.match(combo, /Classic Strawberry/)

const standalone = formatManualOrderInquiry({
  category: 'schmears',
  schmearSizeGrams: 240,
  bagels: [],
  schmears: [{ name: 'Whipped Original', quantity: 1 }],
})
assert.match(standalone, /Schmear individual \(240 g\)/)
assert.match(standalone, /Whipped Original \(240 g\)/)

console.log('Bagelito manual launch fallback: 4/4 cases passed')
