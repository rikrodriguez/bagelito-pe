import test from 'node:test';
import assert from 'node:assert/strict';
import { manualFixture, manualForm, operationId, secondOperationId, sha256 } from './helpers/manual-reservation-fixture.mjs';
import { sourceModule } from './helpers/load-ts.mjs';

const readName = 'read_manual_reservation_v1';
const prepareName = 'prepare_manual_reservation_v1';
const finalizeName = 'finalize_manual_reservation_v1';
const rpcCount = (f, name) => f.rpcCalls.filter(call => call.name === name).length;

function retirePack(f) {
  const index = f.catalog.packs.findIndex(pack => pack.slug === '6-single');
  assert.ok(index >= 0);
  f.catalog.packs.splice(index, 1);
}

function retireFlavor(f) {
  const index = f.catalog.flavors.findIndex(flavor => flavor.slug === 'plain');
  assert.ok(index >= 0);
  f.catalog.flavors.splice(index, 1);
}

async function post(f, form) {
  const { POST } = f.load('src/app/api/reservations/route.ts', {
    '@/lib/server-analytics': { trackBagelitoServerEvent: async () => {} },
  });
  const response = await POST(new Request('https://synthetic.invalid/api/reservations', {
    method: 'POST', body: form, headers: { 'x-forwarded-for': '192.0.2.1', 'x-request-id': 'synthetic-catalog-replay' },
  }));
  return { status: response.status, body: await response.json() };
}

function snapshot(f) {
  return {
    reads: rpcCount(f, readName), prepares: rpcCount(f, prepareName),
    finalizes: rpcCount(f, finalizeName), uploads: f.uploads.length, downloads: f.downloads.length,
    orders: f.orders.length, items: f.items.length, history: f.history.length,
  };
}

function onlyReadSince(f, before) {
  assert.deepEqual(snapshot(f), { ...before, reads: before.reads + 1 });
  assert.deepEqual(f.catalogCalls, [], 'Completed recovery must not consult the mutable catalog');
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
}

function noPrivateOrderData(body, f) {
  const content = { ...body };
  // The caller's UUID is intentionally echoed and this synthetic UUID happens
  // to contain the fixture's all-zero mobile number as a substring.
  delete content.operationId;
  const serialized = JSON.stringify(content);
  for (const field of ['order_code', 'customer_name', 'email', 'whatsapp', 'delivery_address',
    'payment_transaction_number', 'payment_screenshot_path']) {
    assert.ok(!serialized.includes(f.orders[0][field]), `Error response disclosed ${field}`);
  }
  assert.equal(Object.hasOwn(body, 'orderCode'), false);
  assert.equal(Object.hasOwn(body, 'amount'), false);
  assert.equal(Object.hasOwn(body, 'proof_path'), false);
}

function noLookupSideEffects(f) {
  assert.deepEqual(f.catalogCalls, []);
  assert.equal(f.operations.size, 0);
  assert.equal(f.objects.size, 0);
  assert.deepEqual([f.orders, f.items, f.history, f.uploads, f.downloads, f.removed, f.writes],
    [[], [], [], [], [], [], []]);
  assert.equal(rpcCount(f, prepareName), 0);
  assert.equal(rpcCount(f, finalizeName), 0);
}

for (const code of ['42883', 'PGRST202', '42501']) {
  test(`unavailable read RPC ${code} fails closed before catalog, preparation or evidence writes`, async () => {
    const f = manualFixture({ readError: { code, message: 'Synthetic read RPC unavailable' } });
    await assert.rejects(f.createReservation(manualForm()), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'manual_reservation_unavailable');
      assert.equal(error.operationId, operationId);
      return true;
    });
    assert.deepEqual(f.rpcCalls.map(call => call.name), [readName]);
    noLookupSideEffects(f);
  });
}

test('persistent read transport failure returns pending after exactly two lookups and no other operation', async () => {
  const f = manualFixture({ readThrow: true });
  await assert.rejects(f.createReservation(manualForm()), error => {
    assert.equal(error.status, 202);
    assert.equal(error.code, 'manual_reservation_pending');
    assert.equal(error.operationId, operationId);
    assert.equal(error.state, 'pending');
    return true;
  });
  assert.deepEqual(f.rpcCalls.map(call => call.name), [readName, readName]);
  assert.deepEqual(f.rpcCalls[0].input, f.rpcCalls[1].input);
  noLookupSideEffects(f);
});

test('one lost read response recovers a completed retired-SKU purchase with a bounded second lookup', async () => {
  const f = manualFixture();
  const first = await f.createReservation(manualForm());
  retirePack(f);
  retireFlavor(f);
  f.controls.readFaults.push({ throw: 'Synthetic read acknowledgement lost' }, null);
  f.catalogCalls.length = 0;
  const before = snapshot(f);
  const beforeCalls = f.rpcCalls.length;
  const result = await f.createReservation(manualForm());
  assert.deepEqual(result, { ...first, replayed: true });
  assert.deepEqual(snapshot(f), { ...before, reads: before.reads + 2 });
  const recoveryCalls = f.rpcCalls.slice(beforeCalls);
  assert.deepEqual(recoveryCalls.map(call => call.name), [readName, readName]);
  assert.deepEqual(recoveryCalls[0].input, recoveryCalls[1].input);
  assert.deepEqual(f.catalogCalls, []);
  assert.ok(f.objects.has(f.orders[0].payment_screenshot_path));
  assert.deepEqual(f.removed, []);
});

for (const [name, row] of [
  ['incomplete operation', { operation_id: operationId, state: 'completed', order_code: 'BAG-PRIVATE-UNCONFIRMED' }],
  ['wrong operation identity', {
    operation_id: secondOperationId, state: 'completed', order_code: 'BAG-PRIVATE-UNCONFIRMED',
    proof_path: `manual/${operationId}/${sha256('synthetic proof')}.png`, amount: 58,
    pack_slug: '6-single', replayed: true,
  }],
]) {
  test(`invalid read reply (${name}) remains pending without disclosing or preparing an order`, async () => {
    const f = manualFixture({ readFaults: [{ row }, { row }] });
    const response = await post(f, manualForm());
    assert.equal(response.status, 202);
    assert.equal(response.body.code, 'manual_reservation_pending');
    assert.equal(response.body.operationId, operationId);
    assert.equal(response.body.state, 'pending');
    assert.equal(Object.hasOwn(response.body, 'orderCode'), false);
    assert.equal(Object.hasOwn(response.body, 'proof_path'), false);
    assert.equal(Object.hasOwn(response.body, 'amount'), false);
    assert.ok(!JSON.stringify(response.body).includes(row.order_code));
    assert.ok(!JSON.stringify(response.body).includes(row.proof_path ?? 'PRIVATE-PROOF-PATH'));
    assert.deepEqual(f.rpcCalls.filter(call => call.name !== 'consume_api_rate_limit').map(call => call.name),
      [readName, readName]);
    noLookupSideEffects(f);
  });
}

for (const [name, mutate] of [
  ['pack removed', retirePack],
  ['flavor removed', retireFlavor],
  ['pack units changed', f => { f.catalog.packs.find(pack => pack.slug === '6-single').units = 12; }],
  ['pack type changed', f => { f.catalog.packs.find(pack => pack.slug === '6-single').packType = 'mixed'; }],
  ['catalog price changed', f => { f.quote.amount = 65; }],
]) {
  test(`completed operation recovers before current catalog validation: ${name}`, async () => {
    const f = manualFixture();
    const first = await f.createReservation(manualForm());
    mutate(f);
    f.batch.status = 'orders_closed';
    f.batch.capacity_packs = 0;
    f.batch.capacity_bagels = 0;
    f.catalogCalls.length = 0;
    const before = snapshot(f);
    const response = await post(f, manualForm());
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, operationId, orderCode: first.orderCode });
    assert.equal(f.orders[0].total_amount, 58, 'Recovery preserves the actual committed amount');
    assert.equal(f.orders[0].pack_units, 6);
    assert.equal(f.orders[0].terms_accepted, true);
    assert.equal(f.orders[0].exact_amount_confirmed, true);
    assert.ok(f.objects.has(f.orders[0].payment_screenshot_path));
    onlyReadSince(f, before);
  });
}

for (const [name, mutate] of [
  ['removed pack', retirePack],
  ['removed flavor', retireFlavor],
  ['changed pack units', f => { f.catalog.packs.find(pack => pack.slug === '6-single').units = 12; }],
]) {
  test(`new operations still require current catalog validation: ${name}`, async () => {
    const f = manualFixture();
    mutate(f);
    await assert.rejects(f.createReservation(manualForm()), error => error.name === 'ZodError');
    assert.equal(rpcCount(f, readName), 1, 'A private identity lookup precedes current catalog validation');
    assert.equal(rpcCount(f, prepareName), 0);
    assert.equal(rpcCount(f, finalizeName), 0);
    assert.equal(f.operations.size, 0);
    assert.equal(f.objects.size, 0);
    assert.deepEqual([f.orders, f.items, f.history, f.uploads, f.removed], [[], [], [], [], []]);
  });

  test(`awaiting operations cannot bypass current catalog validation: ${name}`, async () => {
    const f = manualFixture({ finalizeThrow: true });
    await assert.rejects(f.createReservation(manualForm()), error => error.status === 202);
    assert.equal(f.operations.get(operationId).state, 'awaiting_proof');
    const bound = structuredClone(f.operations.get(operationId));
    const proofPath = bound.proofPath;
    const before = snapshot(f);
    f.controls.finalizeThrow = false;
    mutate(f);
    await assert.rejects(f.createReservation(manualForm()), error => error.name === 'ZodError');
    assert.deepEqual(snapshot(f), { ...before, reads: before.reads + 1 });
    assert.deepEqual(f.operations.get(operationId), bound);
    assert.equal(f.objects.size, 1);
    assert.ok(f.objects.has(proofPath));
    assert.deepEqual([f.orders, f.items, f.history, f.removed], [[], [], [], []]);
  });
}

for (const [name, overrides] of [
  ['delivery body', { deliveryAddress: 'Different synthetic address 456' }],
  ['invalid current units', { items: JSON.stringify([{ flavorSlug: 'plain', quantity: 5 }]) }],
  ['email owner', { email: 'another@example.invalid' }],
  ['WhatsApp owner', { whatsapp: '111111111' }],
  ['proof bytes', { paymentScreenshot: new File(['different proof'], 'proof.png', { type: 'image/png' }) }],
  ['proof MIME', { paymentScreenshot: new File(['synthetic proof'], 'proof.webp', { type: 'image/webp' }) }],
]) {
  test(`retired SKU does not weaken owner/content/proof privacy: changed ${name}`, async () => {
    const f = manualFixture();
    await f.createReservation(manualForm());
    retirePack(f);
    retireFlavor(f);
    f.catalogCalls.length = 0;
    const before = snapshot(f);
    const response = await post(f, manualForm(operationId, overrides));
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'operation_conflict');
    assert.equal(response.body.operationId, operationId);
    noPrivateOrderData(response.body, f);
    onlyReadSince(f, before);
  });
}

test('an unknown key cannot infer or reuse a committed retired-SKU order from equal transfer/customer data', async () => {
  const f = manualFixture();
  await f.createReservation(manualForm());
  retirePack(f);
  retireFlavor(f);
  const before = snapshot(f);
  const response = await post(f, manualForm(secondOperationId));
  assert.equal(response.status, 400);
  noPrivateOrderData(response.body, f);
  assert.deepEqual(snapshot(f), { ...before, reads: before.reads + 1 });
  assert.equal(f.operations.size, 1);
  assert.equal(f.orders.length, 1);
  assert.equal(f.objects.size, 1);
});

for (const [name, buildForm] of [
  ['missing key', () => manualForm(null)],
  ['invalid UUID', () => manualForm('not-a-valid-operation-id')],
  ['UUID only', () => { const form = new FormData(); form.set('operationId', operationId); return form; }],
]) {
  test(`${name} cannot recover private data from an existing operation`, async () => {
    const f = manualFixture();
    await f.createReservation(manualForm());
    retirePack(f);
    const before = snapshot(f);
    const response = await post(f, buildForm());
    assert.equal(response.status, 400);
    noPrivateOrderData(response.body, f);
    assert.deepEqual(snapshot(f), before, 'Full frozen request validation is required before any identity lookup');
    assert.equal(f.orders.length, 1);
  });
}

for (const field of ['termsAccepted', 'exactAmountConfirmed']) {
  for (const state of ['new', 'awaiting', 'completed']) {
    test(`${state} operation with ${field}=false cannot bypass affirmative confirmation`, async () => {
      const f = manualFixture({ finalizeThrow: state === 'awaiting' });
      if (state === 'awaiting') await assert.rejects(f.createReservation(manualForm()), error => error.status === 202);
      if (state === 'completed') await f.createReservation(manualForm());
      const before = snapshot(f);
      const response = await post(f, manualForm(operationId, { [field]: 'false' }));
      assert.equal(response.status, 400);
      assert.deepEqual(snapshot(f), before, 'Invalid consent must fail before identity I/O or new writes');
      assert.deepEqual(f.removed, []);
      if (state !== 'new') assert.ok(f.objects.has(f.operations.get(operationId).proofPath));
    });
  }
}

// Fixed values captured by executing published commit 2821978, before adding
// the catalog-independent parser/read RPC. They pin field order, defaults,
// trimming, numeric coercion, lowercase email and image/jpg normalization.
const publishedVectors = [
  {
    name: 'default six-pack', form: () => manualForm(),
    owner: 'f6f04de2e57b12a43bb272f780a931e0567191b95b48de4bed75bcf12f12412c',
    request: '2a01bf2028bf9cad6243a792360d976e4e0623c8863a836b7f15b4358e18399e',
    proof: '1e11b98fdf50fd2d1a606752ae13e0dc4538ca861fbc87c658c558bea39a8826',
    type: 'image/png', size: 15,
  },
  {
    name: 'normalized equivalent', form: () => manualForm(operationId.toUpperCase(), {
      email: ' QA@EXAMPLE.INVALID ', customerName: ' Synthetic Customer ', whatsapp: ' 000000000 ',
      paymentScreenshot: new File(['synthetic proof'], 'renamed.png', { type: 'image/png' }),
    }),
    owner: 'f6f04de2e57b12a43bb272f780a931e0567191b95b48de4bed75bcf12f12412c',
    request: '2a01bf2028bf9cad6243a792360d976e4e0623c8863a836b7f15b4358e18399e',
    proof: '1e11b98fdf50fd2d1a606752ae13e0dc4538ca861fbc87c658c558bea39a8826',
    type: 'image/png', size: 15,
  },
  {
    name: 'full mixed-pack and JPEG alias', form: () => manualForm(operationId, {
      packSlug: '12-mixed', items: JSON.stringify([{ flavorSlug: 'plain', quantity: '3' }, { flavorSlug: 'sesame', quantity: '9' }]),
      customerName: ' Example Customer ', email: ' BUYER@EXAMPLE.INVALID ', whatsapp: ' +51 000000000 ',
      district: 'San Isidro', deliveryAddress: ' Avenida QA 321 ', addressReference: ' Side entrance ',
      deliveryNotes: ' Please call ', deliveryHandoff: 'porteria', marketingOptIn: 'true', paymentMethod: 'Plin',
      paymentTransactionNumber: ' REF-123 ', paymentHolderName: ' Sample Holder ', paymentPhoneNumber: ' +51 000000001 ',
      paymentScreenshot: new File(['jpeg synthetic proof'], 'proof.jpg', { type: 'image/jpg' }),
    }),
    owner: 'bef619aa2d98a0b3f577102e0719e30a907ad04d7567c1f7ca7cb71487e4f4bc',
    request: '952b80390f83aa62c8fffbd3f8f1143fdd38623a2341843e53fe78b66b599e3d',
    proof: '7ab656e6f6a6a55d17b5f9956b627b497f35a775b4f01c43116a7a151b07facf',
    type: 'image/jpeg', size: 20,
  },
];

for (const vector of publishedVectors) {
  test(`published v1 fingerprint remains byte compatible: ${vector.name}`, async () => {
    const f = manualFixture({ batch: { capacity_packs: null, capacity_bagels: null } });
    await f.createReservation(vector.form());
    const identities = f.rpcCalls.filter(call => [readName, prepareName].includes(call.name));
    assert.ok(identities.length > 0);
    for (const { input } of identities) {
      assert.equal(input.p_owner_hash, vector.owner);
      assert.equal(input.p_request_hash, vector.request);
      assert.equal(input.p_proof_sha256, vector.proof);
      assert.equal(input.p_proof_type, vector.type);
      assert.equal(input.p_proof_size, vector.size);
    }
    const frozen = sourceModule('src/lib/reservations/manual-request-v1.ts');
    const parsed = frozen.manualRequestV1FromFormData(vector.form());
    const reordered = Object.fromEntries(Object.entries(parsed).reverse());
    reordered.items = parsed.items.map(item => Object.fromEntries(Object.entries(item).reverse()));
    assert.equal(sha256(frozen.manualOwnerV1HashInput(reordered)), vector.owner);
    assert.equal(sha256(frozen.manualRequestV1HashInput(reordered, {
      sha256: vector.proof, type: vector.type, size: vector.size,
    })), vector.request, 'Typed-object property order must not change a published recovery fingerprint');
  });
}
