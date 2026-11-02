const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const root=path.resolve(__dirname,'..')
function load(file,cache=new Map()){
 if(cache.has(file))return cache.get(file)
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
 const module={exports:{}};cache.set(file,module.exports)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,Date,require(id){
  if(id==='react/jsx-runtime')return require(id)
  if(!id.startsWith('.'))throw Error('Unexpected runtime import '+id)
  const p=path.resolve(path.dirname(file),id);return load(p+(p.endsWith('.json')?'':fs.existsSync(p+'.ts')?'.ts':'.tsx'),cache)
 }});return module.exports
}
const api=load(path.join(root,'src/domain/lib/paid-order-receipt.ts'))
const bridge=load(path.join(root,'src/server/guided-paid-receipt.server.ts'))
const {PaidOrderReceiptDetails}=load(path.join(root,'src/playable/PaidOrderReceiptDetails.tsx'))
const clone=v=>JSON.parse(JSON.stringify(v))
const orderId='11111111-1111-4111-8111-111111111111',orderCode='BAG-ORIGINAL'
const pot=(flavorId='whipped-original',grams=120,price=12)=>({kind:'schmear',id:flavorId,quantity:1,bagels:[],schmears:[{flavorId,quantity:1,grams}],publishedAmountPen:price})
const pack=(qty=6,mix='single')=>({kind:'pack',id:`grande-${qty}-${mix}`,quantity:1,bagels:mix==='single'?[{flavorId:'sesame',quantity:qty}]:[{flavorId:'plain',quantity:qty/2},{flavorId:'sesame',quantity:qty/2}],schmears:[],publishedAmountPen:50})
const snapshot=(lines=[pot()])=>({orderId,orderCode,schemaVersion:1,currency:'PEN',paymentStatus:'paid',lines,subtotalMinor:lines.reduce((n,l)=>n+l.publishedAmountPen*100,0),deliveryFeeMinor:800,
 amountMinor:lines.reduce((n,l)=>n+l.publishedAmountPen*100,0)+800,termsVersion:'2026-10-28',createdAt:'2026-11-02T10:00:00Z'})
const status=(snap)=>({ok:true,orderCode,amountPen:snap?snap.amountMinor/100:20,paymentStatus:'paid',orderStatus:'payment_confirmed',reconciliationRequired:false,...(snap?{productSnapshot:snap}:{})})
const receipt=snap=>api.confirmPaidOrderReceipt(status(snap),{orderCode,amountMinor:snap?snap.amountMinor:2000})
const context={orderId,orderCode,amountMinor:2000,paymentStatus:'paid',orderStatus:'payment_confirmed',reconciliationRequired:false}

test('valid legacy payment observation is distinct from unavailable product detail',()=>{
 const result=receipt();assert.equal(result.detailsAvailable,false);assert.deepEqual(clone(result.items),[])
 assert.equal(result.subtotalMinor,null);assert.equal(result.deliveryFeeMinor,null);assert.equal(result.amountMinor,2000)
 assert.equal(result.fulfillmentAuthorized,false);assert.equal(result.isFiscalReceipt,false)
})
test('code amount status transport and reconciliation must all agree before a paid receipt',()=>{
 for(const change of [{ok:false},{orderCode:'BAG-OTHER'},{orderStatus:'cancelled'},{orderStatus:'needs_correction'},
  {reconciliationRequired:true},{reconciliationRequired:undefined},{amountPen:-1},{amountPen:NaN},{amountPen:'20'},{amountPen:20.001},
  {amountPen:21},{currency:'USD'},...['pending','failed','expired','refunded'].map(paymentStatus=>({paymentStatus}))]){
  assert.throws(()=>api.confirmPaidOrderReceipt({...status(),...change},{orderCode,amountMinor:2000}),/No se pudo verificar/)
 }
})
test('all status observations must match identity and amount before recovery can be removed',()=>{
 for(const paymentStatus of ['pending','paid','failed','expired','refunded']){
  const observed=api.parsePaymentStatusObservation({...status(),paymentStatus},{orderCode,amountMinor:2000})
  assert.equal(observed.paymentStatus,paymentStatus)
  assert.throws(()=>api.parsePaymentStatusObservation({...status(),paymentStatus,orderCode:'BAG-OTHER'},{orderCode}),/No se pudo verificar/)
 }
})
test('all fifteen pot choices retain trusted names quantities grams and no invented bagels',()=>{
 const menu=require('../src/domain/data/verified-menu-2026-10-21.json')
 for(const flavor of menu.schmears)for(const size of menu.schmear_sizes){
  const amount=flavor.price_class==='original'?size.original_price:size.flavoured_price
  const result=receipt(snapshot([pot(flavor.id,size.grams,amount)]))
  assert.equal(result.detailsAvailable,true);assert.equal(result.items.length,1);assert.equal(result.items[0].kind,'schmear')
  assert.equal(result.items[0].name,flavor.name);assert.equal(result.items[0].grams,size.grams);assert.equal(result.items[0].quantity,1)
  assert.equal(result.amountMinor,amount*100+800)
 }
})
test('supported packs retain each selected flavor and optional pot without consuming an editable cart',()=>{
 for(const qty of [6,12])for(const mix of ['single','mixed'])for(const withPot of [false,true]){
  const result=receipt(snapshot([pack(qty,mix),...(withPot?[pot('aji-amarillo',120,16)]:[])]))
  assert.equal(result.items.filter(i=>i.kind==='bagel').reduce((n,i)=>n+i.quantity,0),qty)
  assert.equal(result.items.filter(i=>i.kind==='schmear').length,withPot?1:0)
 }
})
test('supplied mismatched malformed or unpaid snapshots cannot silently degrade to missing detail',()=>{
 for(const change of [{orderCode:'BAG-OTHER'},{paymentStatus:'pending'},{amountMinor:1},{lines:[]},{schemaVersion:2}]){
  assert.throws(()=>api.confirmPaidOrderReceipt({...status(snapshot()),productSnapshot:{...snapshot(),...change}},{orderCode}),/No se pudo verificar/)
 }
 for(const value of [false,[],{},'bad'])assert.throws(()=>api.confirmPaidOrderReceipt({...status(),productSnapshot:value},{orderCode}),/No se pudo verificar/)
})
test('historical values are preserved and response extensions cannot inject customer or payment data',()=>{
 const snap=snapshot([pot('whipped-original',180,19)]),observed={...status(snap),cart:{plain:6},email:'private',sourceId:'private',fulfillmentAuthorized:true}
 const result=api.confirmPaidOrderReceipt(observed,{orderCode})
 assert.equal(result.subtotalMinor,1900);assert.equal(result.amountMinor,2700)
 assert.doesNotMatch(JSON.stringify(result),/private|sourceId|cart/);assert.equal(result.fulfillmentAuthorized,false)
 snap.lines[0].schmears[0].grams=240;assert.equal(result.items[0].grams,180)
})
test('injected private bridge reads exactly the known order and returns complete non-fiscal detail',async()=>{
 const calls=[],result=await bridge.readGuidedPaidOrderReceipt({rpc:async(name,args)=>{calls.push({name,args});return{data:snapshot(),error:null}}},context)
 assert.equal(calls.length,1);assert.equal(calls[0].name,'read_guided_product_reservation')
 assert.deepEqual(clone(calls[0].args),{p_order_id:orderId});assert.equal(result.items[0].grams,120);assert.equal(result.fulfillmentAuthorized,false)
})
test('unconfirmed or contradictory payment context never reads products from the private bridge',async()=>{
 for(const change of [{paymentStatus:'pending'},{orderStatus:'cancelled'},{reconciliationRequired:true},{amountMinor:0},{orderCode:'bad'}]){
  let calls=0;await assert.rejects(bridge.readGuidedPaidOrderReceipt({rpc:async()=>{calls++;throw Error('must not run')}},{...context,...change}))
  assert.equal(calls,0)
 }
})
test('bridge refuses absent corrupt wrong-order or unpaid snapshots without fallback or re-reservation',async()=>{
 for(const data of [null,{...snapshot(),orderId:'22222222-2222-4222-8222-222222222222'},{...snapshot(),paymentStatus:'pending'},{...snapshot(),lines:[]}]){
  let calls=0;await assert.rejects(bridge.readGuidedPaidOrderReceipt({rpc:async(name)=>{calls++;assert.equal(name,'read_guided_product_reservation');return{data,error:null}}},context))
  assert.equal(calls,1)
 }
})
test('actual React summary renders server detail grams delivery and explicit non-fiscal boundary',()=>{
 const html=renderToStaticMarkup(React.createElement(PaidOrderReceiptDetails,{receipt:receipt(snapshot([pack(),pot('aji-amarillo',120,16)]))}))
 assert.match(html,/Sesame/);assert.match(html,/Ají Amarillo/);assert.match(html,/120 g/);assert.match(html,/Delivery/);assert.match(html,/S\/ 8\.00/);assert.match(html,/S\/ 74\.00/)
 assert.match(html,/No es comprobante fiscal ni autorización de despacho/);assert.doesNotMatch(html,/<button|<script|<a |Plain|Pagar|Confirmado/)
})
test('React summary without stored products shows missing detail instead of placeholders or cart names',()=>{
 const html=renderToStaticMarkup(React.createElement(PaidOrderReceiptDetails,{receipt:receipt()}))
 assert.match(html,/detalle de productos aún no está disponible/);assert.match(html,/carrito actual/);assert.match(html,/S\/ 20\.00/)
 assert.doesNotMatch(html,/Whipped|Plain|Sesame|120 g|Productos<|Delivery</)
})
test('real guided receipt consumes immutable evidence; cart summaries remain in explicitly labeled QA only',()=>{
 const source=fs.readFileSync(path.join(root,'src/playable/GuidedCommerce.tsx'),'utf8')
 const block=source.slice(source.indexOf("{!reviewOnly && scene === 'receipt'"),source.indexOf("{!referenceMode && !reviewOnly && scene === 'wallet'"))
 assert.match(block,/qaMode \? <>[\s\S]*selectedBagelSummary[\s\S]*Este recibo es solo una vista de QA/)
 const real=block.slice(block.indexOf('</> : paidReceipt'))
 assert.match(real,/<PaidOrderReceiptDetails receipt=\{paidReceipt\}/);assert.doesNotMatch(real,/selectedBagelSummary|selectedSchmearSummary|paidAmountPen/)
})
test('private receipt bridge is not imported by any route or browser module',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
 for(const file of [...walk(path.join(root,'src/routes')),...walk(path.join(root,'src/playable'))]){
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/guided-paid-receipt\.server|readGuidedPaidOrderReceipt/)
 }
})
