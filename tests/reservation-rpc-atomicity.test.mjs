import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { manualFixture, manualForm } from './helpers/manual-reservation-fixture.mjs';

const operationId = '11111111-1111-4111-8111-111111111111';

function assertNoPartialOrders(f) {
  assert.deepEqual(f.writes, [], 'The service must never write orders outside its RPC');
  assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
  assert.deepEqual(f.removed, [], 'Bound operation evidence must never be deleted');
}

function assertFailureContext(f, stage) {
  assert.ok(f.errors.some(([, , context]) => context?.operationId === operationId
    && context.stage === stage && typeof context.outcome === 'string'),
  'Backend failure logs must preserve operation identity, stage and outcome');
}

const unavailableRpcErrors = [
  { code: '42883', message: 'function prepare_manual_reservation_v1 does not exist' },
  { code: 'PGRST202', message: 'Could not find the function public.prepare_manual_reservation_v1 in the schema cache' },
  { code: '42501', message: 'permission denied for function prepare_manual_reservation_v1' },
];

for (const prepareError of unavailableRpcErrors) {
  test(`prepare RPC ${prepareError.code} is unavailable before any proof upload or partial order`, async () => {
    const f = manualFixture({ prepareError });
    await assert.rejects(f.createReservation(manualForm(operationId)), error => error.status === 503);
    assert.equal(f.rpcCalls.filter(call => call.name === 'prepare_manual_reservation_v1').length, 1);
    assert.equal(f.rpcCalls.filter(call => call.name === 'finalize_manual_reservation_v1').length, 0);
    assert.deepEqual(f.uploads, []);
    assertNoPartialOrders(f);
    assertFailureContext(f, 'prepare');
  });
}

for (const prepareError of unavailableRpcErrors) {
  test(`concurrent prepare failures ${prepareError.code} cannot overbook one pack / six bagels`, async () => {
    const f = manualFixture({ prepareError });
    const results = await Promise.allSettled([
      f.createReservation(manualForm(operationId)),
      f.createReservation(manualForm('22222222-2222-4222-8222-222222222222')),
    ]);
    assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
    assert.ok(results.every(result => result.reason.status === 503));
    assert.deepEqual(f.uploads, []);
    assertNoPartialOrders(f);
  });
}

test('successful atomic reservation preserves total, amount consent, items and stable uploaded proof', async () => {
  const f = manualFixture();
  assert.deepEqual(await f.createReservation(manualForm(operationId)), {
    amount: 58, orderCode: 'BAG-SYNTHETIC-1', packSlug: '6-single', operationId, replayed: false,
  });
  const prepare = f.rpcCalls.find(call => call.name === 'prepare_manual_reservation_v1').input;
  const input = prepare.p_order_payload;
  assert.equal(input.total_amount, 58); // Catalog S/50 + real Lince delivery S/8.
  assert.equal(input.pack_units, 6);
  assert.equal(input.exact_amount_confirmed, true);
  assert.equal(input.terms_accepted, true);
  assert.deepEqual(input.items, [{ flavor_name: 'Plain', flavor_slug: 'plain', quantity: 6 }]);
  assert.equal(input.pack_slug, '6-single');
  assert.equal(input.payment_transaction_number, 'SYNTHETIC-001');
  assert.equal(prepare.p_operation_id, operationId);
  assert.match(prepare.p_owner_hash, /^[a-f0-9]{64}$/);
  assert.match(prepare.p_request_hash, /^[a-f0-9]{64}$/);
  assert.equal(prepare.p_proof_sha256, createHash('sha256').update('synthetic proof').digest('hex'));
  assert.equal(prepare.p_proof_type, 'image/png');
  assert.equal(prepare.p_proof_size, Buffer.byteLength('synthetic proof'));
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].path, `manual/${operationId}/${prepare.p_proof_sha256}.png`);
  assert.deepEqual(f.uploads[0].options, { contentType: 'image/png', upsert: false });
  const finalize = f.rpcCalls.find(call => call.name === 'finalize_manual_reservation_v1').input;
  assert.deepEqual(finalize, {
    p_operation_id: operationId, p_owner_hash: prepare.p_owner_hash, p_request_hash: prepare.p_request_hash,
  });
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
  assert.equal(f.orders.length, 1);
  assert.equal(f.items.length, 1);
  assert.equal(f.history.length, 1);
  assert.equal(f.orders[0].total_amount, 58);
  assert.equal(f.orders[0].pack_units, 6);
  assert.equal(f.orders[0].payment_screenshot_path, f.uploads[0].path);
});

for (const finalizeError of [
  { code: '23514', message: 'Synthetic reservation capacity constraint failed' },
  { code: 'P0001', message: 'This Bagelito batch is full. Join the waitlist.' },
]) {
  test(`known finalize SQL rejection ${finalizeError.code} retains proof and cannot insert partial rows`, async () => {
    const f = manualFixture({ finalizeError, cleanupThrow: true });
    await assert.rejects(f.createReservation(manualForm(operationId)), error => error.status === 400);
    assert.equal(f.uploads.length, 1);
    assert.equal(f.objects.size, 1);
    assert.equal(f.rpcCalls.filter(call => call.name === 'finalize_manual_reservation_v1').length, 1);
    assertNoPartialOrders(f);
    assertFailureContext(f, 'finalize');
  });
}

test('unknown initial prepare error retries its same identity once and then returns pending before upload', async () => {
  const f = manualFixture({ prepareError: { code: '', message: 'Synthetic transport returned no confirmation' } });
  await assert.rejects(f.createReservation(manualForm(operationId)), error => {
    assert.equal(error.status, 202);
    assert.equal(error.code, 'manual_reservation_pending');
    assert.equal(error.operationId, operationId);
    return true;
  });
  const calls = f.rpcCalls.filter(call => call.name === 'prepare_manual_reservation_v1');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].input, calls[1].input);
  assert.deepEqual(f.uploads, []);
  assertNoPartialOrders(f);
  assertFailureContext(f, 'prepare');
});

test('unknown finalize error returns pending while retaining proof and original operation identity', async () => {
  const f = manualFixture({ finalizeError: { code: '', message: 'Synthetic transport returned no confirmation' }, cleanupThrow: true });
  await assert.rejects(f.createReservation(manualForm(operationId)), error => {
    assert.equal(error.status, 202);
    assert.equal(error.code, 'manual_reservation_pending');
    assert.equal(error.operationId, operationId);
    return true;
  });
  assert.equal(f.uploads.length, 1);
  assert.equal(f.objects.size, 1);
  const prepares = f.rpcCalls.filter(call => call.name === 'prepare_manual_reservation_v1');
  const reads = f.rpcCalls.filter(call => call.name === 'read_manual_reservation_v1');
  assert.equal(prepares.length, 1);
  assert.equal(reads.length, 2, 'One private reconciliation follows the uncertain finalize');
  assert.equal(reads[1].input.p_operation_id, operationId);
  assert.equal(reads[1].input.p_request_hash, prepares[0].input.p_request_hash);
  assertNoPartialOrders(f);
  assertFailureContext(f, 'finalize');
});

test('finalize transport rejection cannot delete evidence or be masked by a rejected remove', async () => {
  const f = manualFixture({ finalizeThrow: true, cleanupThrow: true });
  await assert.rejects(f.createReservation(manualForm(operationId)), error => {
    assert.equal(error.status, 202);
    assert.equal(error.code, 'manual_reservation_pending');
    assert.equal(error.operationId, operationId);
    return true;
  });
  assert.equal(f.objects.size, 1);
  assertNoPartialOrders(f);
  assertFailureContext(f, 'finalize');
});

test('upload failure without verifiable proof leaves the bound operation pending and never finalizes', async () => {
  const f = manualFixture({ uploadError: { message: 'Synthetic upload failure' }, cleanupThrow: true });
  await assert.rejects(f.createReservation(manualForm(operationId)), error => error.status === 202 && error.operationId === operationId);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.rpcCalls.filter(call => call.name === 'finalize_manual_reservation_v1').length, 0);
  assertNoPartialOrders(f);
});

test('false consent or unconfirmed amount fails before all external I/O', async () => {
  for (const field of ['termsAccepted', 'exactAmountConfirmed']) {
    const f = manualFixture();
    await assert.rejects(f.createReservation(manualForm(operationId, { [field]: 'false' })));
    assert.deepEqual(f.uploads, []);
    assert.deepEqual(f.rpcCalls, []);
    assertNoPartialOrders(f);
  }
});

for (const [name, proof] of [
  ['absent', null],
  ['empty', new File([], 'proof.png', { type: 'image/png' })],
  ['unsupported type', new File(['synthetic'], 'proof.pdf', { type: 'application/pdf' })],
  ['oversized', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'proof.png', { type: 'image/png' })],
]) {
  test(`${name} proof fails validation before operation preparation`, async () => {
    const f = manualFixture();
    await assert.rejects(f.createReservation(manualForm(operationId, { paymentScreenshot: proof })));
    assert.deepEqual(f.rpcCalls, []);
    assert.deepEqual(f.uploads, []);
    assertNoPartialOrders(f);
  });
}

for (const value of [null, '', 'not-a-uuid', '11111111-1111-1111-8111-111111111111']) {
  test(`manual operation id ${String(value)} fails validation before external I/O`, async () => {
    const f = manualFixture();
    await assert.rejects(f.createReservation(manualForm(operationId, { operationId: value })));
    assert.deepEqual(f.rpcCalls, []);
    assert.deepEqual(f.uploads, []);
    assertNoPartialOrders(f);
  });
}
