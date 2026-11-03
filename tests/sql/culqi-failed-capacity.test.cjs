/** Capacity and late-event regressions against the real financial SQL.
 * Every row is synthetic and PGlite lives only in memory. No provider or socket.
 * PGlite queues statements on one connection: these tests cover transaction
 * boundary orderings, not independent-session lock contention or deadlocks.
 */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const f = require('./fixture.cjs')
let db
const source = 'tkn_test_capacity_source_0001'
const charge = 'chr_test_capacity_charge_0001'
const input = n => f.input(f.pack(), {
  orderCode: 'BAG-CAPACITY-' + n,
  checkoutSessionId: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
})
const create = n => f.call(db, f.api.prepareGuidedProductReservation(input(n)).args)
const row = async id => (await db.query(`select payment_status,status,payment_charge_state,
  payment_charge_id,payment_charge_attempt_id,payment_charge_source_id,
  payment_reconciliation_required,payment_reconciliation_reason
  from public.orders where id=$1::uuid`, [id])).rows[0]
const event = async (order, type, id) => {
  const resource = {id: charge, amount: order.amountMinor, currency_code: 'PEN',
    source: {id: source}, metadata: {bagelito_order_code: order.orderCode},
    outcome: {decline_code: 'synthetic_decline', user_message: 'Synthetic failure'}}
  return (await db.query(`select public.apply_culqi_payment_event($1,$2,$3::jsonb,$4::jsonb) result`,
    [id, type, JSON.stringify(resource), JSON.stringify({resource, synthetic: true})])).rows[0].result
}
const snapshot = async () => (await db.query(`select
  (select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb) from public.orders o) orders,
  (select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.payment_attempts a) attempts,
  (select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]'::jsonb) from public.order_status_history h) history,
  (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]'::jsonb) from public.payment_webhook_events e) events,
  (select count(*)::int from public.culqi_charge_confirmation_receipts) receipts`)).rows[0]
async function failedReservation() {
  const order = await create(1)
  await db.query('select public.prepare_culqi_token_session($1::uuid)', [order.orderId])
  const claimed = (await db.query(`select public.claim_culqi_charge($1::uuid,$2,$3,false) result`,
    [order.orderId, source, 'synthetic-device'])).rows[0].result
  assert.equal(claimed.claimed, true)
  await event(order, 'charge.creation.failed', 'evt_test_capacity_failed_0001')
  assert.deepEqual(await row(order.orderId), {
    payment_status: 'failed', status: 'needs_correction', payment_charge_state: 'idle',
    payment_charge_id: null, payment_charge_attempt_id: null, payment_charge_source_id: source,
    payment_reconciliation_required: false, payment_reconciliation_reason: null,
  })
  const attempt = (await db.query(`select status,provider_charge_id from public.payment_attempts
    where order_id=$1::uuid`, [order.orderId])).rows[0]
  assert.deepEqual(attempt, {status: 'failed', provider_charge_id: charge})
  return order
}

test.before(async t => {
  db = await f.createFixture()
  await db.exec(f.migration())
  const dir = path.join(f.root, 'supabase/migrations')
  const guards = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /_culqi_pending_charge_guard\.sql$/.test(name)).sort() : []
  assert.ok(guards.length <= 1, 'only one pending-charge guard migration is expected')
  for (const name of guards) await db.exec(fs.readFileSync(path.join(dir, name), 'utf8'))
  t.diagnostic(guards.length ? 'Forward pending-charge guard applied in memory' : 'Baseline financial core; no guard migration exists yet')
})
test.beforeEach(async () => {
  await f.reset(db)
  await db.exec('truncate public.payment_webhook_events; update public.batches set capacity_packs=1,capacity_bagels=6')
})
test.after(async () => {if (db) await db.close()})

test('unexpired failed reservation retains the last order and bagel slot', async () => {
  const order = await failedReservation(), before = await snapshot()
  await assert.rejects(create(2), /capacity/i)
  assert.deepEqual(await snapshot(), before, 'capacity rejection must not mutate the original or add partial records')
  assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n, 1)
  assert.equal((await row(order.orderId)).status, 'needs_correction')
})

test('same-source success after failure before expiry confirms the retained reservation', async () => {
  const order = await failedReservation()
  await event(order, 'charge.creation.succeeded', 'evt_test_capacity_success_0001')
  const saved = await row(order.orderId)
  assert.equal(saved.payment_status, 'paid'); assert.equal(saved.status, 'payment_confirmed')
  assert.equal(saved.payment_charge_state, 'submitted'); assert.equal(saved.payment_charge_id, charge)
  assert.equal(saved.payment_reconciliation_required, false); assert.equal(saved.payment_reconciliation_reason, null)
  const attempt = (await db.query(`select status,paid_at is not null paid from public.payment_attempts
    where order_id=$1::uuid`, [order.orderId])).rows[0]
  assert.deepEqual(attempt, {status: 'paid', paid: true})
  await assert.rejects(create(2), /capacity/i)
  assert.equal((await snapshot()).receipts, 0, 'a webhook must not manufacture a POST/GET receipt')
})

test('expired failed hold may be replaced but its later success stays cancelled for reconciliation', async () => {
  const first = await failedReservation()
  // Deterministic expired evidence on owned synthetic rows; no wall-clock sleep.
  await db.query(`update public.orders set payment_expires_at=clock_timestamp()-interval '1 second' where id=$1::uuid`, [first.orderId])
  await db.query(`update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where order_id=$1::uuid`, [first.orderId])
  const second = await create(2)
  await event(first, 'charge.creation.succeeded', 'evt_test_capacity_late_0001')
  const old = await row(first.orderId)
  assert.equal(old.payment_status, 'paid'); assert.equal(old.status, 'cancelled')
  assert.equal(old.payment_reconciliation_required, true)
  assert.equal(old.payment_reconciliation_reason, 'payment_after_reservation_release')
  const replacement = await row(second.orderId)
  assert.equal(replacement.payment_status, 'pending'); assert.equal(replacement.status, 'payment_pending_review')
  const totals = (await db.query(`select count(*)::int orders,sum(pack_units)::int bagels
    from public.orders where status<>'cancelled'`)).rows[0]
  assert.deepEqual(totals, {orders: 1, bagels: 6}, 'only the replacement may consume fulfillment capacity')
  assert.equal((await db.query(`select count(*)::int n from public.order_status_history
    where order_id=$1::uuid and new_status='payment_confirmed'`, [first.orderId])).rows[0].n, 0)
  await assert.rejects(create(3), /capacity/i)
  const beforeDuplicate = await snapshot()
  assert.deepEqual(await event(first, 'charge.creation.succeeded', 'evt_test_capacity_late_0001'), {duplicate: true})
  assert.deepEqual(await snapshot(), beforeDuplicate)
})

test('duplicate failure and success deliveries do not replay payment or fulfillment transitions', async () => {
  const order = await failedReservation(), failed = await snapshot()
  assert.deepEqual(await event(order, 'charge.creation.failed', 'evt_test_capacity_failed_0001'), {duplicate: true})
  assert.deepEqual(await snapshot(), failed)
  await event(order, 'charge.creation.succeeded', 'evt_test_capacity_success_0001')
  const paid = await snapshot()
  assert.deepEqual(await event(order, 'charge.creation.succeeded', 'evt_test_capacity_success_0001'), {duplicate: true})
  assert.deepEqual(await snapshot(), paid)
  await event(order, 'charge.creation.succeeded', 'evt_test_capacity_redelivery_0001')
  const redelivered = await snapshot()
  assert.deepEqual(redelivered.orders, paid.orders); assert.deepEqual(redelivered.attempts, paid.attempts)
  assert.deepEqual(redelivered.history, paid.history); assert.equal(redelivered.receipts, 0)
  assert.equal(redelivered.events.length, paid.events.length + 1, 'distinct verified event identity is recorded once')
  assert.equal((await row(order.orderId)).payment_reconciliation_required, false)
})
