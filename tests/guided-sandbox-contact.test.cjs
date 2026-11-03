const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')

// Execute the actual cashier JSX and link expression with explicit state and a
// local JSX runtime. No browser, network, provider or navigation is invoked.
const source = fs.readFileSync('src/playable/GuidedCommerce.tsx', 'utf8')
const link = source.match(/  const manualOrderHref = [\s\S]*?\n    : null/)?.[0]
const start = source.indexOf("{scene === 'cashier' &&")
const end = source.indexOf("{scene === 'pay' &&", start)
assert.ok(link && start > 0 && end > start, 'actual cashier and link must exist')
const cashier = source.slice(start, end).trim().slice(1, -1)
const code = ts.transpileModule(`${link}\nmodule.exports = (${cashier})`, {
  fileName: 'actual-cashier.tsx',
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
}).outputText

function render({sandboxMode = false, reviewOnly = false, enabled = true} = {}) {
  const calls = [], module = {exports: {}}
  const jsx = (type, props) => ({type, props})
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(id) {assert.equal(id, 'react/jsx-runtime'); return {jsx, jsxs: jsx}},
    sandboxMode, reviewOnly, manualInquiry: false, manualContact: false, scene: 'cashier', category: 'packs', canReviewAtCashier: true,
    canPayOnline: enabled && !reviewOnly, qaMode: false, quoteLoading: false,
    paymentConfig: {enabled}, checkoutQuote: {checkoutAllowed: enabled, amountPen: 62},
    packFormat: 'grande', packQty: 6, packMix: 'single', selectedCombo: null, schmearSize: 120,
    selectedBagelSummary: [{name: 'Plain', quantity: 6}], selectedSchmearSummary: [],
    setScene() {throw Error('navigation is outside this render test')},
    createManualOrderWhatsAppHref(input) {calls.push(input); return 'https://contact.example.test/fixture'},
  })
  const nodes = [], text = []
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk)
    if (value && typeof value === 'object') {nodes.push(value); walk(value.props?.children)}
    else if (typeof value === 'string' || typeof value === 'number') text.push(String(value))
  }
  walk(module.exports)
  return {calls, nodes, text: text.join(' ')}
}

test('sandbox cashier never generates a commercial link or offers the contact block', () => {
  for (const enabled of [false, true]) {
    const result = render({sandboxMode: true, enabled})
    assert.equal(result.calls.length, 0)
    assert.equal(result.nodes.some(node => node.type === 'a' || node.props?.className === 'guided-launch-contact'), false)
    assert.doesNotMatch(result.text, /WhatsApp|confirmará el precio/)
    assert.match(result.text, /Prueba sandbox con datos autorizados/)
    if (enabled) assert.match(result.text, /Continuar prueba sandbox/)
  }
})

test('ordinary cashier keeps its commercial contact and payment wording by default', () => {
  const result = render()
  assert.equal(result.calls.length, 1)
  assert.equal(result.nodes.filter(node => node.type === 'a').length, 1)
  assert.match(result.text, /Consultar por WhatsApp/)
  assert.match(result.text, /Pagar online de forma segura/)
  assert.doesNotMatch(result.text, /prueba sandbox/i)
})

test('review-only cashier still offers review without a commercial link or payment', () => {
  const result = render({reviewOnly: true})
  assert.equal(result.calls.length, 0)
  assert.equal(result.nodes.some(node => node.type === 'a'), false)
  assert.match(result.text, /Revisar entrega y consentimiento/)
  assert.doesNotMatch(result.text, /Pagar online|prueba sandbox/i)
})

// Execute the actual final render of the Culqi component without its effects.
// This checks copy and disabled states only, never SDK or payment acceptance.
const culqi = fs.readFileSync('src/playable/CulqiBrowserCheckout.tsx', 'utf8')
const culqiTail = culqi.slice(culqi.indexOf('  const customerReady ='), culqi.lastIndexOf('\n}'))
const culqiCode = ts.transpileModule(`function render() {${culqiTail}\n}\nmodule.exports = render()`, {
  fileName: 'actual-culqi-render.tsx',
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
}).outputText
function renderCulqi({sandboxMode = false, enabled = true, status = 'idle', complete = true} = {}) {
  const module = {exports: {}}, jsx = (type, props) => ({type, props})
  vm.runInNewContext(culqiCode, {
    module, exports: module.exports,
    require(id) {assert.equal(id, 'react/jsx-runtime'); return {jsx, jsxs: jsx}},
    sandboxMode, config: {enabled}, status, subtotalPen: 62, message: '',
    customer: {customerName: 'Synthetic Customer', email: 'fixture@example.test', whatsapp: '000000000',
      deliveryAddress: 'Synthetic address', district: 'Lince', termsAccepted: complete},
    startCheckout() {throw Error('SDK invocation is outside this render test')},
    recoverPayment() {throw Error('status lookup is outside this render test')},
  })
  const nodes = [], text = []
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk)
    if (value && typeof value === 'object') {nodes.push(value); walk(value.props?.children)}
    else if (typeof value === 'string' || typeof value === 'number') text.push(String(value))
  }
  walk(module.exports)
  return {nodes, text: text.join(' ')}
}

test('explicit sandbox labels the actual Culqi button in every state without changing disabled behavior', () => {
  for (const status of ['idle', 'loading', 'ready', 'charging', '3ds', 'confirming', 'review', 'error', 'expired']) {
    const sandbox = renderCulqi({sandboxMode: true, status}), ordinary = renderCulqi({status})
    const start = value => value.nodes.find(node => node.props?.className === 'culqi-start-button')
    assert.equal(start(sandbox).props.disabled, start(ordinary).props.disabled, status)
    assert.match(sandbox.text, /Prueba sandbox ·/)
    if (status === 'idle') assert.match(sandbox.text, /Iniciar prueba con Culqi/)
    if (status === 'review') assert.match(sandbox.text, /Consultar estado de la prueba sandbox/)
    assert.doesNotMatch(ordinary.text, /sandbox/i)
  }
  assert.match(renderCulqi().text, /Pagar con Culqi/)
})

test('closed sandbox and incomplete customer remain explicitly marked as a test', () => {
  const closed = renderCulqi({sandboxMode: true, enabled: false})
  assert.match(closed.text, /Prueba sandbox bloqueada/)
  assert.equal(closed.nodes.some(node => node.type === 'button'), false)
  const incomplete = renderCulqi({sandboxMode: true, complete: false})
  assert.match(incomplete.text, /datos de prueba autorizados/)
  assert.equal(incomplete.nodes.find(node => node.props?.className === 'culqi-start-button').props.disabled, true)
  assert.match(renderCulqi({enabled: false}).text, /Checkout Culqi bloqueado/)
})
