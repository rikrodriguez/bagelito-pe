import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isBatchAcceptingOrders, ordersOpenStatus } = require('../.migration-test-dist/lib/batch-availability.js')
const { getPublicBatchDisplay } = require('../.migration-test-dist/lib/public-batch-display.js')

const now = Date.UTC(2026, 9, 27, 12, 0, 0)
const past = new Date(now - 3600_000).toISOString()
const future = new Date(now + 3600_000).toISOString()

test('only orders_open batches accept new orders', () => {
  assert.equal(ordersOpenStatus, 'orders_open')
  assert.equal(isBatchAcceptingOrders('orders_open', null, now), true)
  assert.equal(isBatchAcceptingOrders('orders_open', future, now), true)
  assert.equal(isBatchAcceptingOrders('orders_open', past, now), false)
  assert.equal(isBatchAcceptingOrders('waitlist_open', future, now), false)
  assert.equal(isBatchAcceptingOrders('orders_open', 'invalid', now), false)
})

test('public batch messaging does not display expired opening dates', () => {
  const result = getPublicBatchDisplay({
    accepting: false, status: 'waitlist_open',
    ordersOpenAt: past, deliveryDate: past
  }, now)
  assert.deepEqual(result, { nextOpeningAt: null, showFutureDelivery: false })
})

test('public batch messaging permits only future waitlist opening', () => {
  const result = getPublicBatchDisplay({
    accepting: false, status: 'waitlist_open',
    ordersOpenAt: future, deliveryDate: future
  }, now)
  assert.deepEqual(result, { nextOpeningAt: future, showFutureDelivery: true })
})

test('delivered batches never promise future deliveries', () => {
  const result = getPublicBatchDisplay({
    accepting: false, status: 'delivered',
    ordersOpenAt: future, deliveryDate: future
  }, now)
  assert.deepEqual(result, { nextOpeningAt: null, showFutureDelivery: false })
})
