import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { computeBatchUsage, projectBatchAvailability, fallbackBatchAvailability } = require('../.migration-test-dist/lib/batch-read.js')
const now = Date.UTC(2026, 9, 27, 16, 0, 0)
const past = new Date(now - 60_000).toISOString()
const future = new Date(now + 60_000).toISOString()
const batch = {
  id:'batch-1',name:'Friday batch',status:'orders_open',orders_open_at:past,
  orders_close_at:future, delivery_date:future,capacity_packs:3,capacity_bagels:18
}
const row = (pack_units, overrides = {}) => ({pack_units, payment_provider:'manual',payment_status:'paid',status:'payment_confirmed',...overrides})

test('no current batch projects a non-orderable closed state',()=>{
  assert.deepEqual(projectBatchAvailability(null,[],now),fallbackBatchAvailability('closed'))
})
test('open batch without reservations accepts 6-pack and preserves metadata',()=>{
  const a=projectBatchAvailability(batch,[],now)
  assert.equal(a.accepting,true); assert.equal(a.remainingBagels,18); assert.equal(a.remainingPacks,3)
  assert.equal(a.batchName,'Friday batch')
})
test('expired or waitlist status cannot accept',()=>{
  assert.equal(projectBatchAvailability({...batch,orders_close_at:past},[],now).accepting,false)
  assert.equal(projectBatchAvailability({...batch,status:'waitlist_open'},[],now).accepting,false)
})
test('pack capacity blocks additional reservation',()=>{
  const a=projectBatchAvailability(batch,[row(2),row(2),row(2)],now)
  assert.equal(a.reservedPacks,3);assert.equal(a.remainingPacks,0);assert.equal(a.accepting,false)
})
test('bagel capacity blocks last 6 units while leaving count clamp intact',()=>{
  const a=projectBatchAvailability({...batch,capacity_packs:null},[row(12),row(4)],now)
  assert.equal(a.remainingBagels,2); assert.equal(a.accepting,false)
})
test('expired Culqi pending or failed holds do not use capacity',()=>{
  const orders=[row(6,{payment_provider:'culqi',payment_status:'pending',payment_expires_at:past}),row(6,{payment_provider:'culqi',payment_status:'failed',payment_expires_at:past})]
  assert.deepEqual(computeBatchUsage(orders,now),{reservedBagels:0,reservedPacks:0})
})
test('unexpired Culqi pending holds still consume capacity',()=>{
  const orders=[row(6,{payment_provider:'culqi',payment_status:'pending',payment_expires_at:future})]
  assert.deepEqual(computeBatchUsage(orders,now),{reservedBagels:6,reservedPacks:1})
})
test('paid Culqi order still counts even when expiration timestamp is past',()=>{
  const orders=[row(6,{payment_provider:'culqi',payment_status:'paid',payment_expires_at:past})]
  assert.deepEqual(computeBatchUsage(orders,now),{reservedBagels:6,reservedPacks:1})
})
test('cancelled reservations never count',()=>{
  assert.deepEqual(computeBatchUsage([row(6,{status:'cancelled'})],now),{reservedBagels:0,reservedPacks:0})
})
test('null capacity means no published cap; quote is still not a payment reservation',()=>{
  const a=projectBatchAvailability({...batch,capacity_bagels:null,capacity_packs:null},[row(30)],now)
  assert.equal(a.accepting,true); assert.equal(a.remainingBagels,null); assert.equal(a.remainingPacks,null)
})
