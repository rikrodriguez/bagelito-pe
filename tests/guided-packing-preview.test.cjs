const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
function load(file){
  if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
  const module={exports:{}}
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  vm.runInNewContext(js,{module,exports:module.exports,Date,require(id){
    if(!id.startsWith('.'))throw Error('Unexpected external dependency '+id)
    const target=path.resolve(path.dirname(file),id);return load(target+(target.endsWith('.json')?'':'.ts'))
  }});return module.exports
}
const api=load(path.join(__dirname,'../src/domain/lib/guided-product-snapshot.ts'))
const reader=load(path.join(__dirname,'../src/server/guided-product-reservation.server.ts'))
const clone=v=>JSON.parse(JSON.stringify(v))
const pot=(flavorId='whipped-original',grams=120,publishedAmountPen=12)=>({kind:'schmear',id:flavorId,quantity:1,bagels:[],schmears:[{flavorId,quantity:1,grams}],publishedAmountPen})
const pack=(qty=6,mix='single')=>({kind:'pack',id:`grande-${qty}-${mix}`,quantity:1,
  bagels:mix==='single'?[{flavorId:'plain',quantity:qty}]:[{flavorId:'plain',quantity:qty/2},{flavorId:'sesame',quantity:qty/2}],schmears:[],publishedAmountPen:50})
const snapshot=(lines=[pot()])=>({orderId:'11111111-1111-4111-8111-111111111111',orderCode:'BAG-FIXTURE',schemaVersion:1,currency:'PEN',
  lines,subtotalMinor:lines.reduce((sum,l)=>sum+l.publishedAmountPen*100,0),deliveryFeeMinor:800,
  amountMinor:lines.reduce((sum,l)=>sum+l.publishedAmountPen*100,0)+800,termsVersion:'2026-10-28',createdAt:'2026-11-02T10:00:00Z',paymentStatus:'pending'})

test('all fifteen confirmed pot choices keep explicit flavor grams and no imaginary bagels',()=>{
  const menu=require('../src/domain/data/verified-menu-2026-10-21.json')
  for(const flavor of menu.schmears)for(const size of menu.schmear_sizes){
    const result=api.buildGuidedPackingPreview(snapshot([pot(flavor.id,size.grams)]))
    assert.equal(result.packing.schmears[0].name,flavor.name);assert.equal(result.packing.schmears[0].grams,size.grams)
    assert.equal(result.packing.schmearGrams,size.grams);assert.equal(result.packing.schmearPots,1);assert.equal(result.packing.bagelUnits,0)
    assert.deepEqual(clone(result.packing.bagels),[])
  }
})
test('four supported pack compositions with optional pot project every physical item',()=>{
  for(const qty of [6,12])for(const mix of ['single','mixed'])for(const withPot of [false,true]){
    const result=api.buildGuidedPackingPreview(snapshot([pack(qty,mix),...(withPot?[pot('aji-amarillo')]:[])]))
    assert.equal(result.packing.bagelUnits,qty);assert.equal(result.packing.schmearPots,withPot?1:0)
    assert.equal(result.packing.bagels[0].name,'Plain');assert.equal(result.lines.length,withPot?2:1)
    assert.equal(result.lines[0].id,`grande-${qty}-${mix}`)
  }
})
test('historical prices are preserved without consulting current menu prices or legal version',()=>{
  const stored=snapshot([pot('whipped-original',180,19)]);stored.termsVersion='2025-01-01';stored.deliveryFeeMinor=900;stored.amountMinor=2800
  const result=api.buildGuidedPackingPreview(stored)
  assert.equal(result.subtotalMinor,1900);assert.equal(result.deliveryFeeMinor,900);assert.equal(result.amountMinor,2800)
  assert.equal(result.lines[0].publishedAmountPen,19);assert.equal(result.termsVersion,'2025-01-01')
})
test('all five payment states are informational only and can never authorize fulfillment',()=>{
  for(const paymentStatus of ['pending','paid','failed','expired','refunded']){
    const result=api.buildGuidedPackingPreview({...snapshot(),paymentStatus,fulfillmentAuthorized:true})
    assert.equal(result.paymentStatus,paymentStatus);assert.equal(result.fulfillmentAuthorized,false);assert.equal(result.viewKind,'commercial-review')
  }
})
test('untrusted extensions and customer or payment identifiers are not copied into packing output',()=>{
  const stored={...snapshot(),email:'private@example.test',sourceId:'tkn_test_private',paymentMetadata:{secret:'private'},checkoutSessionId:'private'}
  stored.lines[0].customer='private'
  const result=api.buildGuidedPackingPreview(stored)
  assert.doesNotMatch(JSON.stringify(result),/private|checkoutSessionId|sourceId|paymentMetadata/)
})
test('projection owns its arrays and cannot mutate the stored record',()=>{
  const stored=snapshot([pack(),pot()]),before=clone(stored),result=api.buildGuidedPackingPreview(stored)
  result.packing.bagels[0].quantity=99;result.lines[0].bagels[0].flavorId='bad';result.packing.schmears[0].grams=240
  assert.deepEqual(stored,before)
})
test('invalid identities versions metadata and integer money fail closed',()=>{
  for(const patch of [{orderId:'bad'},{orderCode:'<script>'},{schemaVersion:2},{currency:'USD'},{termsVersion:null},{createdAt:'bad'},
    {paymentStatus:'captured'},{paymentStatus:{toString(){return'paid'}}},{subtotalMinor:1},{deliveryFeeMinor:-1},{amountMinor:1},
    {subtotalMinor:'1200'},{amountMinor:Infinity},{subtotalMinor:2147483648,amountMinor:2147484448}]){
    assert.throws(()=>api.buildGuidedPackingPreview({...snapshot(),...patch}),/inconsistent/)
  }
})
test('unknown premium duplicate malformed and missing bagel selections never produce a pick list',()=>{
  for(const mutate of [l=>l.bagels=[],l=>l.bagels[0].flavorId='cheddar',l=>l.bagels[0].flavorId='unknown',l=>l.bagels[0].quantity='6',
    l=>l.bagels[0].quantity=5,l=>l.bagels[0].quantity=-6,l=>l.bagels=[{flavorId:'plain',quantity:3},{flavorId:'plain',quantity:3}],
    l=>l.id='grande-6-mixed',l=>l.id='mini-6-single',l=>l.schmears=pot().schmears]){
    const line=pack();mutate(line);assert.throws(()=>api.buildGuidedPackingPreview(snapshot([line])),/inconsistent/)
  }
})
test('unknown mismatched or malformed schmear details are not silently omitted or coerced',()=>{
  for(const mutate of [l=>l.schmears=[],l=>l.schmears[0].flavorId='unknown',l=>l.id='aji-amarillo',l=>l.schmears[0].grams='120',
    l=>l.schmears[0].grams=250,l=>l.schmears[0].quantity=2,l=>l.schmears.push({...l.schmears[0]}),l=>l.bagels=pack().bagels,
    l=>l.quantity=2,l=>l.publishedAmountPen=null,l=>l.kind='combo',l=>l.kind='bagel_extra']){
    const line=pot();mutate(line);assert.throws(()=>api.buildGuidedPackingPreview(snapshot([line])),/inconsistent/)
  }
})
test('unsupported multi-line compositions reject instead of dropping duplicate products',()=>{
  for(const lines of [[],[pot(),pot()],[pot(),pack()],[pack(),pack()],[pack(),pot('whipped-original',180)],[pack(),pot(),pot()]]){
    assert.throws(()=>api.buildGuidedPackingPreview(snapshot(lines)),/inconsistent/)
  }
})
test('injected preview reader issues exactly one read RPC and handles absent snapshots without fallback',async()=>{
  const calls=[],stored=snapshot()
  const result=await reader.readGuidedPackingPreview({rpc:async(name,args)=>{calls.push({name,args});return{data:stored,error:null}}},stored.orderId)
  assert.equal(result.packing.schmearPots,1);assert.equal(calls.length,1);assert.equal(calls[0].name,'read_guided_product_reservation')
  assert.deepEqual(clone(calls[0].args),{p_order_id:stored.orderId})
  assert.equal(await reader.readGuidedPackingPreview({rpc:async()=>({data:null,error:null})},stored.orderId),null)
})
test('injected reader rejects snapshot for a different order and cannot fall back to a bagel-only projection',async()=>{
  const stored=snapshot();stored.orderId='22222222-2222-4222-8222-222222222222';let calls=0
  await assert.rejects(reader.readGuidedPackingPreview({rpc:async()=>{calls++;return{data:stored,error:null}}},snapshot().orderId),/inconsistent/)
  assert.equal(calls,1)
})

test('product persistence and packing remain unexposed by public routes with intake default disabled in SQL source',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
  for(const file of walk(path.join(__dirname,'../src/routes'))){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/guided-product-reservation|guided-product-snapshot|readGuidedPackingPreview|read_guided_product_reservation|create_guided_product_reservation/)
  }
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/add-guided-product-lines.sql'),'utf8')
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/)
  assert.match(sql,/REVOKE ALL ON public\.guided_product_reservation_policy FROM PUBLIC,anon,authenticated,service_role/)
  assert.match(sql,/IF NOT EXISTS\(SELECT 1 FROM public\.guided_product_reservation_policy WHERE singleton AND enabled FOR SHARE\)/)
})
