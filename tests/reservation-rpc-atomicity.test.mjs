import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/load-ts.mjs';

function reservationForm() {
  const form = new FormData();
  const values = {
    packSlug: '6-single', items: JSON.stringify([{ flavorSlug: 'plain', quantity: 6 }]),
    customerName: 'Synthetic Customer', whatsapp: '000000000', email: 'qa@example.invalid',
    deliveryAddress: 'Synthetic address 123', district: 'Lince', paymentMethod: 'Yape',
    paymentTransactionNumber: 'SYNTHETIC-001', paymentHolderName: 'Synthetic Customer',
    paymentPhoneNumber: '000000000', exactAmountConfirmed: 'true', termsAccepted: 'true',
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  form.set('paymentScreenshot', new File(['synthetic proof'], 'proof.png', { type: 'image/png' }));
  return form;
}

// Execute the real service, schema, catalog and pricing. Only external I/O is
// replaced. The mutable DB deliberately supports the old non-atomic inserts so
// reverting the fix reproduces the overbooking rather than failing on a mock.
function fixture({ rpcError = null, rpcThrows = false, rpcRow, concurrentReads = 1,
  cleanupError = null, uploadError = null } = {}) {
  const orders = [], items = [], history = [], writes = [], uploads = [], removed = [];
  const rpcCalls = [], usageSnapshots = [], errors = [], warnings = [];
  let sequence = 0, readers = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const batch = { id: 'synthetic-batch', name: 'Synthetic batch', status: 'orders_open',
    orders_open_at: null, orders_close_at: null, delivery_date: null,
    capacity_packs: 1, capacity_bagels: 6 };
  const db = {
    from(table) {
      if (table === 'batches') return { select: () => ({ order: () => ({ limit: () => ({
        maybeSingle: async () => ({ data: batch, error: null }),
      }) }) }) };
      return {
        select() {
          assert.equal(table, 'orders');
          return { eq: () => ({ neq: async () => {
            const snapshot = orders.map(row => ({ ...row }));
            usageSnapshots.push(snapshot);
            if (++readers === concurrentReads) release();
            await barrier;
            return { data: snapshot, error: null };
          } }) };
        },
        insert(input) {
          writes.push(table);
          const rows = Array.isArray(input) ? input : [input];
          const target = { orders, order_items: items, order_status_history: history }[table];
          assert.ok(target, `Unexpected table ${table}`);
          const inserted = rows.map(row => ({ id: `synthetic-${target.length + 1}`, ...row }));
          target.push(...inserted);
          return { data: null, error: null, select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
          }) };
        },
      };
    },
    rpc(name, input) {
      if (name === 'next_order_code') return Promise.resolve({ data: `BAG-SYNTHETIC-${++sequence}`, error: null });
      assert.equal(name, 'create_reservation_order');
      rpcCalls.push(input);
      return { single: async () => {
        if (rpcThrows) throw new Error('Synthetic RPC transport failure');
        if (rpcError) return { data: null, error: rpcError };
        if (rpcRow !== undefined) return { data: rpcRow, error: null };
        const row = { id: 'synthetic-rpc-order', order_code: input.p_order_code,
          pack_units: input.p_pack_units, status: 'payment_pending_review' };
        orders.push(row);
        items.push(...input.p_items.map(item => ({ ...item, order_id: row.id })));
        history.push({ order_id: row.id, new_status: row.status });
        return { data: { order_id: row.id, order_code: row.order_code }, error: null };
      } };
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'payment-proofs');
      return {
        upload: async (path, file, options) => {
          uploads.push({ path, file, options });
          return { error: uploadError };
        },
        remove: async paths => { removed.push(...paths); return { error: cleanupError }; },
      };
    } },
  };
  const service = sourceModule('src/lib/reservations/service.ts', {
    '@/lib/env': { getMissingReservationEnv: () => [] },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
    '@/lib/monitoring': {
      logError: (...args) => errors.push(args), logWarn: (...args) => warnings.push(args),
    },
  });
  return { ...service, orders, items, history, writes, uploads, removed, rpcCalls, usageSnapshots, errors, warnings };
}

const rpcFailures = [
  { code: '42883', message: 'function create_reservation_order does not exist' },
  { code: 'PGRST202', message: 'Could not find the function public.create_reservation_order in the schema cache' },
  { code: '42501', message: 'permission denied for function create_reservation_order' },
  { code: '23514', message: 'create_reservation_order: capacity constraint failed' },
  { code: 'XX000', message: 'Synthetic database failure' },
];

for (const rpcError of rpcFailures) {
  test(`RPC ${rpcError.code} rejects the reservation, removes proof and never inserts partial rows`, async () => {
    const f = fixture({ rpcError });
    await assert.rejects(f.createReservation(reservationForm()), /Could not create reservation:/);
    assert.equal(f.rpcCalls.length, 1);
    assert.equal(f.uploads.length, 1);
    assert.deepEqual(f.removed, f.uploads.map(upload => upload.path));
    assert.deepEqual(f.writes, []);
    assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    assert.equal(f.errors[0][0], 'reservation_create_failed_after_upload');
  });
}

for (const rpcError of rpcFailures.slice(0, 3)) {
  test(`concurrent requests with RPC ${rpcError.code} cannot overbook one pack / six bagels`, async () => {
    const f = fixture({ rpcError, concurrentReads: 2 });
    const results = await Promise.allSettled([
      f.createReservation(reservationForm()), f.createReservation(reservationForm()),
    ]);
    assert.deepEqual(f.usageSnapshots, [[], []], 'Both preflight reads see no usage');
    assert.equal(f.rpcCalls.length, 2);
    assert.equal(f.orders.length, 0, `Unsafe fallback wrote ${f.orders.length} orders / ${f.orders.reduce((n, row) => n + row.pack_units, 0)} bagels`);
    assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
    assert.deepEqual(f.writes, []);
    assert.deepEqual([f.items, f.history], [[], []]);
    assert.equal(f.uploads.length, 2);
    assert.deepEqual(f.removed.sort(), f.uploads.map(upload => upload.path).sort());
  });
}

test('successful RPC preserves total, consent, items and uploaded proof', async () => {
  const f = fixture();
  assert.deepEqual(await f.createReservation(reservationForm()), {
    amount: 58, orderCode: 'BAG-SYNTHETIC-1', packSlug: '6-single',
  });
  const input = f.rpcCalls[0];
  assert.equal(input.p_total_amount, 58); // Catalog S/50 + real Lince delivery S/8.
  assert.equal(input.p_pack_units, 6);
  assert.equal(input.p_exact_amount_confirmed, true);
  assert.equal(input.p_terms_accepted, true);
  assert.deepEqual(input.p_items, [{ flavor_name: 'Plain', flavor_slug: 'plain', quantity: 6 }]);
  assert.equal(input.p_payment_screenshot_path, f.uploads[0].path);
  assert.deepEqual(f.uploads[0].options, { contentType: 'image/png', upsert: false });
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
  assert.equal(f.orders.length, 1);
  assert.equal(f.items.length, 1);
  assert.equal(f.history.length, 1);
});

for (const rpcRow of [null, {}, { order_id: 'synthetic' }, { order_code: 'BAG-SYNTHETIC' }]) {
  test(`incomplete RPC row ${JSON.stringify(rpcRow)} fails closed and cleans proof`, async () => {
    const f = fixture({ rpcRow });
    await assert.rejects(f.createReservation(reservationForm()), /transaction returned no order row/);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.removed, f.uploads.map(upload => upload.path));
  });
}

test('RPC transport rejection still removes the uploaded proof', async () => {
  const f = fixture({ rpcThrows: true });
  await assert.rejects(f.createReservation(reservationForm()), /Synthetic RPC transport failure/);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, f.uploads.map(upload => upload.path));
});

test('cleanup failure logs a warning and preserves the reservation error', async () => {
  const f = fixture({ rpcError: rpcFailures[4], cleanupError: { message: 'Synthetic storage failure' } });
  await assert.rejects(f.createReservation(reservationForm()), /Could not create reservation: Synthetic database failure/);
  assert.equal(f.warnings[0][0], 'reservation_payment_proof_cleanup_failed');
  assert.equal(f.errors[0][0], 'reservation_create_failed_after_upload');
  assert.deepEqual(f.writes, []);
});

test('upload failure never attempts the reservation RPC or database writes', async () => {
  const f = fixture({ uploadError: { message: 'Synthetic upload failure' } });
  await assert.rejects(f.createReservation(reservationForm()), /Could not upload payment proof:/);
  assert.deepEqual(f.rpcCalls, []);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
});

test('false consent or unconfirmed amount fails before uploading or reserving', async () => {
  for (const field of ['termsAccepted', 'exactAmountConfirmed']) {
    const f = fixture(), form = reservationForm();
    form.set(field, 'false');
    await assert.rejects(f.createReservation(form));
    assert.deepEqual(f.uploads, []);
    assert.deepEqual(f.rpcCalls, []);
    assert.deepEqual(f.writes, []);
  }
});
