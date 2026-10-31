import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/load-ts.mjs';

const batchId = 'synthetic-capacity-batch';

function capacityOrder(overrides = {}) {
  return {
    pack_units: 6,
    status: 'payment_pending_review',
    ...overrides,
  };
}

// Load the complete production service; replace only the database/env boundary.
// Unsupported database operations fail the test, and no client can reach a provider.
async function availability(batchOverrides = {}, orders = []) {
  const batch = {
    id: batchId,
    name: 'Synthetic capacity batch',
    status: 'orders_open',
    orders_open_at: null,
    orders_close_at: null,
    delivery_date: null,
    capacity_packs: null,
    capacity_bagels: null,
    ...batchOverrides,
  };
  const reads = [];
  const supabase = {
    from(table) {
      if (table === 'batches') {
        return {
          select() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() {
            reads.push('batches');
            return { data: batch, error: null };
          },
        };
      }
      assert.equal(table, 'orders');
      return {
        select() { return this; },
        eq(column, value) {
          assert.equal(column, 'batch_id');
          assert.equal(value, batchId);
          return this;
        },
        async neq(column, value) {
          assert.equal(column, 'status');
          assert.equal(value, 'cancelled');
          reads.push('orders');
          return { data: orders.filter(order => order.status !== value), error: null };
        },
      };
    },
  };
  const { getReservationBatchAvailability } = sourceModule('src/lib/reservations/service.ts', {
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => supabase },
    '@/lib/env': { getMissingReservationEnv: () => [] },
  });
  const result = await getReservationBatchAvailability();
  assert.deepEqual(reads, ['batches', 'orders']);
  assert.equal(result.batchName, batch.name, 'the service must return the database batch, not its catch fallback');
  assert.equal(result.status, batch.status);
  return result;
}

for (const [name, capacities, remaining] of [
  ['pack capacity only', { capacity_packs: 0 }, { packs: 0, bagels: null }],
  ['bagel capacity only', { capacity_bagels: 0 }, { packs: null, bagels: 0 }],
  ['both capacities', { capacity_packs: 0, capacity_bagels: 0 }, { packs: 0, bagels: 0 }],
]) {
  test(`zero ${name} closes an empty orders_open batch`, async () => {
    const result = await availability(capacities);
    assert.deepEqual({
      accepting: result.accepting,
      remainingPacks: result.remainingPacks,
      remainingBagels: result.remainingBagels,
    }, {
      accepting: false,
      remainingPacks: remaining.packs,
      remainingBagels: remaining.bagels,
    });
    assert.equal(result.reservedPacks, 0);
    assert.equal(result.reservedBagels, 0);
  });
}

for (const capacity of [null, undefined]) {
  test(`${String(capacity)} capacities remain unlimited with existing reservations`, async () => {
    const result = await availability({ capacity_packs: capacity, capacity_bagels: capacity }, [
      capacityOrder(), capacityOrder({ pack_units: 10 }),
    ]);
    assert.equal(result.accepting, true);
    assert.equal(result.remainingPacks, null);
    assert.equal(result.remainingBagels, null);
    assert.equal(result.reservedPacks, 2);
    assert.equal(result.reservedBagels, 16);
  });
}

test('positive capacities report exact remaining stock and accept one more six-pack', async () => {
  const result = await availability({ capacity_packs: 3, capacity_bagels: 24 }, [
    capacityOrder(), capacityOrder(),
  ]);
  assert.equal(result.accepting, true);
  assert.equal(result.remainingPacks, 1);
  assert.equal(result.remainingBagels, 12);
  assert.equal(result.reservedPacks, 2);
  assert.equal(result.reservedBagels, 12);
});

for (const [name, capacities, orders, expected] of [
  ['last six-pack fits exactly', { capacity_packs: 1, capacity_bagels: 6 }, [], { accepting: true, packs: 1, bagels: 6 }],
  ['pack capacity exhausted', { capacity_packs: 2, capacity_bagels: 24 }, [capacityOrder(), capacityOrder()], { accepting: false, packs: 0, bagels: 12 }],
  ['bagel capacity exhausted', { capacity_packs: 5, capacity_bagels: 12 }, [capacityOrder(), capacityOrder()], { accepting: false, packs: 3, bagels: 0 }],
  ['fewer than six bagels left', { capacity_bagels: 5 }, [], { accepting: false, packs: null, bagels: 5 }],
  ['existing overuse clamps remaining stock to zero', { capacity_packs: 1, capacity_bagels: 6 }, [capacityOrder(), capacityOrder()], { accepting: false, packs: 0, bagels: 0 }],
]) {
  test(name, async () => {
    const result = await availability(capacities, orders);
    assert.equal(result.accepting, expected.accepting);
    assert.equal(result.remainingPacks, expected.packs);
    assert.equal(result.remainingBagels, expected.bagels);
  });
}

test('capacity still excludes cancelled and expired unpaid holds but retains paid and archived orders', async () => {
  const result = await availability({ capacity_packs: 4, capacity_bagels: 30 }, [
    capacityOrder({ status: 'cancelled' }),
    capacityOrder({ payment_provider: 'culqi', payment_status: 'pending', payment_expires_at: '2000-01-01T00:00:00Z' }),
    capacityOrder({ payment_provider: 'culqi', payment_status: 'failed', payment_expires_at: '2000-01-01T00:00:00Z' }),
    capacityOrder({ payment_provider: 'culqi', payment_status: 'paid', payment_expires_at: '2000-01-01T00:00:00Z', status: 'payment_confirmed' }),
    capacityOrder({ status: 'payment_confirmed', pack_units: 10, order_status_history: [{ new_status: 'archived' }] }),
  ]);
  assert.equal(result.accepting, true);
  assert.equal(result.reservedPacks, 2);
  assert.equal(result.reservedBagels, 16);
  assert.equal(result.remainingPacks, 2);
  assert.equal(result.remainingBagels, 14);
});

for (const [name, fields] of [
  ['closed status', { status: 'orders_closed' }],
  ['future opening', { orders_open_at: '2999-01-01T00:00:00Z' }],
  ['past closing', { orders_close_at: '2000-01-01T00:00:00Z' }],
  ['malformed closing', { orders_close_at: 'invalid-date' }],
]) {
  test(`${name} blocks reservations despite unlimited capacity`, async () => {
    const result = await availability(fields);
    assert.equal(result.accepting, false);
    assert.equal(result.remainingPacks, null);
    assert.equal(result.remainingBagels, null);
  });
}
