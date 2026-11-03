const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')

// Full GuidedCommerce and ReferenceScene source, real domain functions and JSX
// event handlers. The small hook runner executes effects and dependency changes.
// This is not a browser/layout/focus test or a React reconciliation/StrictMode test.
function journey(extra = {}) {
  const slots = [], cache = new Map(), forbidden = []
  let cursor = 0, dirty = false, effects = [], tree, nodes
  const fail = name => { forbidden.push(name); throw Error('Forbidden '+name) }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) {
        slots[i] = typeof initial === 'function' ? initial() : initial
        // State positions are checked against the declarations below before use.
        if (extra.injectPayment && i === 18) slots[i] = {enabled:true,visualQaAllowed:true}
        if (extra.injectPayment && i === 19) slots[i] = {checkoutAllowed:true,amountPen:62}
      }
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) {slots[i] = next; dirty = true} }]
    },
    useRef(initial) {const i = cursor++; return slots[i] ||= {current: initial}},
    useMemo(fn, deps) {const i = cursor++; const old = slots[i]; if (!old || deps.some((v,j) => !Object.is(v,old.deps[j]))) slots[i] = {deps, value: fn()}; return slots[i].value},
    useEffect(fn, deps) {const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v,j) => !Object.is(v,old.deps[j]))) {slots[i] = {deps}; effects.push(fn)}},
  }
  const jsx = (type, props) => ({type, props: props || {}})
  const window = {location: {search: '?qa=1'}, addEventListener(){}, removeEventListener(){}, get sessionStorage(){return fail('sessionStorage')}, Image: function(){fail('Image')}, setTimeout(){fail('timer')}}
  function load(filename) {
    filename = path.resolve(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = {exports: {}}; cache.set(filename,module)
    if (filename.endsWith('.json')) {module.exports = JSON.parse(fs.readFileSync(filename,'utf8')); return module.exports}
    const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), {fileName: filename, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText
    vm.runInNewContext(code, {module,exports:module.exports,URLSearchParams,window,fetch(){fail('fetch')},require(id){
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}
      if (id.endsWith('.css')) return {}
      if (id.endsWith('/CulqiBrowserCheckout')) return {CulqiBrowserCheckout(){fail('Culqi SDK/component')}}
      if (id.endsWith('/PaidOrderReceiptDetails')) return {PaidOrderReceiptDetails(){fail('receipt')}}
      if (!id.startsWith('.')) throw Error('Unexpected import '+id)
      const base = path.resolve(path.dirname(filename),id)
      const target = [base,base+'.ts',base+'.tsx',base+'.json'].find(p => fs.existsSync(p) && fs.statSync(p).isFile())
      assert.ok(target, id); return load(target)
    }}, {filename})
    return module.exports
  }
  const Component = load('src/playable/GuidedCommerce.tsx').GuidedCommerce
  const props = {onExit(){}, skipEntrance:true, referenceMode:true, manualInquiry:true,...extra}
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (typeof node.type === 'function') return walk(node.type(node.props))
    nodes.push(node); walk(node.props.children)
  }
  function render() {
    let loops = 0
    do {assert.ok(++loops < 20,'effects settle'); cursor=0; effects=[]; dirty=false; tree=Component(props); nodes=[]; walk(tree); effects.forEach(fn => fn())} while(dirty)
    assert.deepEqual(forbidden,[])
    assert.equal(nodes.some(n => ['input','textarea','form','select'].includes(n.type)),false,'no PII form')
    assert.equal(nodes.some(n => /Ir a Pago|Pagar online|Revisar entrega/.test(n.props['aria-label'] || text(n))),false,'no payment UI')
    return api
  }
  function text(node) {if (Array.isArray(node)) return node.map(text).join(' '); if (node && typeof node === 'object') return text(node.props?.children); return typeof node === 'string' || typeof node === 'number' ? String(node) : ''}
  function click(match) {
    const found = nodes.filter(n => n.type === 'button' && (typeof match === 'function' ? match(n) : (n.props['aria-label'] || text(n)).includes(match)))
    assert.equal(found.length,1,'one button '+String(match)); assert.ok(!found[0].props.disabled,'button enabled'); found[0].props.onClick(); return render()
  }
  const api = {render,click, text:()=>text(tree), nodes:()=>nodes, scene:()=>tree.props['data-scene'],
    message(){const links=nodes.filter(n => n.type==='a' && n.props.href?.startsWith('https://wa.me/')); assert.equal(links.length,1); const url=new URL(links[0].props.href); assert.equal(url.pathname,'/51917547745'); return url.searchParams.get('text')},
    noLink(){assert.equal(nodes.some(n=>n.type==='a' && n.props.href?.includes('wa.me')),false)},
    primary(){return click(n => n.props.className === 'guided-primary-next')},
    forceScene(value){slots[0]=value; return render()},
  }
  return render()
}

function pack({mix='mixed',format='grande',quantity=6,...props}={}) {
  const j=journey({initialCategory:'packs',...props})
  j.click(format==='mini'?'Mini bagels':'Bagels grandes')
  if (mix==='single') j.click('Un sabor')
  j.click('Elegir '+quantity+' '+(format==='mini'?'mini bagels':'bagels')+', '+(mix==='single'?'un sabor':'mixtos'))
  j.noLink()
  for(let i=0;i<(mix==='single'?1:quantity);i++) j.click(i%2===0?'Agregar Plain':'Agregar Everything')
  j.primary(); assert.equal(j.scene(),'schmears'); return j
}
for(const options of [{mix:'single'},{mix:'mixed'},{format:'mini',quantity:24}]) test('manual pack journey '+JSON.stringify(options),()=>{
  const j=pack(options); j.click('Agregar Whipped Original'); j.primary()
  const message=j.message()
  assert.match(message,new RegExp('Pack de '+(options.quantity||6)+' bagels '+(options.format==='mini'?'minis':'grandes')))
  assert.match(message,/1 × Whipped Original \(120 g\)/)
  assert.match(message,/no confirma ni paga el pedido/)
  if(options.mix==='single') assert.match(message,/6 × Plain/)
  else {const count=(options.quantity||6)/2; assert.match(message,new RegExp(count+' × Plain')); assert.match(message,new RegExp(count+' × Everything'))}
  j.click(n=>n.props.className==='guided-journey-back'); j.click('Agregar Whipped Original'); j.primary()
  assert.doesNotMatch(j.message(),/Whipped Original/)
})
test('combo requires two bagels and one schmear',()=>{
  const j=journey({initialCategory:'combos'}); j.click('Bagels + schmears'); j.click('Agregar Plain')
  j.forceScene('cashier'); j.noLink(); j.forceScene('bagels'); j.click('Agregar Everything'); j.primary()
  j.forceScene('cashier'); j.noLink(); j.forceScene('schmears'); j.click('Agregar Whipped Original'); j.primary()
  assert.match(j.message(),/2 Bagels \+ Schmear/); assert.match(j.message(),/1 × Plain/); assert.match(j.message(),/1 × Everything/); assert.match(j.message(),/1 × Whipped Original \(120 g\)/)
})
for(const grams of [120,180,240]) test('standalone '+grams+' grams',()=>{
  const j=journey({initialCategory:'schmears'}); j.click(n=>justText(n).replace(/\s+/g,' ').startsWith(grams+' g '))
  j.forceScene('cashier'); j.noLink(); j.forceScene('schmears'); j.click('Agregar Whipped Original'); j.primary()
  assert.match(j.message(),new RegExp('Schmear individual \\('+grams+' g\\)')); assert.match(j.message(),new RegExp('Whipped Original \\('+grams+' g\\)'))
})
function justText(n){if(Array.isArray(n))return n.map(justText).join(' ');if(n&&typeof n==='object')return justText(n.props?.children);return typeof n==='string'||typeof n==='number'?String(n):''}
for(const extra of [{sandboxMode:true},{reviewOnly:true},{sandboxMode:true,reviewOnly:true}]) test('conflicting mode fails closed '+JSON.stringify(extra),()=>{
  const j=pack({mix:'single',...extra});j.primary();j.noLink();j.forceScene('pay');j.noLink();j.forceScene('receipt');j.noLink()
})
test('manual payment scene cannot expose form; incomplete selection has no link',()=>{
  const j=journey(); j.forceScene('cashier');j.noLink();j.forceScene('pay');j.noLink()
})

test('manual cart copy confirms price later and progress excludes payment',()=>{
  const j=pack({mix:'single'}); j.primary(); j.click('Ver tu pedido:')
  assert.match(j.text(),/Precio final por confirmar con Bagelito/); assert.doesNotMatch(j.text(),/Importe validado al pasar por caja/)
  assert.equal(j.nodes().some(n=>n.props['aria-label']==='Ir a Pago'),false)
})

test('even hostile enabled payment and QA state cannot mount payment in manual mode',()=>{
  const source=fs.readFileSync('src/playable/GuidedCommerce.tsx','utf8')
  const stateNames=[...source.matchAll(/const \[([A-Za-z]+),[^\n]+?= useState/g)].map(match=>match[1])
  assert.equal(stateNames[18],'paymentConfig');assert.equal(stateNames[19],'checkoutQuote')
  const j=pack({mix:'single',injectPayment:true}); j.primary(); assert.match(j.message(),/no confirma ni paga/);j.forceScene('pay');j.noLink()
})
