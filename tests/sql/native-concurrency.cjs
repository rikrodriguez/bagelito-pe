const assert = require('node:assert/strict')
const f = require('./fixture.cjs') // Only pure TS preparation is used; no PGlite database is created.
const q = value => value === null ? 'NULL' : "'"+String(value).replaceAll("'","''")+"'"
const args = input => f.api.prepareGuidedProductReservation(input || f.input()).args
function sql(input) {
  const a=args(input), keys=['p_order_code','p_checkout_session_id','p_batch_id','p_customer','p_lines','p_delivery_fee_minor','p_terms_version','p_payment_expires_at']
  return 'select public.create_guided_product_reservation('+keys.map(k=>q(typeof a[k]==='object'?JSON.stringify(a[k]):a[k])).join(',')+');'
}
function legacy(input) {
  const a=args(input), c=a.p_customer
  const values=[a.p_order_code,a.p_checkout_session_id,a.p_batch_id,'6-single','6 single',6,'single',c.customerName,c.whatsapp,c.email,c.deliveryAddress,c.district,null,null,false,70,a.p_payment_expires_at,true,JSON.stringify(Object.entries(input.order.bagels).map(([flavor_slug,quantity])=>({flavor_slug,flavor_name:flavor_slug,quantity})))]
  return 'select row_to_json(r) from public.create_culqi_reservation_order('+values.map(q).join(',')+') r;'
}
const clone = value => JSON.parse(JSON.stringify(value))
module.exports = async ({observer,session,delay}) => {
  let serial=0
  const results=[]
  async function reset() {
    await observer.query(`truncate public.orders cascade;delete from public.batches;
      update public.guided_product_reservation_policy set enabled=true;
      insert into public.batches(id,name,status,delivery_date,capacity_packs,capacity_bagels)
      values('${f.batchId}','Native synthetic fixture','orders_open',clock_timestamp()+interval '1 day',100,1000);`)
  }
  async function blocked(s) {
    for(let i=0;i<100;i++) {
      const raw=await observer.query(`select coalesce(json_agg(json_build_object('pid',pid,'wait',wait_event,'blockers',pg_blocking_pids(pid))),'[]'::json)
        from pg_stat_activity where application_name=${q(s.name)} and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0;`)
      const rows=JSON.parse(raw)
      if(rows.length){console.log('# Real blocking barrier '+s.name+': '+raw);return rows}
      if(s.ended)throw Error('Waiter exited before lock barrier: '+s.errors)
      await delay(20)
    }
    throw Error('No real PostgreSQL lock wait observed for '+s.name)
  }
  async function state() {return JSON.parse(await observer.query(`select json_build_object('orders',(select count(*) from orders),'snapshots',(select count(*) from order_guided_product_snapshots),'items',(select count(*) from order_items),'attempts',(select count(*) from payment_attempts));`))}
  async function test(name,fn) {
    await reset();const a=await session('bagelito_a_'+(++serial)),b=await session('bagelito_b_'+serial)
    try {await fn(a,b);results.push({name,pass:true});console.log('ok '+serial+' - '+name)}
    catch(e){results.push({name,pass:false,error:e.message});console.log('not ok '+serial+' - '+name+'\n# '+e.stack)}
    finally {await Promise.all([a.close(),b.close()])}
  }
  // Convert rejection immediately to a value so a failing blocked connection never
  // becomes an unhandled rejection while the holder is still being released.
  const pending=(s,text)=>s.query(text).then(value=>({value}),error=>({error}))
  const success=r=>{assert.equal(r.error,undefined,r.error?.message);return JSON.parse(r.value)}
  const failure=(r,re)=>{assert.ok(r.error,'expected PostgreSQL rejection');assert.match(r.error.message,re)}
  await test('simultaneous exact replay commits one complete order',async(a,b)=>{
    const input=f.input();await a.query('begin;');const first=JSON.parse(await a.query(sql(input)))
    const wait=pending(b,sql({...input,orderCode:'BAG-RETRY'}));await blocked(b);await a.query('commit;')
    assert.deepEqual(success(await wait),first)
    assert.deepEqual(await state(),{orders:1,snapshots:1,items:1,attempts:0})
  })
  await test('same-price concurrent substitution cannot overwrite original',async(a,b)=>{
    const input=f.input();await a.query('begin;');const first=JSON.parse(await a.query(sql(input)))
    const changed=clone(input);changed.order.bagels={sesame:6}
    const wait=pending(b,sql(changed));await blocked(b);await a.query('commit;');failure(await wait,/replay/)
    const snap=JSON.parse(await observer.query('select lines from order_guided_product_snapshots;'));assert.deepEqual(snap,first.lines)
    assert.equal((await state()).orders,1)
  })
  await test('last capacity slot has exactly one concurrent winner',async(a,b)=>{
    await observer.query('update batches set capacity_packs=1,capacity_bagels=6;')
    await a.query('begin;');await a.query(sql())
    const second=f.input(f.pack(),{checkoutSessionId:'33333333-3333-4333-8333-333333333333',orderCode:'BAG-SECOND'})
    const wait=pending(b,sql(second));await blocked(b);await a.query('commit;');failure(await wait,/capacity/)
    assert.deepEqual(await state(),{orders:1,snapshots:1,items:1,attempts:0})
  })
  await test('rolled-back first writer releases session for valid second writer',async(a,b)=>{
    await a.query('begin;');await a.query(sql())
    const wait=pending(b,sql(f.input(f.pack(),{orderCode:'BAG-AFTER-ROLLBACK'})));await blocked(b);await a.query('rollback;')
    assert.equal(success(await wait).orderCode,'BAG-AFTER-ROLLBACK')
    assert.deepEqual(await state(),{orders:1,snapshots:1,items:1,attempts:0})
  })
  await test('batch closing while waiting for row lock is rechecked after lock',async(a,b)=>{
    await observer.query("update batches set orders_close_at=clock_timestamp()+interval '700 milliseconds';")
    await a.query('begin;select id from batches for update;')
    const wait=pending(b,sql());await blocked(b)
    await a.query("select pg_sleep(greatest(0,extract(epoch from (select orders_close_at-clock_timestamp() from batches)))+0.05);commit;")
    failure(await wait,/batch.*unavailable/);assert.deepEqual(await state(),{orders:0,snapshots:0,items:0,attempts:0})
  })
  await test('v2 waiter rejects v1 reservation without snapshot on shared session lock',async(a,b)=>{
    const input=f.input();await a.query('begin;');await a.query(legacy(input))
    const wait=pending(b,sql(input));await blocked(b);await a.query('commit;');failure(await wait,/replay/)
    assert.deepEqual(await state(),{orders:1,snapshots:0,items:1,attempts:0})
  })
  await test('raw service-only v1 trust boundary: existing v2 requires HTTP contract rejection',async(a,b)=>{
    const input=f.input();await a.query('begin;');const first=JSON.parse(await a.query(sql(input)))
    const changed=clone(input);changed.orderCode='BAG-LEGACY-MISMATCH';changed.order.bagels={sesame:6}
    const wait=pending(b,legacy(changed));await blocked(b);await a.query('commit;')
    assert.equal(success(await wait).order_id,first.orderId)
    assert.equal(await observer.query('select flavor_slug from order_items;'),'plain')
    assert.deepEqual(await state(),{orders:1,snapshots:1,items:1,attempts:0})
    console.log('# Raw v1 trusts its service-role caller. Current HTTP adapter rejects guided-v1: pack_slug after reread (separate unit regression); never expose the raw RPC to consumers.')
  })
  console.log('1..'+serial)
  const failed=results.filter(r=>!r.pass);if(failed.length)throw Error(failed.length+' native concurrency tests failed')
}
