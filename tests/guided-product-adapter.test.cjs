const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function load(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file,'utf8'))
  const module={exports:{}}
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  vm.runInNewContext(js,{module,exports:module.exports,Date,require(id){
    if(!id.startsWith('.'))throw Error('Unexpected external dependency '+id)
    const target=path.resolve(path.dirname(file),id);return load(target+(target.endsWith('.json')?'':'.ts'))
  }});return module.exports
}
const api=load(path.join(__dirname,'../src/server/guided-product-reservation.server.ts'))
const fixture=overrides=>({order:{category:'schmears',bagels:{},schmears:{'whipped-original':1},schmearSize:120,bagelMode:'pack'},
  orderCode:'BAG-FIXTURE',checkoutSessionId:'11111111-1111-4111-8111-111111111111',batchId:'22222222-2222-4222-8222-222222222222',
  expiresAt:new Date(Date.now()+15*60_000).toISOString(),customer:{customerName:'Fixture Customer',email:'fixture@example.test',whatsapp:'000000000',deliveryAddress:'Fixture address 123',district:'Lince',termsAccepted:true,termsVersion:'2026-10-28'},...overrides})
function response(input) {const p=api.prepareGuidedProductReservation(input);return {orderId:'33333333-3333-4333-8333-333333333333',orderCode:input.orderCode,
  checkoutSessionId:p.args.p_checkout_session_id,expiresAt:input.expiresAt,amountMinor:p.amountMinor,subtotalMinor:p.subtotalMinor,deliveryFeeMinor:p.deliveryFeeMinor,currency:'PEN',lines:p.args.p_lines}}

test('adapter derives money from confirmed catalog, not client amount fields',()=>{
  const input=fixture(); input.order.amountPen=1;input.amountMinor=1
  const p=api.prepareGuidedProductReservation(input)
  assert.equal(p.subtotalMinor,1200);assert.equal(p.deliveryFeeMinor,800);assert.equal(p.amountMinor,2000)
  assert.equal(Object.hasOwn(p.args,'p_total_amount'),false)
})
test('adapter normalizes bounded customer data without silently truncating',()=>{
  const input=fixture();input.customer={...input.customer,customerName:' Fixture Customer ',email:' FIXTURE@EXAMPLE.TEST ',addressReference:'  Reference  '}
  const p=api.prepareGuidedProductReservation(input)
  assert.equal(p.args.p_customer.customerName,'Fixture Customer');assert.equal(p.args.p_customer.email,'fixture@example.test');assert.equal(p.args.p_customer.addressReference,'Reference')
  assert.throws(()=>api.prepareGuidedProductReservation({...input,customer:{...input.customer,deliveryNotes:'x'.repeat(501)}}),/Invalid customer/)
})
test('missing affirmative current consent cannot call any RPC',async()=>{
  for(const customer of [{...fixture().customer,termsAccepted:false},{...fixture().customer,termsVersion:'old'}]){
    let calls=0;await assert.rejects(api.persistGuidedProductReservation({rpc(){calls++;throw Error('must not call')}},fixture({customer})),/legal/);assert.equal(calls,0)
  }
})
test('invalid customer, district, identity and expiry fail before persistence',async()=>{
  for(const change of [{checkoutSessionId:'bad'},{batchId:'bad'},{orderCode:'PAY-ME'},{expiresAt:'not-a-date'},
    ...[{customerName:'x'},{email:'bad'},{whatsapp:'1'},{deliveryAddress:'x'},{district:'Unknown'}].map(c=>({customer:{...fixture().customer,...c}}))]){
    let calls=0;await assert.rejects(api.persistGuidedProductReservation({rpc(){calls++;throw Error('must not call')}},fixture(change)));assert.equal(calls,0)
  }
})
test('unpriced extras, combo, mini and premium never create a persistence candidate',()=>{
  const pack={category:'packs',packFormat:'grande',packQty:6,packMix:'single',bagels:{plain:6},schmears:{},schmearSize:120,bagelMode:'pack'}
  for(const order of [{...fixture().order,bagelMode:'downsell2',bagels:{plain:2}},{...pack,packFormat:'mini'},{...pack,bagels:{cheddar:6}},
    {category:'combos',comboId:'two-bagel-schmear',bagelMode:'combo',bagels:{plain:2},schmears:{'whipped-original':1},schmearSize:120}]){
    assert.throws(()=>api.prepareGuidedProductReservation(fixture({order})),/confirmed prices/)
  }
})
test('RPC receives only canonical product lines, customer and server context',async()=>{
  const input=fixture();let observed
  const result=await api.persistGuidedProductReservation({rpc:async(name,args)=>{observed={name,args};return {data:response(input),error:null}}},input)
  assert.equal(observed.name,'create_guided_product_reservation');assert.equal(result.amountMinor,2000)
  assert.equal(observed.args.p_terms_version,'2026-10-28');assert.equal(observed.args.p_customer.termsAccepted,true)
  assert.equal(Object.hasOwn(observed.args.p_customer,'termsVersion'),false)
})
test('RPC errors remain a failure and never leak provider or database details',async()=>{
  await assert.rejects(api.persistGuidedProductReservation({rpc:async()=>({data:null,error:{message:'private fixture database diagnostic'}})},fixture()),error=>/do not initiate payment/.test(error.message)&&!error.message.includes('private fixture'))
})
test('malformed or partial RPC results cannot be accepted as complete reservations',async()=>{
  const input=fixture()
  for(const change of [{amountMinor:1},{subtotalMinor:1},{deliveryFeeMinor:1},{currency:'USD'},{checkoutSessionId:'wrong'},
    {orderId:'wrong'},{orderCode:'wrong'},{expiresAt:'bad'},{expiresAt:'2000-01-01T00:00:00Z'},{lines:[]},{lines:null},
    {lines:[{...response(input).lines[0],schmears:[{flavorId:'aji-amarillo',quantity:1,grams:120}]}]}]){
    await assert.rejects(api.persistGuidedProductReservation({rpc:async()=>({data:{...response(input),...change},error:null})},input),/does not match/)
  }
})
test('JSONB key ordering does not cause a false mismatch on replay',async()=>{
  const input=fixture(), r=response(input), line=r.lines[0]
  r.lines=[{publishedAmountPen:line.publishedAmountPen,schmears:line.schmears,bagels:line.bagels,quantity:line.quantity,id:line.id,kind:line.kind}]
  r.orderCode='BAG-ORIGINAL'
  const result=await api.persistGuidedProductReservation({rpc:async()=>({data:r,error:null})},input)
  assert.equal(result.orderCode,'BAG-ORIGINAL')
})

test('read-only adapter rejects invalid identity before RPC and returns null for no snapshot',async()=>{
  let calls=0
  const db={rpc:async()=>{calls++;return {data:null,error:null}}}
  await assert.rejects(api.readGuidedProductReservation(db,'bad'),/identity/);assert.equal(calls,0)
  assert.equal(await api.readGuidedProductReservation(db,'33333333-3333-4333-8333-333333333333'),null);assert.equal(calls,1)
})
test('snapshot read validates version and stored monetary consistency without current catalog repricing',async()=>{
  const r={...response(fixture()),schemaVersion:1,termsVersion:'2026-10-28',paymentStatus:'paid'}
  for(const change of [{schemaVersion:2},{subtotalMinor:1},{deliveryFeeMinor:-1},{amountMinor:1},{currency:'USD'},
    {lines:[{...r.lines[0],publishedAmountPen:'12'}]},{lines:[{...r.lines[0],bagels:null}]}]){
    await assert.rejects(api.readGuidedProductReservation({rpc:async()=>({data:{...r,...change},error:null})},r.orderId),/inconsistent/)
  }
  const historical={...r,subtotalMinor:1300,amountMinor:2100,lines:[{...r.lines[0],publishedAmountPen:13}]}
  assert.equal((await api.readGuidedProductReservation({rpc:async()=>({data:historical,error:null})},r.orderId)).subtotalMinor,1300)
})
test('snapshot read errors are not treated as missing products or leaked diagnostics',async()=>{
  await assert.rejects(api.readGuidedProductReservation({rpc:async()=>({data:null,error:{message:'private fixture'}})},'33333333-3333-4333-8333-333333333333'),error=>/Could not read/.test(error.message)&&!error.message.includes('private'))
})
