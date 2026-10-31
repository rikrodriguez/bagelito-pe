import test from 'node:test';
import assert from 'node:assert/strict';
import { manualFixture, manualForm, operationId, secondOperationId, sha256 } from './helpers/manual-reservation-fixture.mjs';

const prepareName = 'prepare_manual_reservation_v1';
const finalizeName = 'finalize_manual_reservation_v1';
const readName = 'read_manual_reservation_v1';
const calls = (f, name) => f.rpcCalls.filter(call => call.name === name);

function pending(error) {
  assert.equal(error.status, 202);
  assert.equal(error.code, 'manual_reservation_pending');
  assert.equal(error.operationId, operationId);
  assert.equal(error.state, 'pending');
  return true;
}

function exactlyOnePurchase(f) {
  assert.equal(f.orders.length, 1);
  assert.equal(f.items.length, 1);
  assert.equal(f.history.length, 1);
  assert.equal(f.orders[0].total_amount, 58);
  assert.equal(f.orders[0].pack_units, 6);
  assert.equal(f.orders[0].terms_accepted, true);
  assert.equal(f.orders[0].exact_amount_confirmed, true);
  assert.deepEqual(f.items[0], {
    order_id: f.orders[0].id, flavor_name: 'Plain', flavor_slug: 'plain', quantity: 6,
  });
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
}

test('commit followed by lost finalize response reconciles the original purchase', async () => {
  const f = manualFixture({ finalizeFaults: [{ when: 'after', throw: 'Synthetic response lost after commit' }] });
  const result = await f.createReservation(manualForm());
  assert.deepEqual(result, {
    amount: 58, operationId, orderCode: 'BAG-SYNTHETIC-1', packSlug: '6-single', replayed: true,
  });
  assert.equal(calls(f, prepareName).length, 1);
  assert.equal(calls(f, readName).length, 2);
  assert.deepEqual(calls(f, readName)[0].input, calls(f, readName)[1].input);
  assert.equal(calls(f, finalizeName).length, 1);
  assert.equal(f.objects.size, 1);
  exactlyOnePurchase(f);
});

test('unavailable reconciliation returns 202, then the same operation recovers even after its last slot is consumed', async () => {
  const f = manualFixture({
    finalizeFaults: [{ when: 'after', throw: 'Synthetic response lost after commit' }],
    readFaults: [null, { throw: 'Synthetic reconciliation unavailable' }],
  });
  await assert.rejects(f.createReservation(manualForm()), pending);
  exactlyOnePurchase(f);
  const proofPath = f.orders[0].payment_screenshot_path;
  assert.ok(f.objects.has(proofPath));
  f.batch.status = 'orders_closed';
  const recovered = await f.createReservation(manualForm());
  assert.equal(recovered.operationId, operationId);
  assert.equal(recovered.orderCode, f.orders[0].order_code);
  assert.equal(recovered.replayed, true);
  assert.equal(f.uploads.length, 1, 'Completed replay skips storage even when capacity is now exhausted');
  assert.equal(calls(f, finalizeName).length, 1);
  exactlyOnePurchase(f);
  const logs = f.errors.map(([name, , context]) => ({ name, ...context }));
  assert.ok(logs.some(log => log.operationId === operationId && log.stage === 'finalize' && log.outcome));
  assert.ok(logs.some(log => log.operationId === operationId && log.stage === 'finalize_recovery' && log.outcome));
});

test('a lost prepare response retries the same bound operation before uploading once', async () => {
  const f = manualFixture({ prepareFaults: [{ when: 'after', throw: 'Synthetic prepare acknowledgement lost' }] });
  const result = await f.createReservation(manualForm());
  assert.equal(result.orderCode, 'BAG-SYNTHETIC-1');
  assert.equal(f.operations.size, 1);
  assert.equal(calls(f, prepareName).length, 2);
  assert.deepEqual(calls(f, prepareName)[0].input, calls(f, prepareName)[1].input);
  assert.equal(f.uploads.length, 1);
  exactlyOnePurchase(f);
});

test('an exact completed replay returns original identity without upload or finalization', async () => {
  const f = manualFixture();
  const first = await f.createReservation(manualForm());
  const replay = await f.createReservation(manualForm());
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.equal(f.operations.size, 1);
  assert.equal(f.uploads.length, 1);
  assert.equal(calls(f, finalizeName).length, 1);
  exactlyOnePurchase(f);
});

test('a completed operation returns its original quote after a catalog price change', async () => {
  const f = manualFixture();
  const first = await f.createReservation(manualForm());
  f.quote.amount = 65;
  const catalogReads = f.catalogCalls.length;
  const replay = await f.createReservation(manualForm());
  assert.equal(f.catalogCalls.length, catalogReads, 'Completed recovery never consults the current quote');
  assert.equal(calls(f, prepareName).length, 1);
  assert.equal(calls(f, readName).length, 2);
  assert.deepEqual(replay, { ...first, amount: 58, replayed: true });
  assert.equal(f.uploads.length, 1);
  exactlyOnePurchase(f);
});

test('an awaiting operation rejects a changed quote before another upload or order commit', async () => {
  const f = manualFixture({ finalizeFaults: [{ throw: 'Synthetic finalize unavailable before commit' }] });
  await assert.rejects(f.createReservation(manualForm()), pending);
  f.quote.amount = 65;
  await assert.rejects(f.createReservation(manualForm()), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'manual_reservation_quote_changed');
    assert.equal(error.operationId, operationId);
    return true;
  });
  assert.equal(f.operations.get(operationId).payload.total_amount, 58);
  assert.equal(f.uploads.length, 1);
  assert.equal(calls(f, finalizeName).length, 1);
  assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
  assert.deepEqual(f.removed, []);
  assert.equal(f.objects.size, 1);
});

test('simultaneous exact replays commit exactly one order, one item set and one history entry', async () => {
  const f = manualFixture();
  const results = await Promise.all([
    f.createReservation(manualForm()), f.createReservation(manualForm()), f.createReservation(manualForm()),
  ]);
  assert.deepEqual(new Set(results.map(result => result.orderCode)), new Set(['BAG-SYNTHETIC-1']));
  assert.ok(results.every(result => result.operationId === operationId && result.amount === 58));
  assert.equal(f.operations.size, 1);
  assert.equal(f.objects.size, 1);
  assert.ok(f.uploads.every(upload => upload.options.upsert === false));
  exactlyOnePurchase(f);
});

for (const [name, overrides] of [
  ['delivery body', { deliveryAddress: 'A different synthetic address 456' }],
  ['email owner', { email: 'another@example.invalid' }],
  ['WhatsApp owner', { whatsapp: '111111111' }],
  ['proof bytes with the same size and MIME', { paymentScreenshot: new File(['different proof'], 'proof.png', { type: 'image/png' }) }],
  ['proof MIME with the same bytes', { paymentScreenshot: new File(['synthetic proof'], 'proof.webp', { type: 'image/webp' }) }],
  ['proof size', { paymentScreenshot: new File(['synthetic proof plus'], 'proof.png', { type: 'image/png' }) }],
]) {
  test(`reusing one key with different ${name} returns conflict without exposing another order`, async () => {
    const f = manualFixture();
    const first = await f.createReservation(manualForm());
    await assert.rejects(f.createReservation(manualForm(operationId, overrides)), error => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'operation_conflict');
      assert.ok(!error.message.includes(first.orderCode));
      assert.ok(!error.message.includes(f.orders[0].payment_screenshot_path));
      return true;
    });
    assert.equal(f.uploads.length, 1);
    assert.equal(calls(f, finalizeName).length, 1);
    exactlyOnePurchase(f);
  });
}

test('normalized email, trimmed fields and proof filename changes preserve the same identity', async () => {
  const f = manualFixture();
  const first = await f.createReservation(manualForm(operationId, {
    email: ' QA@EXAMPLE.INVALID ', customerName: ' Synthetic Customer ', whatsapp: ' 000000000 ',
  }));
  const replay = await f.createReservation(manualForm(operationId, {
    paymentScreenshot: new File(['synthetic proof'], 'another-name.png', { type: 'image/png' }),
  }));
  assert.deepEqual(replay, { ...first, replayed: true });
  const inputs = calls(f, readName).map(call => call.input);
  assert.equal(inputs[0].p_owner_hash, inputs[1].p_owner_hash);
  assert.equal(inputs[0].p_request_hash, inputs[1].p_request_hash);
  exactlyOnePurchase(f);
});

test('different operation keys permit two deliberate purchases with identical transfer and customer data', async () => {
  const f = manualFixture({ batch: { capacity_packs: 2, capacity_bagels: 12 } });
  const first = await f.createReservation(manualForm());
  const second = await f.createReservation(manualForm(secondOperationId));
  assert.notEqual(first.orderCode, second.orderCode);
  assert.equal(f.orders.length, 2);
  assert.equal(f.operations.size, 2);
  assert.equal(f.objects.size, 2);
  assert.equal(f.orders.reduce((sum, order) => sum + order.pack_units, 0), 12);
  assert.ok(f.orders.every(order => order.total_amount === 58 && order.payment_transaction_number === 'SYNTHETIC-001'));
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
});

test('different operation keys competing for the last slot preserve the atomic capacity boundary', async () => {
  const f = manualFixture({ prepareBarrier: 2 });
  const results = await Promise.allSettled([
    f.createReservation(manualForm()), f.createReservation(manualForm(secondOperationId)),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected').reason;
  assert.equal(failure.status, 400);
  assert.deepEqual(f.rpcCalls.filter(call => call.name !== readName).slice(0, 2).map(call => call.name), [prepareName, prepareName],
    'Both capacity prechecks pass before either atomic finalize runs');
  assert.equal(f.objects.size, 2, 'Evidence is retained for both bound operations');
  exactlyOnePurchase(f);
});

for (const [name, batch] of [
  ['closed', { status: 'orders_closed' }],
  ['zero packs', { capacity_packs: 0 }],
  ['zero bagels', { capacity_bagels: 0 }],
  ['not yet open', { orders_open_at: '2999-01-01T00:00:00Z' }],
  ['already closed', { orders_close_at: '2000-01-01T00:00:00Z' }],
]) {
  test(`a fresh operation for a ${name} batch rejects before code allocation, operation insert or upload`, async () => {
    const f = manualFixture({ batch });
    await assert.rejects(f.createReservation(manualForm()), error => error.status === 400);
    assert.equal(f.operations.size, 0);
    assert.equal(f.objects.size, 0);
    assert.equal(f.uploads.length, 0);
    assert.equal(calls(f, prepareName).length, 1);
    assert.equal(calls(f, finalizeName).length, 0);
    assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.removed, []);
    Object.assign(f.batch, { status: 'orders_open', capacity_packs: 1, capacity_bagels: 6,
      orders_open_at: null, orders_close_at: null });
    assert.equal((await f.createReservation(manualForm())).orderCode, 'BAG-SYNTHETIC-1');
    exactlyOnePurchase(f);
  });
}

for (const code of ['EPIPE', '08007', '40003']) {
  test(`an RPC error reply ${code} leaves the commit outcome pending and retains bound evidence`, async () => {
    const f = manualFixture({ finalizeError: { code, message: `Synthetic uncertain RPC ${code}` } });
    await assert.rejects(f.createReservation(manualForm()), pending);
    assert.equal(calls(f, finalizeName).length, 1);
    assert.equal(calls(f, prepareName).length, 1);
    assert.equal(calls(f, readName).length, 2);
    assert.equal(f.operations.size, 1);
    assert.equal(f.objects.size, 1);
    assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.removed, []);
    assert.ok(f.errors.some(([, , context]) => context.operationId === operationId
      && context.stage === 'finalize' && context.outcome === 'unknown' && context.code === code));
  });
}

test('a lost upload acknowledgement downloads and verifies the existing stable proof before finalize', async () => {
  const f = manualFixture({ uploadFaults: [{ when: 'after', throw: 'Synthetic upload response lost' }] });
  const result = await f.createReservation(manualForm());
  assert.equal(result.orderCode, 'BAG-SYNTHETIC-1');
  const path = f.orders[0].payment_screenshot_path;
  assert.deepEqual(f.downloads, [path]);
  assert.equal(path, `manual/${operationId}/${sha256('synthetic proof')}.png`);
  assert.equal(f.objects.size, 1);
  assert.equal(calls(f, finalizeName).length, 1);
  exactlyOnePurchase(f);
});

test('JPEG alias uses canonical MIME in stored bytes and survives a lost upload response', async () => {
  const f = manualFixture({ uploadFaults: [{ when: 'after', throw: 'Synthetic JPEG upload response lost' }] });
  const result = await f.createReservation(manualForm(operationId, {
    paymentScreenshot: new File(['synthetic proof'], 'proof.jpg', { type: 'image/jpg' }),
  }));
  const path = f.orders[0].payment_screenshot_path;
  assert.equal(path, `manual/${operationId}/${sha256('synthetic proof')}.jpg`);
  assert.equal(f.objects.get(path).type, 'image/jpeg');
  assert.equal(f.uploads[0].file.type, 'image/jpeg');
  const replay = await f.createReservation(manualForm(operationId, {
    paymentScreenshot: new File(['synthetic proof'], 'renamed.jpeg', { type: 'image/jpeg' }),
  }));
  assert.deepEqual(replay, { ...result, replayed: true });
  exactlyOnePurchase(f);
});

test('unavailable proof download returns pending then recovers with the same path and original operation', async () => {
  const f = manualFixture({
    uploadFaults: [{ when: 'after', throw: 'Synthetic upload response lost' }],
    downloadFaults: [{ throw: 'Synthetic proof lookup unavailable' }],
  });
  await assert.rejects(f.createReservation(manualForm()), pending);
  const operation = f.operations.get(operationId);
  assert.equal(operation.state, 'awaiting_proof');
  assert.equal(f.objects.size, 1);
  assert.equal(calls(f, finalizeName).length, 0);
  assert.equal(f.orders.length, 0);
  const result = await f.createReservation(manualForm());
  assert.equal(result.orderCode, operation.orderCode);
  assert.ok(f.uploads.every(upload => upload.path === operation.proofPath && upload.options.upsert === false));
  assert.deepEqual(f.downloads, [operation.proofPath, operation.proofPath]);
  assert.equal(f.objects.size, 1);
  exactlyOnePurchase(f);
});

for (const [name, blob] of [
  ['bytes', new Blob(['different proof'], { type: 'image/png' })],
  ['MIME', new Blob(['synthetic proof'], { type: 'image/webp' })],
  ['size', new Blob(['too short'], { type: 'image/png' })],
]) {
  test(`a stored proof with mismatching ${name} cannot authorize finalization`, async () => {
    const f = manualFixture({ uploadError: { message: 'Synthetic duplicate upload' } });
    const path = `manual/${operationId}/${sha256('synthetic proof')}.png`;
    f.objects.set(path, blob);
    await assert.rejects(f.createReservation(manualForm()), pending);
    assert.equal(calls(f, finalizeName).length, 0);
    assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    assert.equal(f.objects.get(path), blob, 'Uncertain or mismatching evidence must be preserved');
    assert.deepEqual(f.removed, []);
  });
}

for (const row of [null, {}, { state: 'completed' }, { operation_id: secondOperationId }]) {
  test(`an incomplete finalize response ${JSON.stringify(row)} reconciles without inventing success`, async () => {
    const f = manualFixture({ finalizeFaults: [{ row }] });
    await assert.rejects(f.createReservation(manualForm()), pending);
    assert.equal(calls(f, finalizeName).length, 1);
    assert.equal(calls(f, prepareName).length, 1);
    assert.equal(calls(f, readName).length, 2);
    assert.equal(f.objects.size, 1);
    assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    assert.deepEqual(f.removed, []);
  });
}

test('missing finalize acknowledgement after commit can recover through the private keyed read', async () => {
  const f = manualFixture({ finalizeFaults: [{ when: 'after', row: null }] });
  assert.equal((await f.createReservation(manualForm())).replayed, true);
  exactlyOnePurchase(f);
});

function apiFixture(options) {
  const f = manualFixture(options);
  const events = [];
  const route = f.load('src/app/api/reservations/route.ts', {
    '@/lib/server-analytics': { trackBagelitoServerEvent: async (...event) => events.push(event) },
  });
  return { ...f, events, async post(form = manualForm()) {
    const response = await route.POST(new Request('http://localhost/api/reservations', {
      method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1', 'x-request-id': 'synthetic-request' }, body: form,
    }));
    return { response, body: await response.json() };
  } };
}

test('HTTP completed replay preserves the same 200 identity, runs limits again and emits Created once', async () => {
  const f = apiFixture();
  const first = await f.post();
  const replay = await f.post();
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.deepEqual(first.body, { ok: true, operationId, orderCode: 'BAG-SYNTHETIC-1' });
  assert.deepEqual(replay.body, first.body);
  assert.equal(f.events.filter(event => event[0] === 'Reservation Created').length, 1);
  assert.equal(f.rateCalls.length, 4, 'Each HTTP attempt must consume requester and contact checks');
  assert.equal(replay.response.headers.get('Cache-Control'), 'no-store');
  exactlyOnePurchase(f);
});

test('HTTP pending carries the same operation ID and later recovers instead of reporting another purchase', async () => {
  const f = apiFixture({ finalizeFaults: [{ when: 'after', throw: 'Lost commit response' }],
    readFaults: [null, { throw: 'Reconciliation offline' }] });
  const first = await f.post();
  assert.equal(first.response.status, 202);
  assert.deepEqual(Object.keys(first.body).sort(), ['code', 'error', 'ok', 'operationId', 'state']);
  assert.equal(first.body.ok, false);
  assert.equal(first.body.operationId, operationId);
  assert.equal(first.body.code, 'manual_reservation_pending');
  assert.equal(first.body.state, 'pending');
  const pendingLog = f.warnings.find(([name]) => name === 'reservation_api_pending');
  assert.ok(pendingLog);
  assert.equal(pendingLog[1].operationId, operationId);
  assert.equal(pendingLog[1].requestId, 'synthetic-request');
  assert.equal(pendingLog[1].state, 'pending');
  const failureEvent = f.events.find(event => event[0] === 'Reservation API Error');
  assert.ok(failureEvent);
  assert.ok(!JSON.stringify(failureEvent[1]).includes(operationId), 'Shared analytics must not receive the operation identifier');
  assert.equal(Object.hasOwn(failureEvent[1], 'operationId'), false);
  assert.equal(Object.hasOwn(failureEvent[1], 'requestId'), false);
  const recovered = await f.post();
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.orderCode, f.orders[0].order_code);
  assert.equal(f.events.filter(event => event[0] === 'Reservation Created').length, 0, 'Reconciled replay is not another Created event');
  assert.equal(f.rateCalls.length, 4);
  exactlyOnePurchase(f);
});

test('HTTP operation conflict is 409 with no original order identity or proof details', async () => {
  const f = apiFixture();
  await f.post();
  const conflict = await f.post(manualForm(operationId, { email: 'other@example.invalid' }));
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, 'operation_conflict');
  assert.deepEqual(Object.keys(conflict.body).sort(), ['code', 'error', 'ok', 'operationId']);
  assert.ok(!JSON.stringify(conflict.body).includes(f.orders[0].order_code));
  assert.ok(!JSON.stringify(conflict.body).includes(f.orders[0].payment_screenshot_path));
  exactlyOnePurchase(f);
});

test('HTTP exact replays still exhaust the normal contact limit without duplicating purchases', async () => {
  const f = apiFixture();
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await f.post()).response.status, 200);
  const blocked = await f.post();
  assert.equal(blocked.response.status, 429);
  assert.ok(Number(blocked.response.headers.get('Retry-After')) > 0);
  assert.equal(f.rateCalls.length, 10);
  assert.equal(calls(f, prepareName).length, 1);
  assert.equal(calls(f, readName).length, 4, 'Denied retry never reaches the private recovery RPC');
  assert.equal(f.events.filter(event => event[0] === 'Reservation Created').length, 1);
  exactlyOnePurchase(f);
});
