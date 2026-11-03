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
function cashierLines(j) {
  assert.equal(j.scene(),'cashier')
  const lines=j.nodes().filter(n=>n.props.className==='guided-cashier-lines')
  assert.equal(lines.length,1,'one rendered product summary')
  return lines[0]
}
function assertVisibleSchmearSize(j,grams) {
  const rows=[]
  function walk(node) {
    if(Array.isArray(node))return node.forEach(walk)
    if(!node||typeof node!=='object')return
    if(node.type==='span'&&/Whipped Original/.test(justText(node)))rows.push(node)
    walk(node.props?.children)
  }
  walk(cashierLines(j))
  assert.equal(rows.length,1,'one visible selected schmear row')
  const sizes=justText(rows[0]).match(/\b(?:120|180|240)\s*g\b/g)
  assert.deepEqual(sizes,[grams+' g'],'visible size must match the selected product, not only the contact message')
}
for(const options of [{mix:'single'},{mix:'mixed'},{format:'mini',quantity:24}]) test('manual pack journey '+JSON.stringify(options),()=>{
  const j=pack(options); j.click('Agregar Whipped Original'); j.primary()
  assertVisibleSchmearSize(j,120)
  const message=j.message()
  assert.match(message,new RegExp('Pack de '+(options.quantity||6)+' bagels '+(options.format==='mini'?'minis':'grandes')))
  assert.match(message,/1 × Whipped Original \(120 g\)/)
  assert.match(message,/no confirma ni paga el pedido/)
  if(options.mix==='single') assert.match(message,/6 × Plain/)
  else {const count=(options.quantity||6)/2; assert.match(message,new RegExp(count+' × Plain')); assert.match(message,new RegExp(count+' × Everything'))}
  j.click(n=>n.props.className==='guided-journey-back'); j.click('Agregar Whipped Original'); j.primary()
  assert.doesNotMatch(j.message(),/Whipped Original/)
  assert.doesNotMatch(justText(cashierLines(j)),/Whipped Original|120\s*g/,'removal must clear the visible schmear detail too')
})
for(const combo of [{name:'Perfect Pair',bagels:6,pots:1,price:74},{name:'Brunch Pack',bagels:12,pots:2,price:140},{name:'Schmear Lover',bagels:6,pots:3,price:99}])test('published '+combo.name+' requires exact bagels and schmear count',()=>{
  const j=journey({initialCategory:'combos'});j.click(combo.name);j.click('Agregar Plain')
  j.forceScene('cashier');j.noLink();j.forceScene('bagels')
  for(let i=1;i<combo.bagels;i++)j.click('Agregar Everything')
  j.primary();j.forceScene('cashier');j.noLink();j.forceScene('schmears')
  for(let i=0;i<combo.pots;i++)j.click('Agregar Whipped Original')
  j.primary();assertVisibleSchmearSize(j,120)
  assert.match(j.message(),new RegExp(combo.name))
  assert.match(j.message(),new RegExp(combo.pots+' × Whipped Original \\(120 g\\)'))
  assert.ok(j.text().includes(String(combo.price)))
})
for(const grams of [120,180,240]) test('standalone '+grams+' grams',()=>{
  const j=journey({initialCategory:'schmears'}); j.click(n=>justText(n).replace(/\s+/g,' ').startsWith(grams+' g '))
  j.forceScene('cashier'); j.noLink(); j.forceScene('schmears'); j.click('Agregar Whipped Original'); j.primary()
  assertVisibleSchmearSize(j,grams)
  assert.match(j.message(),new RegExp('Schmear individual \\('+grams+' g\\)')); assert.match(j.message(),new RegExp('Whipped Original \\('+grams+' g\\)'))
})
test('manual contact uses a decorative nonfocusable vector icon without font glyph dependence',()=>{
  const j=pack({mix:'single'});j.click('Agregar Whipped Original');j.primary()
  const links=j.nodes().filter(n=>n.type==='a'&&n.props.href?.startsWith('https://wa.me/'))
  assert.equal(links.length,1)
  const link=links[0],descendants=[]
  function walk(node){if(Array.isArray(node))return node.forEach(walk);if(node&&typeof node==='object'){descendants.push(node);walk(node.props?.children)}}
  walk(link.props.children)
  const icons=descendants.filter(n=>n.type==='svg')
  assert.equal(icons.length,1,'outgoing contact icon must be an inline vector, independent of installed fonts')
  const icon=icons[0]
  assert.ok(icon.props['aria-hidden']===true||icon.props['aria-hidden']==='true','icon is decorative')
  assert.ok(icon.props.focusable===false||icon.props.focusable==='false','icon must not add a keyboard stop')
  assert.ok(icon.props.tabIndex==null||icon.props.tabIndex===-1)
  assert.match(icon.props.viewBox,/^\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+[1-9]\d*(?:\.\d+)?\s+[1-9]\d*(?:\.\d+)?\s*$/)
  assert.ok(descendants.some(n=>n.type==='path'&&typeof n.props.d==='string'&&n.props.d.trim()
    ||n.type==='line'&&n.props.x1!=null&&n.props.y1!=null&&n.props.x2!=null&&n.props.y2!=null
    ||['polyline','polygon'].includes(n.type)&&typeof n.props.points==='string'&&n.props.points.trim()),'vector geometry is present')
  assert.doesNotMatch(justText(link),/↗/)
  assert.match(justText(link),/Consultar mi pedido por WhatsApp/)
  assert.equal(link.props.target,'_blank');assert.match(link.props.rel,/\bnoopener\b/);assert.match(link.props.rel,/\bnoreferrer\b/)
  assert.match(j.message(),/Whipped Original \(120 g\)/)
  assert.match(j.message(),/no confirma ni paga el pedido/)
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

function panelText(j,className) {
  const panels=j.nodes().filter(n=>n.props.className===className)
  assert.equal(panels.length,1,'one visible '+className)
  return justText(panels[0]).replace(/\s+/g,' ').trim()
}
function selectMixedWithOneFlavor(format,quantity) {
  const j=journey({initialCategory:'packs'})
  j.click(format==='mini'?'Mini bagels':'Bagels grandes')
  j.click('Elegir '+quantity+' '+(format==='mini'?'mini bagels':'bagels')+', mixtos')
  for(let i=0;i<quantity;i++)j.click('Agregar Plain')
  j.primary();j.primary();assert.equal(j.scene(),'cashier')
  return j
}
for(const [format,quantity] of [['grande',6],['mini',24]])test('one-flavor selection from mixed '+format+' inquiry uses its actual single composition',()=>{
  const j=selectMixedWithOneFlavor(format,quantity)
  assert.match(j.message(),new RegExp('Pack de '+quantity+' bagels '+(format==='mini'?'minis':'grandes')+' \\(un sabor\\)'))
  assert.match(j.message(),new RegExp(quantity+' × Plain'))
  assert.doesNotMatch(j.message(),/\(mixto\)/,'the inquiry must agree with the canonical same-flavor classification')
})
for(const options of [{mix:'mixed'},{mix:'mixed',format:'mini',quantity:24}])test('two-flavor '+(options.format||'grande')+' inquiry keeps its mixed composition',()=>{
  const j=pack(options);j.primary()
  assert.match(j.message(),/\(mixto\)/);assert.doesNotMatch(j.message(),/\(un sabor\)/)
})
for(const grams of [120,180,240])test('cart review retains selected standalone '+grams+' g context',()=>{
  const j=journey({initialCategory:'schmears'})
  j.click(n=>justText(n).replace(/\s+/g,' ').startsWith(grams+' g '))
  j.click('Agregar Whipped Original');j.primary();j.click('Ver tu pedido:')
  const cart=panelText(j,'guided-store-cart-panel')
  assert.match(cart,/Whipped Original/);assert.match(cart,new RegExp('\\b'+grams+' g\\b'))
  for(const other of [120,180,240].filter(n=>n!==grams))assert.doesNotMatch(cart,new RegExp('\\b'+other+' g\\b'))
})
test('removing the optional pack pot clears its size from cart review',()=>{
  const j=pack({mix:'single'});j.click('Agregar Whipped Original');j.primary();j.click('Ver tu pedido:')
  assert.match(panelText(j,'guided-store-cart-panel'),/120 g/)
  j.click('Cerrar resumen');j.click(n=>n.props.className==='guided-journey-back')
  j.click('Agregar Whipped Original');j.primary();j.click('Ver tu pedido:')
  assert.doesNotMatch(panelText(j,'guided-store-cart-panel'),/Whipped Original|120 g/)
  assert.doesNotMatch(j.message(),/Whipped Original/)
})
for(const options of [{mix:'single',format:'grande',quantity:6},{mix:'mixed',format:'mini',quantity:24}])test('cart and cashier identify '+options.format+' '+options.quantity+' pack before inquiry',()=>{
  const j=pack(options);j.primary()
  const description=new RegExp('Pack de '+options.quantity+' bagels '+(options.format==='mini'?'minis':'grandes'))
  const mix=options.mix==='single'?/un sabor/:/mixto/
  const cashier=panelText(j,'guided-cashier-copy');assert.match(cashier,description);assert.match(cashier,mix)
  j.click('Ver tu pedido:');const cart=panelText(j,'guided-store-cart-panel')
  assert.match(cart,description);assert.match(cart,mix)
})
test('normal standalone-to-pack category change clears the old pot and resets its size',()=>{
  const j=journey({initialCategory:'schmears'})
  j.click(n=>justText(n).replace(/\s+/g,' ').startsWith('240 g '));j.click('Agregar Whipped Original');j.primary()
  j.click('Ir a Entrada');j.click(n=>n.props['aria-label']==='Packs')
  j.click('Bagels grandes');j.click('Un sabor');j.click('Elegir 6 bagels, un sabor');j.noLink()
  j.click('Agregar Plain');j.primary();j.click('Agregar Whipped Original');j.primary()
  assert.match(j.message(),/Pack de 6 bagels grandes \(un sabor\)/)
  assert.match(j.message(),/Whipped Original \(120 g\)/);assert.doesNotMatch(j.message(),/240 g|Schmear individual/)
})
test('normal format change clears the old mini pack quantities and optional pot',()=>{
  const j=pack({mix:'single',format:'mini',quantity:24});j.click('Agregar Whipped Original');j.primary()
  j.click('Ir a Categoría');j.click('Bagels grandes')
  j.click('Elegir 6 bagels, mixtos');j.noLink()
  assert.equal(j.nodes().some(n=>n.props.className==='guided-primary-next'),false,'old 24-unit choice must not complete the new six-pack')
  for(let i=0;i<6;i++)j.click(i%2===0?'Agregar Plain':'Agregar Everything')
  j.primary();j.primary()
  assert.match(j.message(),/Pack de 6 bagels grandes \(mixto\)/)
  assert.doesNotMatch(j.message(),/minis|Whipped Original|24 ×/)
})


test('the physical box mirrors add, remove, full, back and format-reset selection',()=>{
  const j=journey({initialCategory:'packs'})
  j.click('Bagels grandes'); j.click('Elegir 6 bagels, mixtos')
  const count=()=>j.nodes().filter(n=>n.type==='button' && n.props.className==='boutique-box-slot is-filled').length
  assert.equal(count(),0)
  j.click('Agregar Plain');j.click('Agregar Everything');assert.equal(count(),2)
  j.click('Sacar Plain de la caja');assert.equal(count(),1)
  assert.equal(j.nodes().some(n=>n.props.className==='guided-primary-next'),false)
  for(let i=0;i<5;i++)j.click('Agregar Plain')
  assert.equal(count(),6)
  j.click('Agregar Everything');assert.equal(count(),6,'capacity cannot be exceeded')
  j.primary();assert.equal(j.scene(),'schmears')
  j.click(n=>n.props.className==='guided-journey-back');assert.equal(count(),6)
  j.click('Ir a Categoría');j.click('Mini bagels');j.click('Elegir 12 mini bagels, mixtos')
  assert.equal(count(),0,'changing format clears the physical box as well as the order')
})

test('single-flavor box replacement and explicit clear action match the whole-pack behavior',()=>{
  const j=journey({initialCategory:'packs'})
  j.click('Mini bagels');j.click('Un sabor');j.click('Elegir 24 mini bagels, un sabor');j.click('Agregar Plain')
  const slots=()=>j.nodes().filter(n=>n.props.className==='boutique-box-slot is-filled')
  assert.equal(slots().length,24);assert.ok(slots().every(n=>n.type==='span'))
  assert.equal(j.nodes().filter(n=>n.props.className==='boutique-box-clear').length,1)
  j.click('Agregar Everything');assert.equal(slots().length,24)
  assert.ok(slots().every(n=>n.props.children.props.src==='/images/bagel-everything.webp'))
  j.click(n=>n.props.className==='boutique-box-clear');assert.equal(slots().length,0)
  assert.equal(j.nodes().some(n=>n.props.className==='guided-primary-next'),false)
})
