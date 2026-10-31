import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/load-ts.mjs';
import { manualFixture, manualForm, operationId, secondOperationId } from './helpers/manual-reservation-fixture.mjs';

function reviewEnvironment(t, overrides = {}) {
  const values = {
    BAGELITO_MERCHANT_REVIEW_ONLY: 'true', PAYMENT_PROVIDER: 'culqi', CULQI_ENABLED: 'true',
    CULQI_MODE: 'sandbox', CULQI_LIVE_APPROVED: 'false', CULQI_STATUS_RECOVERY_APPROVED: 'false',
    VERCEL_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_review_synthetic',
    NEXT_PUBLIC_CULQI_RSA_ID: 'synthetic-rsa-id', NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: 'synthetic-rsa-public-key',
    CULQI_SECRET_KEY: 'sk_test_review_synthetic', ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
}
const readName = 'read_manual_reservation_v1';
const operationCalls = f => f.rpcCalls.filter(call => call.name !== 'consume_api_rate_limit');
async function post(f, form = manualForm(), monitoring) {
  const route = f.load('src/app/api/reservations/route.ts', {
    '@/lib/server-analytics': { trackBagelitoServerEvent: async () => {} },
    ...(monitoring ? { '@/lib/monitoring': monitoring } : {}),
  });
  const response = await route.POST(new Request('http://localhost:3000/api/reservations', {
    method: 'POST', body: form, headers: { 'x-forwarded-for': '192.0.2.45', 'x-request-id': 'synthetic-review-recovery' },
  }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}
function snapshot(f) {
  return { operations: f.operations.size, orders: f.orders.length, items: f.items.length,
    history: f.history.length, objects: f.objects.size, uploads: f.uploads.length,
    downloads: f.downloads.length, removed: f.removed.length, writes: f.writes.length };
}
function assertReadOnly(f, before, beforeCalls) {
  assert.deepEqual(snapshot(f), before);
  assert.deepEqual(operationCalls(f).slice(beforeCalls).map(call => call.name), [readName]);
  assert.deepEqual(f.catalogCalls, []);
}

test('review disables public checkout while preserving configured private recovery and origin fences', t => {
  reviewEnvironment(t);
  const { getPaymentConfig, getPublicPaymentConfig, assertCulqiEnabled, isCulqiRequestAllowed } = sourceModule('src/lib/payments/config.ts');
  assert.equal(getPaymentConfig().enabled, true);
  assert.equal(getPaymentConfig().hasSecretKey, true);
  assert.equal(getPublicPaymentConfig().enabled, false);
  assert.equal(Object.hasOwn(getPublicPaymentConfig(), 'hasSecretKey'), false);
  assert.ok(!JSON.stringify(getPublicPaymentConfig()).includes(process.env.CULQI_SECRET_KEY));
  assert.equal(assertCulqiEnabled().mode, 'sandbox');
  for (const path of ['/api/payments/culqi/order', '/api/payments/culqi/charge', '/api/payments/culqi/status', '/api/webhooks/culqi']) {
    assert.equal(isCulqiRequestAllowed(new Request('http://localhost:3000' + path)), true);
    assert.equal(isCulqiRequestAllowed(new Request('https://bagelito.pe' + path)), false);
  }
  process.env.CULQI_SECRET_KEY = 'sk_live_wrong_mode_synthetic';
  assert.equal(getPaymentConfig().enabled, false, 'Review must not bypass matching-key or mode approval requirements');
});

test('new Culqi reservations fail review guard before body parsing, configuration or I/O', async t => {
  reviewEnvironment(t);
  let boundaryCalls = 0;
  const forbidden = () => { boundaryCalls++; throw new Error('New intake must not be reached'); };
  const { POST } = sourceModule('src/app/api/reservations/culqi/route.ts', {
    '@/lib/public-api-security': { PublicApiError: class extends Error {}, enforcePublicApiSecurity: forbidden },
    '@/lib/reservations/service': { createCulqiReservation: forbidden },
    '@/lib/payments': { isCulqiRequestAllowed: forbidden },
  });
  const response = await POST({ json: forbidden });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).ok, false);
  assert.equal(boundaryCalls, 0);
});

test('unknown manual operation is denied after full private lookup without creating or uploading', async t => {
  reviewEnvironment(t);
  const f = manualFixture(), before = snapshot(f);
  const result = await post(f);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'manual_review_intake_closed');
  assert.equal(result.body.operationId, operationId);
  assert.equal(Object.hasOwn(result.body, 'orderCode'), false);
  assertReadOnly(f, before, 0);
  assert.equal(f.rateCalls.length, 2, 'Requester and contact checks remain mandatory');
});

test('review reports an existing pending operation without running its remaining creation stages', async t => {
  reviewEnvironment(t, { BAGELITO_MERCHANT_REVIEW_ONLY: 'false' });
  const f = manualFixture({ finalizeThrow: true });
  await assert.rejects(f.createReservation(manualForm()), error => error.status === 202);
  const bound = structuredClone(f.operations.get(operationId));
  f.controls.finalizeThrow = false;
  process.env.BAGELITO_MERCHANT_REVIEW_ONLY = 'true';
  f.catalogCalls.length = 0;
  const before = snapshot(f), beforeCalls = operationCalls(f).length;
  const result = await post(f);
  assert.equal(result.status, 202);
  assert.deepEqual({ code: result.body.code, state: result.body.state, operationId: result.body.operationId },
    { code: 'manual_reservation_pending', state: 'pending', operationId });
  assert.equal(Object.hasOwn(result.body, 'orderCode'), false);
  assert.deepEqual(f.operations.get(operationId), bound);
  assertReadOnly(f, before, beforeCalls);
});

test('review recovers a completed retired-SKU order using its original v1 identity and proof', async t => {
  reviewEnvironment(t, { BAGELITO_MERCHANT_REVIEW_ONLY: 'false' });
  const f = manualFixture();
  const first = await f.createReservation(manualForm());
  const originalRead = operationCalls(f).find(call => call.name === readName).input;
  process.env.BAGELITO_MERCHANT_REVIEW_ONLY = 'true';
  f.catalog.packs.splice(0); f.catalog.flavors.splice(0);
  f.batch.status = 'closed'; f.batch.capacity_packs = 0; f.batch.capacity_bagels = 0;
  f.catalogCalls.length = 0;
  const before = snapshot(f), beforeCalls = operationCalls(f).length;
  const result = await post(f);
  assert.deepEqual(result, { status: 200, body: { ok: true, operationId, orderCode: first.orderCode } });
  assert.deepEqual(operationCalls(f).at(-1).input, originalRead);
  assert.equal(f.orders[0].total_amount, 58);
  assert.equal(f.orders[0].pack_units, 6);
  assert.ok(f.objects.has(f.orders[0].payment_screenshot_path));
  assertReadOnly(f, before, beforeCalls);
});

for (const [name, overrides] of [
  ['email owner', { email: 'other@example.invalid' }], ['WhatsApp owner', { whatsapp: '111111111' }],
  ['delivery body', { deliveryAddress: 'Different synthetic address 456' }],
  ['proof bytes', { paymentScreenshot: new File(['different proof'], 'proof.png', { type: 'image/png' }) }],
  ['proof MIME', { paymentScreenshot: new File(['synthetic proof'], 'proof.webp', { type: 'image/webp' }) }],
]) {
  test(`review refuses a key reused with different ${name} without exposing or changing the order`, async t => {
    reviewEnvironment(t, { BAGELITO_MERCHANT_REVIEW_ONLY: 'false' });
    const f = manualFixture();
    const first = await f.createReservation(manualForm());
    process.env.BAGELITO_MERCHANT_REVIEW_ONLY = 'true';
    f.catalog.packs.splice(0); f.catalog.flavors.splice(0); f.catalogCalls.length = 0;
    const before = snapshot(f), beforeCalls = operationCalls(f).length;
    const result = await post(f, manualForm(operationId, overrides));
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'operation_conflict');
    assert.equal(result.body.operationId, operationId);
    assert.ok(!JSON.stringify(result.body).includes(first.orderCode));
    assert.ok(!JSON.stringify(result.body).includes(f.orders[0].payment_screenshot_path));
    assert.equal(Object.hasOwn(result.body, 'amount'), false);
    assertReadOnly(f, before, beforeCalls);
  });
}

for (const code of ['42883', 'PGRST202', '42501']) {
  test(`missing or denied review read RPC ${code} fails closed without creation fallback`, async t => {
    reviewEnvironment(t);
    const f = manualFixture({ readError: { code, message: 'Synthetic unavailable read RPC' } }), before = snapshot(f);
    const result = await post(f);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'manual_reservation_unavailable');
    assertReadOnly(f, before, 0);
  });
}

test('review read transport failure retains identity after exactly two reads without mutation', async t => {
  reviewEnvironment(t);
  const f = manualFixture({ readThrow: true }), before = snapshot(f);
  const result = await post(f);
  assert.equal(result.status, 202);
  assert.equal(result.body.state, 'pending');
  assert.equal(result.body.operationId, operationId);
  assert.deepEqual(operationCalls(f).map(call => call.name), [readName, readName]);
  assert.deepEqual(operationCalls(f)[0].input, operationCalls(f)[1].input);
  assert.deepEqual(snapshot(f), before);
  assert.deepEqual(f.catalogCalls, []);
});

test('review retry after lost read response still enforces conflict privacy', async t => {
  reviewEnvironment(t, { BAGELITO_MERCHANT_REVIEW_ONLY: 'false' });
  const f = manualFixture();
  const first = await f.createReservation(manualForm());
  process.env.BAGELITO_MERCHANT_REVIEW_ONLY = 'true';
  f.controls.readFaults.push({ throw: 'Synthetic read response lost' }, null);
  f.catalogCalls.length = 0;
  const before = snapshot(f), beforeCalls = operationCalls(f).length;
  const result = await post(f, manualForm(operationId, { email: 'other@example.invalid' }));
  assert.equal(result.status, 409);
  assert.ok(!JSON.stringify(result.body).includes(first.orderCode));
  assert.deepEqual(operationCalls(f).slice(beforeCalls).map(call => call.name), [readName, readName]);
  assert.deepEqual(snapshot(f), before);
  assert.deepEqual(f.catalogCalls, []);
});

for (const [name, makeForm] of [
  ['UUID only', () => { const form = new FormData(); form.set('operationId', operationId); return form; }],
  ['missing UUID', () => manualForm(null)],
  ['missing proof', () => manualForm(operationId, { paymentScreenshot: null })],
  ['invalid proof type', () => manualForm(operationId, { paymentScreenshot: new File(['proof'], 'proof.txt', { type: 'text/plain' }) })],
  ['oversized proof', () => manualForm(operationId, { paymentScreenshot: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'proof.png', { type: 'image/png' }) })],
  ['false consent', () => manualForm(operationId, { termsAccepted: 'false' })],
]) {
  test(`review ${name} cannot bypass full body/proof/consent validation or read private data`, async t => {
    reviewEnvironment(t);
    const f = manualFixture(), before = snapshot(f);
    const result = await post(f, makeForm());
    assert.equal(result.status, 400);
    assert.equal(Object.hasOwn(result.body, 'orderCode'), false);
    assert.deepEqual(operationCalls(f), []);
    assert.deepEqual(snapshot(f), before);
  });
}

test('review preserves the bot trap and persistent rate limits', async t => {
  reviewEnvironment(t);
  const f = manualFixture();
  assert.equal((await post(f, manualForm(operationId, { website: 'synthetic-bot' }))).status, 400);
  assert.equal(f.rpcCalls.length, 0);
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await post(f, manualForm(secondOperationId))).status, 503);
  assert.equal((await post(f)).status, 429);
  assert.equal(operationCalls(f).length, 4);
  assert.ok(operationCalls(f).every(call => call.name === readName));
  assert.equal(f.operations.size, 0);
  assert.deepEqual(f.uploads, []);
});

for (const behavior of ['throws', 'rejects']) {
  test(`review observation ${behavior} cannot mask a private pending result or invoke creation`, async t => {
    reviewEnvironment(t);
    const f = manualFixture({ readThrow: true }), before = snapshot(f);
    const observer = () => behavior === 'throws' ? (() => { throw new Error('Synthetic observer failure'); })()
      : Promise.reject(new Error('Synthetic observer rejection'));
    const result = await post(f, manualForm(), {
      getDurationMs: observer, getRequestId: observer, logError: observer, logInfo: observer, logWarn: observer,
    });
    assert.equal(result.status, 202);
    assert.equal(result.body.operationId, operationId);
    assert.deepEqual(operationCalls(f).map(call => call.name), [readName, readName]);
    assert.deepEqual(snapshot(f), before);
  });
}

test('review preserves an existing Culqi token session and its ownership checks', async t => {
  reviewEnvironment(t);
  const paymentConfig = sourceModule('src/lib/payments/config.ts');
  const order = { id: 'synthetic-owned-order', order_code: 'BAG-OWNED-EXISTING', checkout_session_id: operationId,
    email: 'owned@example.invalid', payment_provider: 'culqi', payment_lane: 'token', payment_order_id: null };
  const calls = [];
  const db = { from(table) {
    assert.equal(table, 'orders');
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: order, error: null }) };
  }, rpc(name, input) {
    calls.push({ name, input }); assert.equal(name, 'prepare_culqi_token_session');
    assert.equal(input.p_order_id, order.id);
    return Promise.resolve({ data: { sessionId: 'synthetic-existing-token-session', amount: 5800, expiresAt: '2999-01-01T00:00:00Z' }, error: null });
  } };
  const { POST } = sourceModule('src/app/api/payments/culqi/order/route.ts', {
    '@/lib/payments': paymentConfig,
    '@/lib/public-api-security': { PublicApiError: class extends Error {}, enforcePublicApiSecurity: async () => {} },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
  });
  const request = body => new Request('http://localhost:3000/api/payments/culqi/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const body = { orderCode: order.order_code, checkoutSessionId: operationId, email: order.email };
  const response = await POST(request(body));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionId, 'synthetic-existing-token-session');
  for (const changed of [{ email: 'other@example.invalid' }, { checkoutSessionId: secondOperationId }]) {
    assert.equal((await POST(request({ ...body, ...changed }))).status, 404);
  }
  assert.equal(calls.length, 1, 'Mismatched owner/session never enters token preparation');
});
