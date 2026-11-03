const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const root = path.resolve(__dirname, '..')
const sid = '11111111-1111-4111-8111-111111111111'
const bid = '22222222-2222-4222-8222-222222222222'
const oid = '33333333-3333-4333-8333-333333333333'
const oldBid = '44444444-4444-4444-8444-444444444444'
const pack = changes => ({category:'packs',packFormat:'grande',packQty:6,packMix:'single',bagelMode:'pack',bagels:{plain:6},schmears:{'whipped-original':1},schmearSize:120,...changes})
const pot = changes => ({category:'schmears',bagelMode:'pack',bagels:{},schmears:{'whipped-original':1},schmearSize:120,...changes})
const input = (order = pack(), changes = {}) => ({...order,checkoutSessionId:sid,customerName:'Synthetic Customer',email:'synthetic@example.invalid',
  whatsapp:'999999999',deliveryAddress:'Synthetic address 123',district:'Lince',termsAccepted:true,termsVersion:'2026-10-28',...changes})
const flush = () => new Promise(resolve => setImmediate(resolve))
const unavailable = error => error.status === 503 && !/private|synthetic@example/.test(error.message)

function setup(options = {}) {
  const effects = {clients:0,security:[],queries:[],rpc:[],signals:[]}, timers = new Map(), cache = new Map()
  let clock = 1000, next = 0, step = 0
  const db = {
    from(table) {
      const query = {table,columns:null,filters:[]}; effects.queries.push(query)
      const q = {
        select(columns) {query.columns=columns;return q}, eq(k,v) {query.filters.push([k,v]);return q},
        order(k,v) {query.order=[k,v];return q},limit(n) {query.limit=n;return q},
        abortSignal(signal) {effects.signals.push(signal);return q},
        async maybeSingle() {
          clock += options.queryAdvance?.[step++] ?? 0
          if (options.hangTable===table) return new Promise(()=>{})
          if (options.queryError) throw Error('private database endpoint')
          if (options.envelopes && Object.hasOwn(options.envelopes,table)) return options.envelopes[table]
          if (table==='orders') return {data:options.prior ?? null,error:null}
          assert.equal(table,'batches');return {data:{id:bid},error:null}
        },
      };return q
    },
    rpc(name,args) {
      effects.rpc.push({name,args})
      assert.equal(name,'create_guided_product_reservation')
      let signal
      return {abortSignal(value) {signal=value;effects.signals.push(value);return this},then(resolve,reject) {
        return Promise.resolve().then(()=>{
          clock += options.rpcAdvance ?? 0
          if (options.hangRpc) return new Promise(()=>{})
          if (options.rpcReject) throw Error('private transport after possible commit')
          const subtotal = args.p_lines.reduce((n,line)=>n+line.publishedAmountPen*100,0)
          const data = {orderId:oid,orderCode:args.p_order_code,checkoutSessionId:args.p_checkout_session_id,expiresAt:args.p_payment_expires_at,
            subtotalMinor:subtotal,deliveryFeeMinor:args.p_delivery_fee_minor,amountMinor:subtotal+args.p_delivery_fee_minor,currency:'PEN',lines:args.p_lines,...options.result}
          return options.rpcEnvelope ?? {data,error:null}
        }).then(resolve,reject)
      }}
    },
  }
  class PublicApiError extends Error {constructor(message,status=400){super(message);this.status=status}}
  function load(file) {
    if(cache.has(file))return cache.get(file)
    if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
    const module={exports:{}};cache.set(file,module.exports)
    const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
    vm.runInNewContext(js,{module,exports:module.exports,Date,AbortController,
      setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},
      require(id){
        if(id==='node:crypto')return {randomUUID:()=> '55555555-5555-4555-8555-555555555555'}
        if(id==='node:perf_hooks')return {performance:{now:()=>clock}}
        if(id==='./payment-config.server')return {isGuidedProductCheckoutRequestAllowed:()=>options.allowed!==false}
        if(id==='./public-api-security.server')return {PublicApiError,enforcePublicApiSecurity:async value=>{effects.security.push(value);if(value.trapValue?.trim())throw new PublicApiError('Invalid submission.',400);if(options.securityDenied)throw new PublicApiError('Too many attempts.',429)}}
        if(id==='./supabase-admin.server')return {createSupabaseAdminClient:()=>{effects.clients++;if(options.clientError)throw Error('private credential diagnostic');return db}}
        if(!id.startsWith('.'))throw Error('Unexpected external import '+id)
        const target=path.resolve(path.dirname(file),id);return load(target+(target.endsWith('.json')?'':'.ts'))
      },
    });return module.exports
  }
  const api=load(path.join(root,'src/server/guided-product-checkout-session.server.ts'))
  return {effects,timers,run:(value=input())=>api.createGuidedProductCheckoutSession(new Request('https://sandbox.example.invalid/api/checkout/session'),value),
    expire(){for(const {fn,ms} of [...timers.values()]){clock+=ms;fn()}},
  }
}

test('service checks its own sandbox gate before all validation or side effects',async()=>{
  const f=setup({allowed:false});await assert.rejects(f.run(),unavailable)
  assert.equal(f.effects.clients,0);assert.equal(f.effects.security.length,0)
})
test('pack plus pot bridges complete products into the JSONB RPC and returns only browser contract',async()=>{
  const f=setup(), result=await f.run(input(pack(),{amountMinor:1,amountPen:0,batchId:oldBid,orderCode:'BAG-CLIENT'}))
  assert.equal(result.amountMinor,7000);assert.equal(result.amountPen,70);assert.equal(result.subtotalMinor,6200);assert.equal(result.deliveryFeeMinor,800)
  assert.equal(result.orderCode,'BAG-55555555-5555-4555-8555-555555555555')
  assert.deepEqual(Object.keys(result).sort(),['amountMinor','amountPen','checkoutSessionId','currency','deliveryFeeMinor','expiresAt','ok','orderCode','subtotalMinor'].sort())
  assert.doesNotMatch(JSON.stringify(result),/orderId|customer|email|lines|synthetic@example/)
  assert.equal(f.effects.rpc.length,1);assert.equal(f.effects.rpc[0].args.p_batch_id,bid)
  assert.equal(f.effects.rpc[0].args.p_lines.length,2);assert.equal(f.effects.security[0].scope,'reservations')
  assert.equal(f.effects.queries[0].columns,'id,batch_id,pack_slug,checkout_session_id')
  assert.deepEqual(f.effects.queries[0].filters,[['checkout_session_id',sid]])
  assert.equal(f.effects.queries[1].columns,'id');assert.equal(f.timers.size,0)
})
test('all fifteen standalone pot variants preserve grams and confirmed prices with no bagel rows',async()=>{
  const menu=require('../src/domain/data/verified-menu-2026-10-21.json')
  for(const flavor of menu.schmears)for(const size of menu.schmear_sizes){
    const f=setup(), result=await f.run(input(pot({schmears:{[flavor.id]:1},schmearSize:size.grams})))
    const price=flavor.price_class==='original'?size.original_price:size.flavoured_price
    assert.equal(result.amountMinor,(price+8)*100)
    assert.equal(f.effects.rpc[0].args.p_lines.length,1)
    assert.equal(f.effects.rpc[0].args.p_lines[0].bagels.length,0)
    assert.equal(f.effects.rpc[0].args.p_lines[0].schmears[0].grams,size.grams)
  }
})
test('unsupported combos extras premium and minis cannot touch limiter or database',async()=>{
  for(const order of [pack({packFormat:'mini'}),pack({bagels:{cheddar:6}}),pot({bagelMode:'downsell2',bagels:{plain:2}}),
    {category:'combos',comboId:'two-bagel-schmear',bagelMode:'combo',bagels:{plain:2},schmears:{'whipped-original':1},schmearSize:120}]){
    const f=setup();await assert.rejects(f.run(input(order)),error=>error.status===409)
    assert.equal(f.effects.clients,0);assert.equal(f.effects.security.length,0)
  }
})
test('customer legal capability and malformed product validation happen before remote effects',async()=>{
  for(const value of [input(pack(),{termsAccepted:false}),input(pack(),{termsVersion:'old'}),input(pack(),{email:'invalid'}),
    input(pack(),{deliveryAddress:'x'.repeat(221)}),input(pack(),{checkoutSessionId:'11111111-1111-1111-8111-111111111111'}),
    input(pack(),{checkoutSessionId:'bad'}),input(pack(),{website:1}),input(pack({schmears:[]})),null,[]]){
    const f=setup();await assert.rejects(f.run(value),error=>error.status===400)
    assert.equal(f.effects.clients,0);assert.equal(f.effects.security.length,0)
  }
})
test('normalized customer values feed limiter and strict adapter without truncation',async()=>{
  const f=setup();await f.run(input(pack(),{email:' SYNTHETIC@EXAMPLE.INVALID ',customerName:' Synthetic Customer '}))
  assert.equal(f.effects.security[0].email,'synthetic@example.invalid')
  assert.equal(f.effects.rpc[0].args.p_customer.customerName,'Synthetic Customer')
})
test('rate-limit denial and honeypot stop before any reservation client',async()=>{
  for(const [options,extra,status] of [[{securityDenied:true},{},429],[{}, {website:'spam'},400]]){
    const f=setup(options);await assert.rejects(f.run(input(pack(),extra)),error=>error.status===status)
    assert.equal(f.effects.clients,0);assert.equal(f.effects.rpc.length,0)
  }
})
test('existing guided session uses original batch and preserves persisted identity and expiry on replay',async()=>{
  const expiry=new Date(Date.now()+5*60_000).toISOString()
  const f=setup({prior:{id:oid,batch_id:oldBid,pack_slug:'guided-v1:6-single',checkout_session_id:sid},result:{orderCode:'BAG-ORIGINAL',expiresAt:expiry}})
  const result=await f.run()
  assert.equal(f.effects.queries.length,1);assert.equal(f.effects.rpc[0].args.p_batch_id,oldBid)
  assert.equal(result.orderCode,'BAG-ORIGINAL');assert.equal(result.expiresAt,expiry)
})
test('legacy or malformed prior sessions never fall back or attempt a reservation',async()=>{
  const original={id:oid,batch_id:oldBid,pack_slug:'guided-v1:6-single',checkout_session_id:sid}
  for(const prior of [{...original,pack_slug:'6-single'},{...original,checkout_session_id:oid},{...original,batch_id:'bad'},{...original,id:'bad'},{}]){
    const f=setup({prior});await assert.rejects(f.run(),unavailable)
    assert.equal(f.effects.rpc.length,0);assert.equal(f.effects.queries.length,1)
  }
})
test('missing/malformed/error lookup envelopes cannot start a write',async()=>{
  for(const envelopes of [{orders:{}},{orders:{data:null,error:{message:'private'}}},{batches:{data:null,error:null}},{batches:{data:{id:'bad'},error:null}}]){
    const f=setup({envelopes});await assert.rejects(f.run(),unavailable);assert.equal(f.effects.rpc.length,0)
  }
})
test('lost write response or SQL replay rejection is generic and never retried',async()=>{
  for(const options of [{rpcReject:true},{rpcEnvelope:{data:null,error:{message:'private replay mismatch'}}},{result:{amountMinor:1}},{clientError:true}]){
    const f=setup(options);await assert.rejects(f.run(),unavailable)
    assert.equal(f.effects.rpc.length,options.clientError?0:1);assert.equal(f.timers.size,0)
  }
})
test('hanging initial read is aborted and bounded even when transport ignores abort',async()=>{
  const f=setup({hangTable:'orders'}), pending=f.run();await flush()
  assert.equal([...f.timers.values()][0].ms,2000)
  const rejected=assert.rejects(pending,unavailable);f.expire();await rejected
  assert.equal(f.effects.signals[0].aborted,true);assert.equal(f.effects.rpc.length,0);assert.equal(f.timers.size,0)
})
test('two reads and write share 5 seconds, at most 2 seconds per operation',async()=>{
  const f=setup({queryAdvance:[1800,1800],hangRpc:true}), pending=f.run();await flush()
  assert.equal([...f.timers.values()][0].ms,1400)
  const rejected=assert.rejects(pending,unavailable);f.expire();await rejected
  assert.equal(f.effects.signals.at(-1).aborted,true);assert.equal(f.effects.rpc.length,1);assert.equal(f.timers.size,0)
})
test('late write completion is rejected even before its timeout callback runs',async()=>{
  const f=setup({rpcAdvance:2000});await assert.rejects(f.run(),unavailable)
  assert.equal(f.effects.signals.at(-1).aborted,true);assert.equal(f.effects.rpc.length,1);assert.equal(f.timers.size,0)
})
