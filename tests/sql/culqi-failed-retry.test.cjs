const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const f = require('./fixture.cjs')
const {coordinateCulqiCharge} = f.loadTs(path.join(f.root, 'src/server/charge-coordinator.server.ts'))
const source = 'tkn_test_failed_fixture_12345678'
const secondSource = 'tkn_test_second_fixture_12345678'
const chargeId = 'chr_test_failed_fixture_12345678'
const guard = () => {
  const dir = path.join(f.root, 'supabase/migrations')
  return fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('_culqi_pending_charge_guard.sql'))), 'utf8')
}
const signature = {
  prepare_culqi_token_session: [['p_order_id','uuid']],
  claim_culqi_charge: [['p_order_id','uuid'],['p_source_id','text'],['p_device_id','text'],['p_has_3ds','boolean']],
  finish_culqi_charge: [['p_order_id','uuid'],['p_attempt_id','uuid'],['p_state','text'],['p_charge_id','text'],['p_method','text'],['p_payload','jsonb']],
  confirm_culqi_charge_result: [['p_order_id','uuid'],['p_checkout_session_id','uuid'],['p_charge_attempt_id','uuid'],['p_observed_at','timestamptz'],['p_provenance','text'],['p_mode','text'],['p_observation','jsonb']],
}
let db, original
const queryResult = async (sql, args=[]) => (await db.query(sql,args)).rows[0].result
const prepare = order => queryResult('select public.prepare_culqi_token_session($1::uuid) result',[order.orderId])
const claim = (order, token=source, has3ds=false) => queryResult('select public.claim_culqi_charge($1::uuid,$2,$3,$4) result',[order.orderId,token,'fixture-device',has3ds])
const resource = (order, token=source) => ({id:chargeId, amount:order.amountMinor, currency_code:'PEN',
  metadata:{bagelito_order_code:order.orderCode}, source:{id:token}})
const fail = (order, token=source) => queryResult('select public.apply_culqi_payment_event($1,$2,$3::jsonb,$3::jsonb) result',
  ['evt_test_failed_fixture_12345678','charge.creation.failed',JSON.stringify(resource(order,token))])
const create = () => f.api.persistGuidedProductReservation(f.rpc(db),f.input())
const snapshot = async () => (await db.query(`select jsonb_build_object(
  'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from orders o),
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from payment_attempts a),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]') from order_status_history h),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from payment_webhook_events e),
  'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by provider_charge_id),'[]') from culqi_charge_confirmation_receipts r)) state`)).rows[0].state
const client = () => ({async rpc(name,args) {
  assert.ok(signature[name], 'Only allowlisted in-memory RPCs may execute')
  const s=signature[name]
  try {return {data:await queryResult(`select public.${name}(${s.map(([,type],i)=>`$${i+1}::${type}`).join(',')}) result`,
    s.map(([key,type])=>type==='jsonb'?JSON.stringify(args[key]):args[key])),error:null}}
  catch(error) {return {data:null,error:{message:error.message}}}
}})
const coordinator = (order, token=secondSource, onCall=()=>{}) => ({db:client(),orderId:order.orderId,orderCode:order.orderCode,
  checkoutSessionId:order.checkoutSessionId,amountMinor:order.amountMinor,mode:'test',sourceId:token,deviceId:'fixture-device',has3DS:false,
  createCharge:async()=>{onCall();return {requires3DS:false,charge:{...resource(order,token),id:'chr_test_second_fixture_12345678',
    object:'charge',capture:true,current_amount:order.amountMinor,amount_refunded:0,dispute:false}}},
  fetchCharge:async()=>{throw Error('No external lookup is permitted')}})
async function failedOrder() {
  const order=await create();await prepare(order);assert.equal((await claim(order)).claimed,true);await fail(order)
  const state=await snapshot()
  assert.equal(state.orders[0].payment_status,'failed');assert.equal(state.orders[0].status,'needs_correction')
  assert.equal(state.orders[0].payment_charge_state,'idle');assert.equal(state.attempts[0].status,'failed')
  return order
}
test.before(async()=>{
  db=await f.createFixture();await db.exec(f.migration())
  original=(await db.query(`select pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace
    and proname in ('prepare_culqi_token_session','claim_culqi_charge') order by proname`)).rows.map(r=>r.def+';').join('\n')
})
test.after(async()=>{if(db)await db.close()})
test.beforeEach(async t=>{
  await f.reset(db);await db.exec('truncate public.payment_webhook_events');await db.exec(original)
  if(!t.name.startsWith('baseline:'))await db.exec(guard())
})

test('baseline: a failed webhook permits a second synthetic charge that confirmation cannot apply',async()=>{
  const order=await failedOrder(),before=await snapshot(),session=await prepare(order);let calls=0
  assert.equal(session.sessionId,before.attempts[0].id)
  const result=await coordinateCulqiCharge(coordinator(order,secondSource,()=>calls++))
  assert.equal(calls,1);assert.equal(result.paymentStatus,'reconciliation_required')
  const after=await snapshot()
  assert.equal(after.orders[0].payment_status,'failed');assert.equal(after.attempts[0].status,'failed')
  assert.equal(after.orders[0].payment_charge_id,'chr_test_second_fixture_12345678')
  assert.equal(after.receipts.length,0)
  console.log('# Baseline reproduced: synthetic provider calls=1, order=failed, attempt=failed, receipts=0')
})
test('failed order cannot prepare or charge again and keeps its evidence and capacity state',async()=>{
  const order=await failedOrder(),before=await snapshot();let calls=0
  await assert.rejects(prepare(order),/blocked or expired/)
  assert.deepEqual(await claim(order,secondSource),{state:'blocked',claimed:false})
  assert.equal((await coordinateCulqiCharge(coordinator(order,secondSource,()=>calls++))).paymentStatus,'reconciliation_required')
  assert.equal(calls,0);assert.deepEqual(await snapshot(),before)
})
test('pending API read followed by committed failed webhook cannot authorize a stale charge',async()=>{
  const order=await create();await prepare(order);await claim(order)
  const stale=(await db.query('select payment_status from orders where id=$1',[order.orderId])).rows[0]
  assert.equal(stale.payment_status,'pending');await fail(order)
  const before=await snapshot();let calls=0
  await coordinateCulqiCharge(coordinator(order,secondSource,()=>calls++))
  assert.equal(calls,0);assert.deepEqual(await snapshot(),before)
})
test('simultaneously submitted claims have one winner and cannot repeat a provider operation',async()=>{
  const order=await create();await prepare(order);let calls=0
  const results=await Promise.all(Array.from({length:8},()=>coordinateCulqiCharge(coordinator(order,source,()=>calls++))))
  assert.equal(calls,1);assert.equal(results.filter(r=>r.paymentStatus==='paid').length,1)
  assert.equal((await snapshot()).receipts.length,1)
  await coordinateCulqiCharge(coordinator(order,source,()=>calls++));assert.equal(calls,1)
})
test('failed event queued before competing claims blocks every claim and duplicate event changes nothing',async()=>{
  const order=await create();await prepare(order);await claim(order)
  const results=await Promise.all([fail(order),...Array.from({length:5},()=>claim(order,secondSource))])
  assert.ok(results.slice(1).every(r=>r.claimed===false && r.state==='blocked'))
  const before=await snapshot();assert.deepEqual(await fail(order),{duplicate:true});assert.deepEqual(await snapshot(),before)
})
test('a failure committed after claim preserves the failure and blocks subsequent 3DS continuation',async()=>{
  const order=await create();await prepare(order);let calls=0
  const input=coordinator(order,source,()=>calls++)
  input.createCharge=async()=>{calls++;await fail(order);return {requires3DS:true}}
  assert.equal((await coordinateCulqiCharge(input)).paymentStatus,'reconciliation_required')
  // A provider call already claimed before failure cannot be undone. Its return
  // must not rearm the failed reservation or trigger another provider request.
  const continuation={...coordinator(order,source,()=>calls++),has3DS:true}
  assert.equal((await coordinateCulqiCharge(continuation)).paymentStatus,'reconciliation_required')
  assert.equal(calls,1);assert.equal((await snapshot()).orders[0].payment_status,'failed')
})
test('pending order with nonpending attempt or mismatched money cannot reopen preparation or charge',async()=>{
  for(const mutation of ["status='failed'","status='expired'","status='refunded'","status='paid'",
    'paid_at=clock_timestamp()',"provider_charge_id='chr_test_old_fixture_12345678'",'amount_minor=1',
    "expires_at=clock_timestamp()-interval '1 second'",'expires_at=null']) {
    await f.reset(db);const order=await create();await prepare(order);await db.exec('update payment_attempts set '+mutation)
    const before=await snapshot();await assert.rejects(prepare(order),/blocked or expired/)
    assert.equal((await claim(order)).claimed,false);assert.deepEqual(await snapshot(),before)
  }
})
test('nonpending orders, review flags and invalid expiries cannot enter the provider lane',async()=>{
  for(const mutation of ["payment_status='failed'","payment_status='expired'","payment_status='refunded'",
    "status='in_production'",'payment_reconciliation_required=true',"payment_expires_at='infinity'",
    'payment_expires_at=null',"payment_expires_at=clock_timestamp()-interval '1 second'"]) {
    await f.reset(db);const order=await create();await db.exec('update orders set '+mutation)
    const before=await snapshot();await assert.rejects(prepare(order),/blocked or expired/)
    assert.equal((await claim(order)).claimed,false);assert.deepEqual(await snapshot(),before)
  }
})
test('pending session preparation is idempotent and supports a single bound 3DS continuation',async()=>{
  const order=await create(),first=await prepare(order),before=await snapshot()
  assert.deepEqual(await prepare(order),first);assert.deepEqual(await snapshot(),before)
  const claimed=await claim(order)
  await queryResult('select public.finish_culqi_charge($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb) result',
    [order.orderId,claimed.attempt_id,'requires_3ds',null,'card','{}'])
  assert.equal((await claim(order,secondSource,true)).claimed,false)
  const next=await claim(order,source,true);assert.equal(next.claimed,true)
  assert.equal((await claim(order,source,true)).claimed,false)
})
test('competing bound 3DS continuations authorize one synthetic provider operation',async()=>{
  const order=await create();await prepare(order);const first=await claim(order);let calls=0
  await queryResult('select public.finish_culqi_charge($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb) result',
    [order.orderId,first.attempt_id,'requires_3ds',null,'card','{}'])
  const input={...coordinator(order,source,()=>calls++),has3DS:true}
  await Promise.all(Array.from({length:6},()=>coordinateCulqiCharge(input)))
  assert.equal(calls,1);assert.equal((await snapshot()).receipts.length,1)
  assert.equal((await snapshot()).orders[0].payment_status,'paid')
})
test('migration replay leaves all state and unrelated financial functions unchanged',async()=>{
  const order=await failedOrder(),before=await snapshot()
  const definitions=async()=>(await db.query(`select proname,pg_get_functiondef(oid) def from pg_proc
    where pronamespace='public'::regnamespace and proname in ('apply_culqi_payment_event','finish_culqi_charge',
      'confirm_culqi_charge_result','create_culqi_reservation_order','create_guided_product_reservation') order by proname`)).rows
  const defs=await definitions();await db.exec(guard());assert.deepEqual(await snapshot(),before);assert.deepEqual(await definitions(),defs)
  assert.equal((await claim(order)).claimed,false)
})
test('RPCs remain service-only and missing prerequisites roll back without replacing known functions',async()=>{
  const order=await create()
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role)
    try {await assert.rejects(prepare(order),/permission denied/);await assert.rejects(claim(order),/permission denied/)}
    finally {await db.exec('reset role')}
  }
  await db.exec('set role service_role')
  try {assert.equal((await prepare(order)).amount,order.amountMinor);assert.equal((await claim(order)).claimed,true)}
  finally {await db.exec('reset role')}
  const saved=(await db.query("select pg_get_functiondef('public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)'::regprocedure) def")).rows[0].def
  await db.exec('drop function public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)')
  try {await assert.rejects(db.exec(guard()),/requires.*financial core/);await db.exec('rollback')}
  finally {await db.exec(saved+`;revoke all on function public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)
    from public,anon,authenticated;grant execute on function public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb) to service_role`)}
})
