const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),clone=v=>JSON.parse(JSON.stringify(v))
const session='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222',orderCode='BAG-FIXTURE'
const defaultRow=()=>({id:orderId,order_code:orderCode,checkout_session_id:session,payment_expires_at:'2026-11-02T12:00:00Z',total_amount:'70.00',pack_slug:'guided-v1:6-single',payment_currency:'PEN',payment_amount_minor:7000})
const paid=()=>({paymentStatus:'paid',orderStatus:'payment_confirmed',reconciliationRequired:false})
const snapshot=()=>({orderId,orderCode,schemaVersion:1,currency:'PEN',paymentStatus:'paid',
 subtotalMinor:6200,deliveryFeeMinor:800,amountMinor:7000,termsVersion:'2026-10-28',createdAt:'2026-11-02T10:00:00Z',
 lines:[{kind:'pack',id:'grande-6-single',quantity:1,bagels:[{flavorId:'sesame',quantity:6}],schmears:[],publishedAmountPen:50},
 {kind:'schmear',id:'whipped-original',quantity:1,bagels:[],schmears:[{flavorId:'whipped-original',quantity:1,grams:120}],publishedAmountPen:12}]})
function setup(options={}){
 const effects={clients:0,security:0,queries:[],rpc:[],deadlines:[],signals:[]},cache=new Map()
 const env={PAYMENT_PROVIDER:'culqi',CULQI_MODE:'sandbox',VERCEL_ENV:'preview',PUBLIC_SITE_URL:'https://qa.example.test',
 CULQI_PUBLIC_KEY:'pk_test_fixture',CULQI_SECRET_KEY:'sk_test_fixture',CULQI_RSA_ID:'fixture',CULQI_RSA_PUBLIC_KEY:'fixture',
 CULQI_ENABLED:'false',CULQI_TANSTACK_BRIDGE_READY:'true',CULQI_TANSTACK_WEBHOOK_READY:'true',CULQI_TANSTACK_CLIENT_READY:'true',...options.env}
 let clock=Date.now(),step=0; const advanceClock=()=>{clock+=options.advanceClockSteps?.[step++]??options.advanceClockMs??0}; class FixtureDate extends Date {static now(){return options.advanceClockMs||options.advanceClockSteps?clock:Date.now()}}
 const db={from(table){assert.equal(table,'orders');const query={filters:[],columns:null};effects.queries.push(query)
  return {select(columns){query.columns=columns;return this},eq(k,v){query.filters.push([k,v]);return this},abortSignal(signal){assert.ok(signal instanceof AbortSignal);effects.signals.push(signal);return this},async maybeSingle(){
   advanceClock();
   if(options.queryReject)throw Error('private db diagnostic fixture@example.test')
   if(options.queryEnvelope!==undefined)return options.queryEnvelope
   let row=options.row===undefined?defaultRow():options.row
   if(options.rows)row=options.rows[Math.min(effects.queries.length-1,options.rows.length-1)]
   return {data:row&&query.filters.every(([k,v])=>row[k]===v)?clone(row):null,error:null}
  }}},rpc(name,args){effects.rpc.push({name,args:clone(args)});return{abortSignal(signal){assert.ok(signal instanceof AbortSignal);effects.signals.push(signal);return this},then(resolve,reject){return Promise.resolve().then(()=>{
   advanceClock();
   if(options.hangRpc===name)return new Promise(()=>{});
   if(options.rpcReject===name)throw Error('private transport token_fixture fixture@example.test')
   if(options.rpcEnvelopes?.[name]!==undefined)return options.rpcEnvelopes[name]
   if(name==='expire_culqi_token_session'){
    assert.equal(args.p_order_id,orderId);assert.equal(args.p_checkout_session_id,session)
    const index=effects.rpc.filter(c=>c.name===name).length-1
    return {data:options.states?options.states[Math.min(index,options.states.length-1)]:options.state??paid(),error:null}
   }
   assert.equal(name,'read_guided_product_reservation');assert.deepEqual(clone(args),{p_order_id:orderId})
   return {data:options.snapshot===undefined?snapshot():options.snapshot,error:null}
  }).then(resolve,reject)}}}}
 class PublicApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
 function load(file){if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
  const module={exports:{}};cache.set(file,module.exports)
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,Date:FixtureDate,URL,Request,Response,TextDecoder,Uint8Array,AbortController,setTimeout(fn,ms){effects.deadlines.push(ms);return setTimeout(fn,ms)},clearTimeout,process:{env},
   AbortSignal:{timeout(ms){effects.deadlines.push(ms);return AbortSignal.timeout(ms)}},require(id){
    if(id==='@tanstack/react-router')return {createFileRoute:()=>value=>value}
    if(id.endsWith('public-api-security.server'))return{PublicApiError,enforcePublicApiSecurity:async({scope})=>{effects.security++;assert.equal(scope,'payments');if(options.securityDenied)throw new PublicApiError('Too many attempts. Please try again later.',429)}}
    if(id.endsWith('supabase-admin.server'))return{createSupabaseAdminClient:()=>{effects.clients++;return db}}
    if(!id.startsWith('.'))throw Error('Forbidden external import '+id)
    const p=path.resolve(path.dirname(file),id);return load(p+(p.endsWith('.json')?'':'.ts'))
   }});return module.exports}
 const route=load(path.join(root,'src/routes/api/payments/culqi/status.ts')).Route.server.handlers.POST
 return{effects,api:load(path.join(root,'src/domain/lib/paid-order-receipt.ts')),async request(payload={},headers={},url='https://qa.example.test'){
  const response=await route({request:new Request(url+'/api/payments/culqi/status',{method:'POST',headers:{'content-type':'application/json',origin:url,...headers},body:typeof payload==='string'?payload:JSON.stringify({checkoutSessionId:session,orderCode,...payload})})})
  for(const name of ['cache-control','cdn-cache-control'])assert.match(response.headers.get(name),/no-store/)
  assert.equal(response.headers.get('x-content-type-options'),'nosniff')
  return {status:response.status,body:await response.json()}
 }}
}
const enabled=options=>setup({...options,env:{BAGELITO_GUIDED_RECEIPT_ENABLED:'true',...options?.env}})
const reads=f=>f.effects.rpc.filter(x=>x.name==='read_guided_product_reservation').length

test('receipt disclosure defaults closed; only exact true enables the server gate',async()=>{
 for(const flag of [undefined,'false','TRUE','1',' true ']){const f=setup({env:{BAGELITO_GUIDED_RECEIPT_ENABLED:flag}}),r=await f.request();assert.equal(r.status,200);assert.equal(r.body.productReceipt,undefined);assert.equal(reads(f),0)}
})
test('authorized sandbox paid status exposes minimal complete receipt and actual client consumes it',async()=>{
 const f=enabled(),r=await f.request();assert.equal(r.status,200);assert.equal(reads(f),1);assert.equal(f.effects.queries.length,2)
 assert.equal(f.effects.rpc.filter(x=>x.name==='expire_culqi_token_session').length,2)
 const receipt=f.api.confirmPaidOrderReceipt(r.body,{orderCode,amountMinor:7000});assert.equal(receipt.detailsAvailable,true)
 assert.equal(receipt.items[0].name,'Sesame');assert.equal(receipt.items[1].grams,120);assert.equal(receipt.amountMinor,7000)
 assert.equal(receipt.fulfillmentAuthorized,false);assert.equal(receipt.isFiscalReceipt,false)
 assert.doesNotMatch(JSON.stringify(r.body),/orderId|checkoutSessionId|termsVersion|createdAt|email|whatsapp|token|sourceId|fixture@example/)
 assert.equal(f.effects.security,1);assert.ok(f.effects.signals.length===5&&f.effects.deadlines.every(ms=>ms>0&&ms<=2000))
 for(const q of f.effects.queries){assert.deepEqual(q.filters,[['order_code',orderCode],['checkout_session_id',session]]);assert.doesNotMatch(q.columns,/email|whatsapp|customer|address|token|metadata/)}
})
test('disclosure cannot be enabled on live or production even with explicit flag and coherent configuration',async()=>{
 for(const env of [{VERCEL_ENV:'production'}, {CULQI_MODE:'live',CULQI_LIVE_APPROVED:'true',CULQI_PUBLIC_KEY:'pk_live_fixture',CULQI_SECRET_KEY:'sk_live_fixture'},
  {CULQI_MODE:'live',VERCEL_ENV:'production',CULQI_LIVE_APPROVED:'true',CULQI_PUBLIC_KEY:'pk_live_fixture',CULQI_SECRET_KEY:'sk_live_fixture'}]){
  const f=enabled({env}),r=await f.request();assert.ok([200,503].includes(r.status));assert.equal(reads(f),0);assert.equal(r.body.productReceipt,undefined)
 }
})
test('same-origin recovery remains available with intake closed or merchant review, without enabling charges',async()=>{
 for(const env of [{CULQI_ENABLED:'false'},{BAGELITO_MERCHANT_REVIEW_ONLY:'true',CULQI_ENABLED:'true'}]){const f=enabled({env}),r=await f.request();assert.equal(r.status,200);assert.equal(reads(f),1);assert.ok(f.effects.rpc.every(x=>['expire_culqi_token_session','read_guided_product_reservation'].includes(x.name)))}
})
test('cross-origin or unconfigured requests stop before security DB and product access',async()=>{
 for(const option of [{headers:{origin:'https://evil.example.test'}},{headers:{'x-forwarded-host':'evil.example.test'}},{url:'https://other.example.test'},
  {env:{CULQI_SECRET_KEY:''}},{env:{CULQI_TANSTACK_BRIDGE_READY:'false'}}]){
  const f=enabled(option),r=await f.request({},option.headers,option.url);assert.equal(r.status,503);assert.equal(f.effects.clients,0);assert.equal(f.effects.security,0);assert.equal(reads(f),0)
 }
})
test('missing Origin and cross-site fetch metadata never disclose products but preserve basic recovery',async()=>{
 for(const headers of [{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]){const f=enabled(),r=await f.request({},headers);assert.equal(r.status,200);assert.equal(reads(f),0);assert.equal(r.body.productReceipt,undefined)}
})
test('rate limit rejection stops before order query or snapshot and keeps no-store',async()=>{
 const f=enabled({securityDenied:true}),r=await f.request();assert.equal(r.status,429);assert.equal(f.effects.clients,0);assert.equal(reads(f),0)
})
test('invalid bounded JSON or non-string capability rejects before security and DB',async()=>{
 for(const payload of ['[]','{bad', {checkoutSessionId:[session]},{orderCode:[orderCode]}, {checkoutSessionId:'bad'}, {orderCode:'BAG-<script>'},' '.repeat(4097)]){
  const f=enabled(),r=await f.request(payload);assert.ok([400,413].includes(r.status));assert.equal(f.effects.security,0);assert.equal(f.effects.clients,0)
 }
})
test('matching only code or only UUID returns the same 404 without status RPC or detail',async()=>{
 const responses=[];for(const payload of [{orderCode:'BAG-OTHER'},{checkoutSessionId:'33333333-3333-4333-8333-333333333333'}]){
  const f=enabled(),r=await f.request(payload);assert.equal(r.status,404);assert.equal(f.effects.rpc.length,0);responses.push(r.body)
 }assert.deepEqual(responses[0],responses[1])
})
test('payload orderId amount payment state and products cannot override the authorized database context',async()=>{
 const f=enabled(),r=await f.request({orderId:'33333333-3333-4333-8333-333333333333',amountMinor:1,paymentStatus:'paid',productReceipt:{items:['private']}})
 assert.equal(r.status,200);assert.equal(r.body.productReceipt.amountMinor,7000);assert.doesNotMatch(JSON.stringify(r.body),/private|33333333/)
})
test('legacy paid order never needs the proposed snapshot migration',async()=>{
 const f=enabled({row:{...defaultRow(),pack_slug:'6-single'},rpcReject:'read_guided_product_reservation'}),r=await f.request()
 assert.equal(r.status,200);assert.equal(reads(f),0);assert.equal(f.api.confirmPaidOrderReceipt(r.body,{orderCode}).detailsAvailable,false)
})
test('non-v4 legacy capability never unlocks product details',async()=>{
 const older='11111111-1111-1111-8111-111111111111';const f=enabled({row:{...defaultRow(),checkout_session_id:older},rpcEnvelopes:{expire_culqi_token_session:{data:paid(),error:null}}})
 const r=await f.request({checkoutSessionId:older});assert.equal(r.status,200);assert.equal(reads(f),0)
})
test('unconfirmed reconciliating or cancelled state never fetches commercial detail',async()=>{
 for(const state of [...['pending','failed','expired','refunded'].map(paymentStatus=>({...paid(),paymentStatus})),{...paid(),reconciliationRequired:true},{...paid(),orderStatus:'cancelled'},{...paid(),orderStatus:'needs_correction'}]){
  const f=enabled({state}),r=await f.request();assert.equal(r.status,200);assert.equal(reads(f),0);assert.equal(r.body.productReceipt,undefined)
 }
})
test('malformed status or amount fails closed without reader and without diagnostic leakage',async()=>{
 for(const options of [{state:{...paid(),reconciliationRequired:'false'}},{state:{...paid(),orderStatus:'other'}},
  ...[null,'Infinity',0,70.001,true,'7e1',' 70',21474836.48].map(total_amount=>({row:{...defaultRow(),total_amount}})),
  {row:{...defaultRow(),payment_expires_at:'bad'}},{row:{...defaultRow(),id:'bad'}}]){
  const f=enabled(options),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),0);assert.equal(r.body.error,'Could not read payment status.')
 }
})
test('guided money and currency must match before the snapshot read',async()=>{
 for(const row of [{...defaultRow(),payment_currency:'USD'},{...defaultRow(),payment_amount_minor:1}]){const f=enabled({row}),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),0)}
})
test('missing corrupt wrong-order wrong-money or unpaid guided snapshot never degrades to a paid receipt',async()=>{
 for(const value of [null,{}, {...snapshot(),orderId:session},{...snapshot(),orderCode:'BAG-OTHER'},{...snapshot(),paymentStatus:'refunded'},
  {...snapshot(),lines:[]},{...snapshot(),amountMinor:1}]){
  const f=enabled({snapshot:value}),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),1);assert.equal(r.body.error,'Could not read payment status.');assert.equal(r.body.productReceipt,undefined)
 }
})
test('transport rejections and malformed envelopes return a generic error without automatic retry',async()=>{
 for(const options of [{queryReject:true},{queryEnvelope:{data:defaultRow()}},{queryEnvelope:{data:defaultRow(),error:{message:'private'}}},
  ...['expire_culqi_token_session','read_guided_product_reservation'].flatMap(name=>[{rpcReject:name},{rpcEnvelopes:{[name]:{data:snapshot(),error:{message:'private'}}}}])]){
  const f=enabled(options),r=await f.request();assert.equal(r.status,500);assert.equal(r.body.error,'Could not read payment status.');assert.ok(reads(f)<=1)
  assert.doesNotMatch(JSON.stringify(r.body),/private|token_fixture|fixture@example/)
 }
})
test('later refund cancellation or reconciliation prevents returning a stale paid product receipt',async()=>{
 for(const changed of [{...paid(),paymentStatus:'refunded'},{...paid(),orderStatus:'cancelled'},{...paid(),reconciliationRequired:true}]){
  const f=enabled({states:[paid(),changed]}),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),1);assert.equal(r.body.productReceipt,undefined)
 }
})
test('changed amount identity capability or storage header during snapshot read fails closed',async()=>{
 for(const change of [{id:session},{total_amount:'71.00'},{payment_currency:'USD'},{payment_amount_minor:1},{pack_slug:'6-single'},
  {checkout_session_id:'33333333-3333-4333-8333-333333333333'},{order_code:'BAG-OTHER'}]){
  const f=enabled({rows:[defaultRow(),{...defaultRow(),...change}]}),r=await f.request();assert.ok([404,500].includes(r.status));assert.equal(reads(f),1);assert.equal(r.body.productReceipt,undefined)
 }
})
test('snapshot and response extensions cannot disclose contacts tokens or arbitrary item names',async()=>{
 const stored={...snapshot(),email:'private@example.test',sourceId:'token_private',checkoutSessionId:'private',customer:'private'};stored.lines[0].bagels[0].name='private';stored.lines[1].schmears[0].email='private'
 const f=enabled({snapshot:stored}),r=await f.request();assert.equal(r.status,200);assert.doesNotMatch(JSON.stringify(r.body),/private|sourceId|checkoutSessionId|customer|email/)
 const modified=clone(r.body);modified.productReceipt.items[0].name='private';modified.productReceipt.email='private'
 const receipt=f.api.confirmPaidOrderReceipt(modified,{orderCode});assert.equal(receipt.items[0].name,'Sesame');assert.doesNotMatch(JSON.stringify(receipt),/private|email/)
})
test('client rejects corrupt minimized receipts and ambiguous dual representations',async()=>{
 const f=enabled(),r=await f.request(),good=r.body
 for(const patch of [{detailsAvailable:false},{items:[]},{orderCode:'BAG-OTHER'},{amountMinor:1},{currency:'USD'},
  {fulfillmentAuthorized:true},{isFiscalReceipt:true},{subtotalMinor:6100},{deliveryFeeMinor:-1},
  {items:[{kind:'bagel',flavorId:'plain',quantity:2}]},{items:[{kind:'schmear',flavorId:'whipped-original',quantity:1,grams:250}]},
  {items:[{kind:'bagel',flavorId:'plain',quantity:6},{kind:'bagel',flavorId:'plain',quantity:6}]},
  {items:[{kind:'bagel',flavorId:'cheddar',quantity:6}]},{items:[{kind:'schmear',flavorId:'whipped-original',quantity:2,grams:120}]}]){
  assert.throws(()=>f.api.confirmPaidOrderReceipt({...good,productReceipt:{...good.productReceipt,...patch}},{orderCode}),/No se pudo verificar/)
 }
 for(const productReceipt of [null,false,[],{}])assert.throws(()=>f.api.confirmPaidOrderReceipt({...good,productReceipt},{orderCode}),/No se pudo verificar/)
 assert.throws(()=>f.api.confirmPaidOrderReceipt({...good,productSnapshot:snapshot()},{orderCode}),/No se pudo verificar/)
})

test('valid two-decimal legacy money survives integer-cent conversion without binary floating rejection',async()=>{
 for(const total_amount of ['10.07','20.15','70.00']){const f=enabled({row:{...defaultRow(),pack_slug:'6-single',total_amount}}),r=await f.request()
  assert.equal(r.status,200);const receipt=f.api.confirmPaidOrderReceipt(r.body,{orderCode});assert.equal(receipt.amountMinor,Math.round(Number(total_amount)*100));assert.equal(receipt.detailsAvailable,false)
 }
})
test('query filters are insufficient alone: returned contradictory row identity is independently rejected',async()=>{
 for(const change of [{id:'bad'},{order_code:'BAG-OTHER'},{checkout_session_id:'33333333-3333-4333-8333-333333333333'}]){
  const f=enabled({queryEnvelope:{data:{...defaultRow(),...change},error:null}}),r=await f.request();assert.equal(r.status,500);assert.equal(f.effects.rpc.length,0)
 }
})
test('all fifteen minimal pot projections and four pack shapes validate without repricing historical money',()=>{
 const f=enabled(),menu=require('../src/domain/data/verified-menu-2026-10-21.json')
 function receipt(items){return{orderCode,amountMinor:2700,currency:'PEN',paymentStatus:'paid',detailsAvailable:true,subtotalMinor:1900,deliveryFeeMinor:800,items,fulfillmentAuthorized:false,isFiscalReceipt:false}}
 for(const flavor of menu.schmears)for(const size of menu.schmear_sizes){
  const item={kind:'schmear',flavorId:flavor.id,quantity:1,grams:size.grams},input={ok:true,orderCode,amountPen:27,...paid(),productReceipt:receipt([item])}
  const result=f.api.confirmPaidOrderReceipt(input,{orderCode});assert.equal(result.items[0].name,flavor.name);assert.equal(result.items[0].grams,size.grams);assert.equal(result.subtotalMinor,1900)
 }
 for(const quantity of [6,12])for(const mixed of [false,true]){
  const items=mixed?[{kind:'bagel',flavorId:'sesame',quantity:quantity/2},{kind:'bagel',flavorId:'plain',quantity:quantity/2}]:[{kind:'bagel',flavorId:'sesame',quantity}]
  const result=f.api.confirmPaidOrderReceipt({ok:true,orderCode,amountPen:27,...paid(),productReceipt:receipt(items)},{orderCode});assert.equal(result.items.reduce((n,i)=>n+i.quantity,0),quantity)
 }
})

test('snapshot transport ignoring abort still times out generically, retains no retry, and stops later work',async()=>{
 const f=enabled({hangRpc:'read_guided_product_reservation'}),started=Date.now(),r=await f.request()
 assert.equal(r.status,500);assert.equal(r.body.error,'Could not read payment status.');assert.equal(reads(f),1);assert.equal(f.effects.queries.length,1)
 assert.equal(f.effects.signals.at(-1).aborted,true);assert.ok(Date.now()-started>=1900&&Date.now()-started<4000)
})
test('sequential observations share a global 5 s budget rather than restarting it for every DB operation',async()=>{
 const f=enabled({advanceClockMs:1800}),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),1);assert.equal(f.effects.queries.length,1)
 assert.ok(f.effects.deadlines.includes(1400),'third operation only has remaining budget')
})

test('a final state response resolving beyond its budget is discarded even if its timer has not run',async()=>{
 const f=enabled({advanceClockSteps:[800,800,800,800,2000]}),r=await f.request();assert.equal(r.status,500);assert.equal(reads(f),1);assert.equal(f.effects.queries.length,2)
 assert.equal(f.effects.signals.at(-1).aborted,true)
})
