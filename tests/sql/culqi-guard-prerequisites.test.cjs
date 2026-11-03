/** Migration compatibility checks on owned synthetic, in-memory PGlite only. */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const f = require('./fixture.cjs')
const signatures = [
  'public.prepare_culqi_token_session(uuid)',
  'public.claim_culqi_charge(uuid,text,text,boolean)',
  'public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)',
]
const directory = path.join(f.root, 'supabase/migrations')
const files = fs.readdirSync(directory).filter(name => name.endsWith('_culqi_pending_charge_guard.sql'))
assert.equal(files.length, 1, 'exactly one forward pending-charge guard is required')
const migration = fs.readFileSync(path.join(directory, files[0]), 'utf8')
let db, baseline
const definitions = async () => (await db.query(`select p.oid::regprocedure::text signature,
  pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::regrole::text owner
  from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows
const data = async () => (await db.query(`select jsonb_build_object(
  'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from orders o),
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from payment_attempts a),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]') from order_status_history h),
  'snapshots',(select coalesce(jsonb_agg(to_jsonb(s) order by order_id),'[]') from order_guided_product_snapshots s),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from payment_webhook_events e),
  'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by provider_charge_id),'[]') from culqi_charge_confirmation_receipts r)) state`)).rows[0].state
async function rejectsWithoutPartialChanges() {
  const before = {functions: await definitions(), data: await data()}
  await assert.rejects(db.exec(migration), /requires the reviewed financial core/)
  await db.exec('rollback')
  assert.deepEqual(await definitions(), before.functions, 'preflight rejection must replace no function or ACL')
  assert.deepEqual(await data(), before.data, 'preflight rejection must preserve every synthetic row')
}
test.before(async () => {
  db = await f.createFixture(); await db.exec(f.migration())
  baseline = []
  for (const signature of signatures) baseline.push((await db.query(
    'select pg_get_functiondef(to_regprocedure($1)) definition', [signature])).rows[0].definition)
})
test.beforeEach(async () => {
  await f.reset(db)
  // Drop/recreate only these owned fixture functions so prior arg-name/default
  // drift is removed. No production source or immutable fixture is rewritten.
  for (let i = 0; i < signatures.length; i++) {
    await db.exec('drop function if exists ' + signatures[i])
    await db.exec(baseline[i])
    await db.exec(`revoke all on function ${signatures[i]} from public,anon,authenticated;
      grant execute on function ${signatures[i]} to service_role`)
  }
  const order = await f.call(db, f.api.prepareGuidedProductReservation(f.input()).args)
  await db.query('select public.prepare_culqi_token_session($1::uuid)', [order.orderId])
})
test.after(async () => {if (db) await db.close()})

for (let i = 0; i < signatures.length; i++) {
  const signature = signatures[i]
  test('unrecognized body is rejected before mutation: ' + signature, async () => {
    const unknown = baseline[i].replace('AS $function$', 'AS $function$\n-- Unreviewed synthetic implementation\n')
    assert.notEqual(unknown, baseline[i]); await db.exec(unknown)
    await rejectsWithoutPartialChanges()
  })
  test('search_path drift is rejected before mutation: ' + signature, async () => {
    await db.exec(`alter function ${signature} set search_path=public,pg_catalog`)
    await rejectsWithoutPartialChanges()
  })
  test('extra function configuration is rejected before mutation: ' + signature, async () => {
    await db.exec(`alter function ${signature} set statement_timeout='5s'`)
    await rejectsWithoutPartialChanges()
  })
  test('security invoker drift is rejected before mutation: ' + signature, async () => {
    await db.exec(`alter function ${signature} security invoker`)
    await rejectsWithoutPartialChanges()
  })
}

for (const [label, alteration] of [
  ['strict argument semantics', 'strict'],
  ['volatility', 'stable'],
  ['parallel execution', 'parallel safe'],
  ['missing configuration', 'reset all'],
]) test(label + ' drift is rejected before mutation', async () => {
  await db.exec(`alter function ${signatures[0]} ${alteration}`)
  await rejectsWithoutPartialChanges()
})

test('argument names are part of the reviewed RPC contract', async () => {
  await db.exec('drop function ' + signatures[0])
  await db.exec(baseline[0].replace('p_order_id uuid)', 'renamed_order_id uuid)'))
  await db.exec(`revoke all on function ${signatures[0]} from public,anon,authenticated;
    grant execute on function ${signatures[0]} to service_role`)
  await rejectsWithoutPartialChanges()
})
test('argument defaults cannot silently broaden the reviewed signature', async () => {
  await db.exec(baseline[0].replace('p_order_id uuid)', 'p_order_id uuid DEFAULT NULL::uuid)'))
  await rejectsWithoutPartialChanges()
})
test('a different procedural language cannot satisfy the prerequisite', async () => {
  await db.exec(`create or replace function public.prepare_culqi_token_session(p_order_id uuid)
    returns jsonb language sql security definer set search_path=public as $$select '{}'::jsonb$$`)
  await rejectsWithoutPartialChanges()
})
test('an exposed function cannot satisfy the service-only prerequisite', async () => {
  await db.exec(`grant execute on function ${signatures[0]} to anon`)
  await rejectsWithoutPartialChanges()
})
test('missing service execution privilege cannot satisfy the prerequisite', async () => {
  await db.exec(`revoke execute on function ${signatures[1]} from service_role`)
  await rejectsWithoutPartialChanges()
})
test('a missing reviewed function aborts before replacing either entry point', async () => {
  await db.exec('drop function ' + signatures[2])
  await rejectsWithoutPartialChanges()
})

test('known baseline upgrades and exact fixed replay preserve all data', async () => {
  const before = await data()
  await db.exec(migration)
  assert.deepEqual(await data(), before)
  const after = await definitions()
  await db.exec(migration)
  assert.deepEqual(await definitions(), after)
  assert.deepEqual(await data(), before)
})
test('a mixture of reviewed baseline and fixed entry points can complete the upgrade', async () => {
  await db.exec(migration)
  await db.exec(baseline[0])
  const before = await data()
  await db.exec(migration)
  assert.deepEqual(await data(), before)
})
