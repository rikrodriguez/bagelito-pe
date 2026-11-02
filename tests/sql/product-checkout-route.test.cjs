/** Real route → real service → real additive SQL in an owned in-memory PGlite.
 * No Supabase/provider client, sockets, credentials or production migration.
 */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const crypto = require('node:crypto'), {performance} = require('node:perf_hooks')
const f = require('./fixture.cjs')
let sql
const cap = '11111111-1111-4111-8111-111111111111'
const body = (order = f.pack()) => ({...order, ...f.input().customer, checkoutSessionId: cap})
const count = async table => (await sql.query(`select count(*)::int n from ${table}`)).rows[0].n
const envBase = {
  PAYMENT_PROVIDER:'culqi', CULQI_MODE:'sandbox', VERCEL_ENV:'preview', PUBLIC_SITE_URL:'https://fixture.example.test',
  CULQI_PUBLIC_KEY:'pk_test_fixture', CULQI_SECRET_KEY:'sk_test_fixture', CULQI_RSA_ID:'fixture', CULQI_RSA_PUBLIC_KEY:'fixture',
  CULQI_ENABLED:'true', CULQI_TANSTACK_BRIDGE_READY:'true', CULQI_TANSTACK_WEBHOOK_READY:'true', CULQI_TANSTACK_CLIENT_READY:'true',
  BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED:'true', BAGELITO_REFERENCE_REVIEW_ONLY:'false',
}
function app(overrides = {}) {
  const env = {...envBase, ...overrides}, cache = new Map(), effects = {calls: [], legacy: 0}
  const db = {from(table) {
    assert.ok(['orders','batches'].includes(table)); let columns, filter
    return {
      select(value) {columns=value; return this}, eq(key,value) {assert.equal(key,'checkout_session_id');filter=value;return this},
      order(key) {assert.equal(key,'created_at');return this}, limit(n) {assert.equal(n,1);return this},
      abortSignal(signal) {assert.ok(signal instanceof AbortSignal);return this},
      async maybeSingle() {
        effects.calls.push(table)
        if (table==='orders') {assert.equal(columns,'id,batch_id,pack_slug,checkout_session_id');return {error:null,data:(await sql.query(`select ${columns} from orders where checkout_session_id=$1::uuid`,[filter])).rows[0]??null}}
        assert.equal(columns,'id');return {error:null,data:(await sql.query('select id from batches order by created_at desc limit 1')).rows[0]??null}
      },
    }
  }, rpc(name,args) {
    effects.calls.push(name);assert.equal(name,'create_guided_product_reservation')
    return {abortSignal(signal) {assert.ok(signal instanceof AbortSignal);return this},
      then(resolve,reject) {return f.call(sql,args).then(data=>({data,error:null}), error=>({data:null,error})).then(resolve,reject)},
    }
  }}
  class PublicApiError extends Error {constructor(message,status=400) {super(message);this.status=status}}
  function load(file) {
    if(cache.has(file))return cache.get(file)
    if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
    const module={exports:{}};cache.set(file,module.exports)
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
    vm.runInNewContext(code,{module,exports:module.exports,process:{env},Date,URL,Request,Response,TextDecoder,Uint8Array,AbortController,AbortSignal,setTimeout,clearTimeout,
      require(id) {
        if(id==='node:crypto')return crypto
        if(id==='node:perf_hooks')return {performance}
        if(id==='@tanstack/react-router')return {createFileRoute:()=>value=>value}
        if(id.endsWith('public-api-security.server'))return {PublicApiError,enforcePublicApiSecurity:async()=>{effects.calls.push('limiter')}}
        if(id.endsWith('/checkout-session.server'))return {createGuidedCheckoutSession:async()=>{effects.legacy++;throw new PublicApiError('Legacy path selected',409)}}
        if(id.endsWith('supabase-admin.server'))return {createSupabaseAdminClient:()=>db}
        if(id.endsWith('batch.server'))return {getBatchReadOnly:async units=>{
          const batch=(await sql.query('select id,name,status,delivery_date::text,orders_open_at::text,orders_close_at::text,capacity_packs,capacity_bagels from batches order by created_at desc limit 1')).rows[0]
          const orders=(await sql.query('select pack_units,status,payment_provider,payment_status,payment_expires_at::text from orders where batch_id=$1::uuid',[batch.id])).rows
          return {status:200,batch:load(path.join(f.root,'src/domain/lib/batch-read.ts')).projectBatchAvailability(batch,orders,Date.now(),units)}
        }}
        if(!id.startsWith('.'))throw Error('Forbidden external import '+id)
        const target=path.resolve(path.dirname(file),id);return load(target+(target.endsWith('.json')?'':'.ts'))
      },
    });return module.exports
  }
  return {effects,async request(route,payload=body(),headers={}) {
    const handler=load(path.join(f.root,`src/routes/api/checkout/${route}.ts`)).Route.server.handlers.POST
    const response=await handler({request:new Request('https://fixture.example.test/api/checkout/'+route,{
      method:'POST',headers:{'content-type':'application/json',origin:'https://fixture.example.test',...headers},body:JSON.stringify(payload),
    })})
    assert.match(response.headers.get('cache-control'),/no-store/)
    return {status:response.status,body:await response.json()}
  }}
}
test.before(async()=>{sql=await f.createFixture();await sql.exec(f.migration())})
test.beforeEach(async()=>f.reset(sql))
test.after(async()=>{if(sql)await sql.close()})

test('actual quote and session store the entire pack + pot and expose only the public reservation',async()=>{
  const a=app(),quote=await a.request('quote'),session=await a.request('session')
  assert.equal(quote.status,200);assert.equal(quote.body.checkoutAllowed,true);assert.equal(quote.body.amountPen,62)
  assert.equal(session.status,200);assert.equal(session.body.amountMinor,7000);assert.equal(session.body.subtotalMinor,6200)
  assert.equal(session.body.deliveryFeeMinor,800);assert.equal(session.body.amountPen,70)
  assert.equal(session.body.checkoutSessionId,cap);assert.match(session.body.orderCode,/^BAG-/)
  assert.deepEqual(Object.keys(session.body).sort(),['amountMinor','amountPen','checkoutSessionId','currency','deliveryFeeMinor','expiresAt','ok','orderCode','subtotalMinor'])
  assert.doesNotMatch(JSON.stringify(session.body),/orderId|customerName|fixture@example|whatsapp|deliveryAddress|lines/)
  const saved=(await sql.query('select lines from order_guided_product_snapshots')).rows[0].lines
  assert.equal(saved.length,2);assert.equal(saved[1].schmears[0].grams,120)
  assert.equal((await sql.query('select sum(quantity)::int n from order_items')).rows[0].n,6)
  assert.equal(await count('orders'),1);assert.equal(await count('payment_attempts'),0)
  assert.equal(a.effects.legacy,0)
})
test('standalone 240 g flavored pot reaches actual SQL with no invented bagels',async()=>{
  const a=app(),payload=body(f.pot({schmears:{'aji-amarillo':1},schmearSize:240}))
  const quote=await a.request('quote',payload),session=await a.request('session',payload)
  assert.equal(quote.body.amountPen,29);assert.equal(quote.body.checkoutAllowed,true)
  assert.equal(session.status,200);assert.equal(session.body.amountMinor,3700)
  assert.equal(await count('order_items'),0)
  const order=(await sql.query('select pack_slug,pack_units,payment_status from orders')).rows[0]
  assert.deepEqual(order,{pack_slug:'guided-v1:schmear-240',pack_units:0,payment_status:'pending'})
})
test('replay after last capacity slot and batch rotation preserves original identity and expiry',async()=>{
  await sql.exec('update batches set capacity_packs=1')
  const a=app(),first=await a.request('session')
  assert.equal(first.status,200)
  await sql.exec(`update batches set status='closed';insert into batches(id,name,status,delivery_date,capacity_packs,capacity_bagels)
    values('33333333-3333-4333-8333-333333333333','New synthetic batch','orders_open',clock_timestamp()+interval '2 days',1,12)`)
  const second=await a.request('session')
  assert.equal(second.status,200);assert.deepEqual(second.body,first.body)
  assert.equal(await count('orders'),1);assert.equal(await count('order_guided_product_snapshots'),1)
  assert.equal(a.effects.calls.filter(x=>x==='batches').length,1)
})
test('same-price changed flavor or customer fails through SQL without mutating the original',async()=>{
  const a=app(),payload=body(f.pack({schmears:{'aji-amarillo':1}}))
  assert.equal((await a.request('session',payload)).status,200)
  for(const change of [{schmears:{'herb-roasted-garlic':1}},{customerName:'Changed Synthetic Customer'}]) {
    const reply=await a.request('session',{...payload,...change});assert.equal(reply.status,503)
    assert.doesNotMatch(JSON.stringify(reply.body),/replay|SQL|Changed Synthetic/)
  }
  assert.equal(await count('orders'),1);assert.equal(await count('payment_attempts'),0)
})
test('owner-only SQL policy remains an independent fail-closed gate after a ready quote',async()=>{
  await sql.exec('update guided_product_reservation_policy set enabled=false')
  const a=app();assert.equal((await a.request('quote')).body.checkoutAllowed,true)
  const reply=await a.request('session');assert.equal(reply.status,503);assert.equal(reply.body.ok,false)
  assert.equal(await count('orders'),0);assert.equal(a.effects.legacy,0)
})
test('unpriced products, false legal acceptance and forged amounts never create partial reservations',async()=>{
  const a=app()
  for(const order of [f.pack({packFormat:'mini'}),f.pack({bagels:{cheddar:6}}),f.pot({bagelMode:'downsell2',bagels:{plain:2}}),
    {category:'combos',comboId:'two-bagel-schmear',bagelMode:'combo',bagels:{plain:2},schmears:{'whipped-original':1},schmearSize:120}]) {
    assert.equal((await a.request('quote',body(order))).body.checkoutAllowed,false)
    assert.equal((await a.request('session',body(order))).status,409)
  }
  assert.equal((await a.request('session',{...body(),termsAccepted:false})).status,400)
  assert.equal(await count('orders'),0)
  const result=await a.request('session',{...body(),amountMinor:1,totalAmount:0,deliveryFee:0,lines:[]})
  assert.equal(result.status,200);assert.equal(result.body.amountMinor,7000)
})
test('JSON cannot opt into product lane and no error falls back to legacy persistence',async()=>{
  const a=app({BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED:'false'})
  const quote=await a.request('quote',{...body(),completeProductLane:true,BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED:true})
  assert.equal(quote.body.checkoutAllowed,false);assert.equal(quote.body.status,'review_required')
  assert.equal((await a.request('session')).status,409);assert.equal(a.effects.legacy,1)
  const b=app();await sql.exec('update guided_product_reservation_policy set enabled=false')
  assert.equal((await b.request('session')).status,503);assert.equal(b.effects.legacy,0)
  assert.equal(await count('orders'),0)
})
