const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const f = require('./fixture.cjs')
let db, originalCore, initialPolicy
const coreDefinitions = async () => (await db.query(`select proname,pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace
  and proname in ('create_culqi_reservation_order','claim_culqi_charge','prepare_culqi_token_session','finish_culqi_charge','apply_culqi_payment_event','confirm_culqi_charge_result') order by proname`)).rows
const counts = async () => (await db.query(`select (select count(*)::int from orders) orders,(select count(*)::int from order_items) items,
  (select count(*)::int from order_guided_product_snapshots) snapshots,(select count(*)::int from order_status_history) history,
  (select count(*)::int from payment_attempts) attempts`)).rows[0]
const args = input => f.api.prepareGuidedProductReservation(input ?? f.input()).args
const clone = value => JSON.parse(JSON.stringify(value))
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const create = input => f.api.persistGuidedProductReservation(f.rpc(db), input ?? f.input())
const rejectRaw = async (value, pattern) => { const before = await counts(); await assert.rejects(f.call(db, value), pattern); assert.deepEqual(await counts(), before) }

test.before(async () => {db = await f.createFixture(); originalCore = await coreDefinitions(); await db.exec(f.migration()); initialPolicy=(await db.query('select enabled from guided_product_reservation_policy')).rows})
test.after(async () => {if (db) await db.close()})
test.beforeEach(async () => f.reset(db))

test('policy defaults closed, has no consumer/admin-client toggle and core definitions are unchanged', async () => {
  // Observe default immediately after migration, before beforeEach enables the fixture.
  // Reuse the one engine rather than starting a second WASM database concurrently.
  assert.deepEqual(initialPolicy, [{enabled: false}])
  await db.exec('update guided_product_reservation_policy set enabled=false')
  await assert.rejects(f.call(db, args()), /disabled/)
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec(`set role ${role}`)
    try {await assert.rejects(db.query('update public.guided_product_reservation_policy set enabled=true'), /permission denied/)}
    finally {await db.exec('reset role')}
  }
  assert.deepEqual(await coreDefinitions(), originalCore)
})
test('pack plus pot commits complete snapshot, real bagel items, exact money and legal evidence once', async () => {
  const result = await create()
  assert.equal(result.amountMinor, 7000); assert.equal(result.subtotalMinor, 6200); assert.equal(result.deliveryFeeMinor, 800)
  assert.deepEqual(await counts(), {orders: 1, items: 1, snapshots: 1, history: 1, attempts: 0})
  const row = (await db.query('select pack_slug,pack_units,total_amount,payment_amount_minor,payment_lane,payment_charge_state,checkout_legal_version,checkout_legal_accepted_at from orders')).rows[0]
  assert.equal(row.pack_slug, 'guided-v1:6-single'); assert.equal(row.pack_units, 6); assert.equal(Number(row.total_amount), 70); assert.equal(row.payment_amount_minor, 7000)
  assert.equal(row.payment_lane, 'token'); assert.equal(row.payment_charge_state, 'idle'); assert.equal(row.checkout_legal_version, '2026-10-28'); assert.ok(row.checkout_legal_accepted_at)
  const snapshot = (await db.query('select lines from order_guided_product_snapshots')).rows[0].lines
  assert.equal(snapshot[1].schmears[0].grams, 120)
  assert.equal(JSON.stringify(snapshot).includes('fixture@example.test'), false)
})
test('all fifteen confirmed standalone flavor-size combinations persist zero fictitious bagels', async () => {
  const menu = require('../../src/domain/data/verified-menu-2026-10-21.json'); let i = 1
  for (const flavor of menu.schmears) for (const size of menu.schmear_sizes) {
    const input = f.input(f.pot({schmears: {[flavor.id]: 1}, schmearSize: size.grams}), {checkoutSessionId: id(i), orderCode: 'BAG-POT-'+i++})
    const result = await create(input)
    const expected = flavor.price_class === 'original' ? size.original_price : size.flavoured_price
    assert.equal(result.subtotalMinor, expected * 100); assert.equal(result.amountMinor, expected * 100 + 800)
  }
  assert.deepEqual(await counts(), {orders: 15, items: 0, snapshots: 15, history: 15, attempts: 0})
  assert.equal((await db.query('select sum(pack_units)::int n from orders')).rows[0].n, 0)
})
test('all four ordinary pack prices and pack-plus-pot prices match existing contract', async () => {
  let i = 1
  for (const [qty, mix, selection, amount] of [[6,'single',{plain:6},50],[12,'single',{plain:12},100],
    [6,'mixed',{plain:3,sesame:3},60],[12,'mixed',{plain:6,sesame:6},115]]) {
    for (const schmears of [{}, {'aji-amarillo':1}]) {
      const result = await create(f.input(f.pack({packQty:qty,packMix:mix,bagels:selection,schmears}), {checkoutSessionId:id(i),orderCode:'BAG-PACK-'+i++}))
      assert.equal(result.subtotalMinor, (amount+(Object.keys(schmears).length?16:0))*100)
    }
  }
})
test('all district delivery fees are recomputed in SQL rather than trusted from caller', async () => {
  // Load the same existing tariff through prepared inputs, then require DB parity.
  const districts = fs.readFileSync(path.join(f.root, 'src/domain/data/delivery-districts.ts'),'utf8').match(/'([^']+)'/g).map(x=>x.slice(1,-1))
  let i = 1
  for (const district of districts) {
    const input = f.input(f.pot(), {checkoutSessionId:id(i),orderCode:'BAG-DISTRICT-'+i++,customer:{...f.input().customer,district}})
    const expected = f.api.prepareGuidedProductReservation(input)
    assert.equal((await create(input)).deliveryFeeMinor, expected.deliveryFeeMinor)
  }
  const bad = args(); bad.p_delivery_fee_minor = 0; await rejectRaw(bad, /Delivery amount mismatch/)
})
test('exact replay returns original identity/expiry with no second order, line or history', async () => {
  const original = f.input(), first = await create(original), before = await counts()
  const second = await create({...original,orderCode:'BAG-RETRY',expiresAt:new Date(Date.now()+20*60_000).toISOString()})
  assert.deepEqual(second, first); assert.deepEqual(await counts(),before)
})
test('canonical bagel row order does not change the replay identity', async () => {
  const input = f.input(f.pack({packMix:'mixed',bagels:{sesame:3,plain:3}})), first = await create(input)
  const raw = args(input); raw.p_lines[0].bagels.reverse()
  assert.equal((await f.call(db,raw)).orderId,first.orderId)
})
test('same-price schmear substitution and same-total bagel substitution are rejected', async () => {
  const input = f.input(f.pack({schmears:{'aji-amarillo':1}})); await create(input)
  await rejectRaw(args({...input,order:f.pack({schmears:{'herb-roasted-garlic':1}})}), /replay/)
  await rejectRaw(args({...input,order:f.pack({bagels:{sesame:6},schmears:{'aji-amarillo':1}})}), /replay/)
})
test('changed customer, delivery, terms or missing snapshot never reuse an existing session', async () => {
  await create()
  for (const change of [{customerName:'Different Fixture'}, {email:'other@example.test'}, {whatsapp:'111111111'},
    {deliveryAddress:'Different address 123'}, {district:'Jesus Maria'}, {addressReference:'Other'}, {deliveryNotes:'Other'}]) {
    await rejectRaw(args(f.input(f.pack(),{customer:{...f.input().customer,...change}})), /replay/)
  }
  const raw=args();raw.p_terms_version='old';await rejectRaw(raw,/legal/)
  await db.exec('delete from order_guided_product_snapshots'); await rejectRaw(args(),/replay/)
})
test('tampered persisted bagel rows, total and snapshot fail replay without repair or second charge', async () => {
  await create(); await db.exec("update order_items set flavor_slug='sesame'")
  await rejectRaw(args(), /bagel items/)
  await db.exec("update order_items set flavor_slug='plain';update orders set total_amount=1")
  await rejectRaw(args(), /replay/)
})
test('expired, cancelled, paid, in-flight or provider-ID reservations cannot restart intake', async () => {
  for (const sql of ["payment_expires_at=clock_timestamp()-interval '1 second'", "status='cancelled'", "payment_status='paid'",
    "payment_charge_state='submitting'", "payment_reconciliation_required=true", "payment_order_id='ord_test_fixture'", "payment_charge_id='chr_test_fixture'"]) {
    await f.reset(db);await create();await db.exec('update orders set '+sql)
    await rejectRaw(args(), /expired|already in payment/)
  }
})
test('zero-bagel standalone consumes one order slot, not bagel capacity', async () => {
  await db.exec('update batches set capacity_bagels=0,capacity_packs=1')
  await create(f.input(f.pot())); await rejectRaw(args(f.input(f.pot(),{checkoutSessionId:id(2),orderCode:'BAG-SECOND'})), /capacity/)
})
test('bagel capacity and closed/future/missing-delivery batches remain fail closed', async () => {
  for (const sql of ['capacity_bagels=5',"status='closed'","orders_open_at=clock_timestamp()+interval '1 hour'",
    "orders_close_at=clock_timestamp()-interval '1 second'",'delivery_date=null',"delivery_date='infinity'"]) {
    await f.reset(db); await db.exec('update batches set '+sql); await rejectRaw(args(), /capacity|unavailable/)
  }
})
test('new expired or overly long holds cannot reserve capacity', async () => {
  for (const ms of [-1000,31*60_000]) {const raw=args();raw.p_payment_expires_at=new Date(Date.now()+ms).toISOString();await rejectRaw(raw,/unavailable/)}
})
test('fabricated amount, premium, duplicate flavor, wrong size and duplicate pot reject atomically', async () => {
  const changes = [raw=>raw.p_lines[0].publishedAmountPen=1,raw=>raw.p_lines[0].bagels[0].flavorId='cheddar',
    raw=>raw.p_lines[0].bagels=[{flavorId:'plain',quantity:3},{flavorId:'plain',quantity:3}],
    raw=>raw.p_lines[1].schmears[0].grams=240,raw=>raw.p_lines=[raw.p_lines[1],raw.p_lines[1]],
    raw=>raw.p_lines[0].bagels[0].quantity=-6,raw=>raw.p_lines[1].schmears[0].flavorId='unknown']
  for (const change of changes) {const raw=clone(args());change(raw);await rejectRaw(raw)}
})
test('unpriced combos and extras cannot be given an invented selling price at either boundary', async () => {
  const orders = [{category:'combos',comboId:'two-bagel-schmear',bagelMode:'combo',bagels:{plain:2},schmears:{'whipped-original':1},schmearSize:120},
    f.pot({bagelMode:'downsell2',bagels:{plain:2}}),f.pot({bagelMode:'upsell8',bagels:{plain:8}}),f.pack({packFormat:'mini'})]
  for (const order of orders) assert.throws(()=>f.api.prepareGuidedProductReservation(f.input(order)),/confirmed prices/)
  for(const kind of ['combo','bagel_extra']){const raw=args();raw.p_lines=[{...raw.p_lines[1],kind,publishedAmountPen:99}];await rejectRaw(raw,/Unpriced/)}
})
test('legal trigger mismatch rolls back the entire transaction including bagels/history', async () => {
  await db.exec(`alter table orders disable trigger bagelito_checkout_terms_on_insert`)
  try {await rejectRaw(args(),/Legal evidence/)} finally {await db.exec('alter table orders enable trigger bagelito_checkout_terms_on_insert')}
})
test('failure after order/item insert rolls back all partial records', async () => {
  await db.exec(`create function public.fixture_fail_snapshot() returns trigger language plpgsql as $$begin raise exception 'fixture snapshot failure';end$$;
    create trigger fixture_snapshot_failure before insert on order_guided_product_snapshots for each row execute function public.fixture_fail_snapshot();`)
  try {await rejectRaw(args(), /fixture snapshot failure/)} finally {await db.exec('drop trigger fixture_snapshot_failure on order_guided_product_snapshots;drop function public.fixture_fail_snapshot()')}
})
test('anon/authenticated cannot execute RPC or read snapshots; service RPC works without direct snapshot writes', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role)
    try {await assert.rejects(f.call(db,args()),/permission denied/);await assert.rejects(db.query('select * from public.order_guided_product_snapshots'),/permission denied/)} finally {await db.exec('reset role')}
  }
  await db.exec('set role service_role')
  try {assert.equal((await create()).amountMinor,7000);await assert.rejects(db.query('delete from public.order_guided_product_snapshots'),/permission denied/)} finally {await db.exec('reset role')}
})
test('new migration replay preserves enabled policy, snapshot data and financial core definitions', async () => {
  await create();const before=await counts(), rows=(await db.query('select * from order_guided_product_snapshots')).rows
  await db.exec(f.migration());assert.deepEqual(await counts(),before)
  assert.deepEqual((await db.query('select * from order_guided_product_snapshots')).rows,rows)
  assert.equal((await db.query('select enabled from guided_product_reservation_policy')).rows[0].enabled,true)
  assert.deepEqual(await coreDefinitions(),originalCore)
})
test('unrecognized relation collision and schema drift fail before replacing own objects', async () => {
  const saved=(await db.query("select obj_description('public.guided_product_reservation_policy'::regclass,'pg_class') comment")).rows[0].comment
  await db.exec('comment on table guided_product_reservation_policy is null')
  await assert.rejects(db.exec(f.migration()),/collision/);await db.exec('rollback')
  await db.query(`comment on table guided_product_reservation_policy is '${saved}'`)
  await db.exec('alter table guided_product_reservation_policy add column fixture_drift text')
  await assert.rejects(db.exec(f.migration()),/collision/);await db.exec('rollback')
  await db.exec('alter table guided_product_reservation_policy drop column fixture_drift')
  // A dropped physical column changes attnum history but not the semantic fingerprint.
  await db.exec(f.migration())
})
test('existing financial token preparation sees the complete total and does not claim a provider payment', async () => {
  const result=await create()
  const prepared=(await db.query('select public.prepare_culqi_token_session($1::uuid) result',[result.orderId])).rows[0].result
  assert.equal(prepared.amount,7000);assert.ok(prepared.sessionId)
  const row=(await db.query('select payment_status,payment_charge_state,payment_charge_id from orders')).rows[0]
  assert.deepEqual(row,{payment_status:'pending',payment_charge_state:'idle',payment_charge_id:null})
})
test('new adapter is not imported by any current public API route', () => {
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
  for(const file of walk(path.join(f.root,'src/routes')))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/guided-product-reservation|create_guided_product_reservation/)
})

test('missing financial prerequisite fails migration without creating product objects', async () => {
  // This case needs an unmigrated database. Never keep two engines alive.
  const previous=db;db=undefined;await previous.close()
  let fresh
  try {
    fresh=await f.createFixture()
    await fresh.exec('drop function public.claim_culqi_charge(uuid,text,text,boolean)')
    await assert.rejects(fresh.exec(f.migration()),/financial core/);await fresh.exec('rollback')
    assert.deepEqual((await fresh.query("select to_regclass('public.order_guided_product_snapshots') snapshot,to_regclass('public.guided_product_reservation_policy') policy,to_regprocedure('public.read_guided_product_reservation(uuid)') reader")).rows[0],{snapshot:null,policy:null,reader:null})
  } finally {
    if(fresh)await fresh.close()
    db=await f.createFixture();await db.exec(f.migration())
  }
  assert.deepEqual(await coreDefinitions(),originalCore)
})
test('unknown or altered function definition is not silently replaced on migration replay', async () => {
  const signature='public.create_guided_product_reservation(text,uuid,uuid,jsonb,jsonb,integer,text,timestamptz)'
  const saved=(await db.query(`select pg_get_functiondef('${signature}'::regprocedure) def,obj_description('${signature}'::regprocedure,'pg_proc') comment`)).rows[0]
  await db.exec(`comment on function ${signature} is null`)
  await assert.rejects(db.exec(f.migration()),/function collision/);await db.exec('rollback')
  await db.exec(`comment on function ${signature} is '${saved.comment}'`)
  await db.exec(`alter function ${signature} set search_path=pg_catalog`)
  await assert.rejects(db.exec(f.migration()),/function collision/);await db.exec('rollback')
  await db.exec(saved.def);await db.exec(f.migration())
})
test('persisted snapshot substitution is detected, never repaired or used as a new price', async () => {
  await create()
  await db.exec(`update order_guided_product_snapshots set lines=jsonb_set(lines,'{1,schmears,0,flavorId}','"aji-amarillo"')`)
  await rejectRaw(args(),/replay/)
})

test('service-only snapshot reader works after payment and closed intake without another reservation', async () => {
  const created=await create(), before=await counts()
  await db.exec("update orders set payment_status='paid',status='payment_confirmed';update guided_product_reservation_policy set enabled=false")
  const client={async rpc(name,args){assert.equal(name,'read_guided_product_reservation');return {data:(await db.query('select public.read_guided_product_reservation($1::uuid) result',[args.p_order_id])).rows[0].result,error:null}}}
  await db.exec('set role service_role')
  let snapshot
  try {snapshot=await f.api.readGuidedProductReservation(client,created.orderId)} finally {await db.exec('reset role')}
  assert.equal(snapshot.paymentStatus,'paid');assert.equal(snapshot.amountMinor,7000);assert.deepEqual(snapshot.lines,clone(created.lines))
  assert.deepEqual(await counts(),before)
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role)
    try {await assert.rejects(db.query('select public.read_guided_product_reservation($1::uuid)',[created.orderId]),/permission denied/)} finally {await db.exec('reset role')}
  }
})
test('snapshot reader returns no record for unknown order and rejects inconsistent stored money', async () => {
  assert.equal((await db.query('select public.read_guided_product_reservation($1::uuid) result',[id(99)])).rows[0].result,null)
  const result=await create();await db.exec('update orders set payment_amount_minor=1')
  await assert.rejects(db.query('select public.read_guided_product_reservation($1::uuid)',[result.orderId]),/snapshot is inconsistent/)
})

// Actual application coordinator + isolated financial SQL. Provider observations
// are fabricated in-process callbacks; no Culqi SDK/client/credential/network.
const {coordinateCulqiCharge}=f.loadTs(path.join(f.root,'src/server/charge-coordinator.server.ts'))
const financialClient=()=>({calls:[],async rpc(name,args){
  this.calls.push(name)
  const signature={
    prepare_culqi_token_session:[['p_order_id','uuid']],
    claim_culqi_charge:[['p_order_id','uuid'],['p_source_id','text'],['p_device_id','text'],['p_has_3ds','boolean']],
    finish_culqi_charge:[['p_order_id','uuid'],['p_attempt_id','uuid'],['p_state','text'],['p_charge_id','text'],['p_method','text'],['p_payload','jsonb']],
    confirm_culqi_charge_result:[['p_order_id','uuid'],['p_checkout_session_id','uuid'],['p_charge_attempt_id','uuid'],['p_observed_at','timestamptz'],['p_provenance','text'],['p_mode','text'],['p_observation','jsonb']],
    read_guided_product_reservation:[['p_order_id','uuid']],
  }[name]
  assert.ok(signature,'Only explicit fixture RPCs may execute')
  try{return{data:(await db.query(`select public.${name}(${signature.map(([,type],i)=>`$${i+1}::${type}`).join(',')}) result`,signature.map(([key,type])=>type==='jsonb'?JSON.stringify(args[key]):args[key]))).rows[0].result,error:null}}
  catch(error){return{data:null,error:{message:error.message}}}
}})
const fakeCharge=(order,patch={})=>({object:'charge',id:'chr_test_fixture_12345678',amount:order.amountMinor,currency_code:'PEN',
  metadata:{bagelito_order_code:order.orderCode},source:{id:'tkn_test_fixture_12345678'},capture:true,current_amount:order.amountMinor,
  amount_refunded:0,dispute:false,...patch})
function coordinatorInput(client,order,callback){return{db:client,orderId:order.orderId,orderCode:order.orderCode,checkoutSessionId:order.checkoutSessionId,
  amountMinor:order.amountMinor,mode:'test',sourceId:'tkn_test_fixture_12345678',deviceId:'fixture-device',has3DS:false,
  createCharge:callback,fetchCharge:async()=>{throw Error('Unexpected provider lookup in isolated fixture')}}}
async function prepareSyntheticToken(client,order){const r=await client.rpc('prepare_culqi_token_session',{p_order_id:order.orderId});assert.equal(r.error,null);assert.equal(r.data.amount,order.amountMinor)}

test('complete product reservation runs through real coordinator and SQL using only synthetic charge evidence',async()=>{
  for(const orderSelection of [f.pack(),f.pot({schmears:{'aji-amarillo':1},schmearSize:240})]){
    await f.reset(db)
    const order=await create(f.input(orderSelection)),client=financialClient();let providerCalls=0
    await db.exec('set role service_role')
    try{
      await prepareSyntheticToken(client,order)
      const input=coordinatorInput(client,order,async()=>{providerCalls++;return{requires3DS:false,charge:fakeCharge(order)}})
      const paid=await coordinateCulqiCharge(input)
      assert.equal(paid.paymentStatus,'paid');assert.equal(providerCalls,1)
      const before=client.calls.length,preview=await f.api.readGuidedPackingPreview(client,order.orderId)
      assert.deepEqual(client.calls.slice(before),['read_guided_product_reservation'])
      assert.equal(preview.amountMinor,order.amountMinor);assert.equal(preview.paymentStatus,'paid');assert.equal(preview.fulfillmentAuthorized,false)
      assert.equal(preview.packing.schmearPots,1);assert.equal(preview.packing.bagelUnits,orderSelection.category==='packs'?6:0)
      const retried=await coordinateCulqiCharge(input);assert.equal(retried.paymentStatus,'paid');assert.equal(providerCalls,1)
    }finally{await db.exec('reset role')}
    assert.equal((await counts()).orders,1);assert.equal((await counts()).snapshots,1);assert.equal((await counts()).attempts,1)
    assert.equal((await db.query('select count(*)::int n from culqi_charge_confirmation_receipts')).rows[0].n,1)
  }
})
test('synthetic lower charge amount cannot mark full pack and schmear paid or lose products',async()=>{
  const order=await create(),client=financialClient();let providerCalls=0
  await prepareSyntheticToken(client,order)
  const input=coordinatorInput(client,order,async()=>{providerCalls++;return{requires3DS:false,charge:fakeCharge(order,{amount:5800,current_amount:5800})}})
  assert.equal((await coordinateCulqiCharge(input)).paymentStatus,'reconciliation_required')
  assert.equal((await coordinateCulqiCharge(input)).paymentStatus,'reconciliation_required');assert.equal(providerCalls,1)
  const preview=await f.api.readGuidedPackingPreview(client,order.orderId)
  assert.equal(preview.paymentStatus,'pending');assert.equal(preview.amountMinor,7000);assert.equal(preview.packing.schmearPots,1);assert.equal(preview.fulfillmentAuthorized,false)
})
test('synthetic provider failure preserves complete snapshot and prevents automatic second attempt',async()=>{
  const order=await create(f.input(f.pot({schmearSize:180}))),client=financialClient();let providerCalls=0
  await prepareSyntheticToken(client,order)
  const input=coordinatorInput(client,order,async()=>{providerCalls++;throw Error('Synthetic provider timeout')})
  assert.equal((await coordinateCulqiCharge(input)).paymentStatus,'reconciliation_required')
  assert.equal((await coordinateCulqiCharge(input)).paymentStatus,'reconciliation_required');assert.equal(providerCalls,1)
  const preview=await f.api.readGuidedPackingPreview(client,order.orderId)
  assert.equal(preview.packing.schmearGrams,180);assert.equal(preview.amountMinor,2600);assert.equal(preview.fulfillmentAuthorized,false)
})
test('synthetic 3DS continuation binds the same source and preserves the complete commercial snapshot',async()=>{
  const order=await create(),client=financialClient();let providerCalls=0
  await prepareSyntheticToken(client,order)
  const first=coordinatorInput(client,order,async()=>{providerCalls++;return{requires3DS:true}})
  assert.equal((await coordinateCulqiCharge(first)).paymentStatus,'requires_3ds')
  assert.equal((await f.api.readGuidedPackingPreview(client,order.orderId)).paymentStatus,'pending')
  const continuation={...coordinatorInput(client,order,async()=>{providerCalls++;return{requires3DS:false,charge:fakeCharge(order)}}),has3DS:true}
  assert.equal((await coordinateCulqiCharge(continuation)).paymentStatus,'paid');assert.equal(providerCalls,2)
  const preview=await f.api.readGuidedPackingPreview(client,order.orderId)
  assert.equal(preview.packing.bagelUnits,6);assert.equal(preview.packing.schmearGrams,120);assert.equal(preview.amountMinor,7000);assert.equal(preview.fulfillmentAuthorized,false)
  assert.equal((await counts()).attempts,1)
})
test('isolated packing reader fails on corrupted physical composition instead of inventing a missing pot',async()=>{
  const order=await create();await db.exec(`update order_guided_product_snapshots set lines=jsonb_set(lines,'{1,schmears}','[]'::jsonb)`)
  await assert.rejects(f.api.readGuidedPackingPreview(financialClient(),order.orderId),/inconsistent/)
  assert.equal((await counts()).orders,1);assert.equal((await counts()).attempts,0)
})

test('read-only packing projection rejects missing changed or invented physical bagels and mismatched header',async()=>{
  for(const mutation of ['delete from order_items','update order_items set quantity=5',"update order_items set flavor_slug='sesame'",
    'update orders set pack_units=5',"update orders set pack_slug='guided-v1:12-single'"]){
    await f.reset(db);const order=await create();await db.exec(mutation)
    await assert.rejects(f.api.readGuidedPackingPreview(financialClient(),order.orderId),/Could not read/)
    assert.equal((await counts()).orders,1);assert.equal((await counts()).attempts,0)
  }
  await f.reset(db);const pot=await create(f.input(f.pot()))
  await db.query("insert into order_items(order_id,flavor_slug,flavor_name,quantity)values($1,'plain','Plain',6)",[pot.orderId])
  await assert.rejects(f.api.readGuidedPackingPreview(financialClient(),pot.orderId),/Could not read/)
})
