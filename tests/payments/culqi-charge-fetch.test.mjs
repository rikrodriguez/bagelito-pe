import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { sourceModule } from '../helpers/load-ts.mjs';

const { coordinateCulqiCharge } = sourceModule('src/lib/payments/charge-coordinator.ts');

const source = await readFile(new URL('../../src/lib/payments/culqi.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('assertCulqiEnabled', 'fetch', 'process', 'performance', 'console',
  `${body}; return { fetchCulqiCharge: typeof fetchCulqiCharge === 'undefined' ? undefined : fetchCulqiCharge, createCulqiCharge, CulqiApiError };`);
const chargeId = 'chr_test_SYNTHETIC_LOOKUP01';
const privateMarker = 'fixture-private@example.invalid sk_test_SYNTHETIC_ONLY';
const charge = { object: 'charge', id: chargeId, amount: 12300, currency_code: 'PEN',
  capture: true, current_amount: 12300, amount_refunded: 0, dispute: false };
const creation = { amount: 123, customerEmail: 'fixture@example.invalid', customerName: 'Fixture Person',
  deliveryAddress: 'Fixture Address', district: 'Lince', orderCode: 'BAG-SYNTHETIC',
  phoneNumber: '000000000', sourceId: 'tkn_test_SYNTHETIC_SOURCE01' };
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ mode = 'sandbox', enabled = true, hasSecretKey = true, transport,
  now = () => performance.now() } = {}) {
  const calls = [], logs = [];
  const client = load(() => {
    if (!enabled) throw new Error('Culqi payments are not enabled yet.');
    return { mode, hasSecretKey };
  }, async (url, init) => {
    calls.push({ url, init });
    if (transport) return transport(url, init);
    return new Response(JSON.stringify(charge), { status: 200 });
  }, { env: { CULQI_SECRET_KEY: 'fixture-only-not-a-key' } }, { now }, {
    info: (...args) => logs.push(args), warn: (...args) => logs.push(args),
    error: (...args) => logs.push(args), log: (...args) => logs.push(args),
  });
  return { ...client, calls, logs };
}

test('one authenticated charge GET uses a fixed origin, matching mode and no redirect or credentials', async () => {
  for (const [mode, environment] of [['sandbox', 'test'], ['live', 'live']]) {
    const id = `chr_${environment}_SYNTHETIC_LOOKUP01`;
    const fixture = setup({ mode, transport: async () => new Response(JSON.stringify({ ...charge, id }), { status: 200 }) });
    assert.equal(typeof fixture.fetchCulqiCharge, 'function');
    assert.deepEqual(await fixture.fetchCulqiCharge(id), { ...charge, id });
    assert.equal(fixture.calls.length, 1);
    const [{ url, init }] = fixture.calls;
    assert.equal(url, `https://api.culqi.com/v2/charges/${id}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture-only-not-a-key');
    assert.equal(headers.get('accept'), 'application/json');
    assert.equal(headers.get('x-api-version'), '2');
    assert.equal(headers.get('x-culqi-env'), environment);
    assert.equal(headers.get('cookie'), null);
    assert.deepEqual(fixture.logs, []);
  }
});

test('invalid charge identity, mode mismatch or disabled configuration makes zero provider calls', async () => {
  for (const id of ['', null, 1, 'chr_test_short', 'evt_test_SYNTHETIC_LOOKUP01',
    'chr_live_SYNTHETIC_LOOKUP01', chargeId + '?secret=x', chargeId + '/other', ' ' + chargeId, chargeId + ' ']) {
    const fixture = setup();
    assert.equal(typeof fixture.fetchCulqiCharge, 'function');
    await assert.rejects(fixture.fetchCulqiCharge(id));
    assert.deepEqual(fixture.calls, []);
  }
  for (const options of [{ mode: 'disabled' }, { mode: 'invalid' }, { enabled: false }, { hasSecretKey: false }]) {
    const fixture = setup(options);
    assert.equal(typeof fixture.fetchCulqiCharge, 'function');
    await assert.rejects(fixture.fetchCulqiCharge(chargeId));
    assert.deepEqual(fixture.calls, []);
  }
});

test('a different charge or malformed provider body cannot become an authenticated charge observation', async () => {
  for (const payload of [{ ...charge, id: 'chr_test_SYNTHETIC_OTHER01' }, { ...charge, object: 'event' },
    null, [], {}, 'not a charge']) {
    const fixture = setup({ transport: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    assert.equal(typeof fixture.fetchCulqiCharge, 'function');
    await assert.rejects(fixture.fetchCulqiCharge(chargeId));
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fixture.logs, []);
  }
});

test('redirect responses and redirected locations are rejected without a second lookup', async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: 'https://elsewhere.invalid/' } }),
    { ok: true, status: 200, redirected: true, url: 'https://elsewhere.invalid/', json: async () => charge },
    { ok: true, status: 200, redirected: false, url: 'https://api.culqi.com/v2/charges/other', json: async () => charge }]) {
    const fixture = setup({ transport: async () => response });
    assert.equal(typeof fixture.fetchCulqiCharge, 'function');
    await assert.rejects(fixture.fetchCulqiCharge(chargeId));
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fixture.logs, []);
  }
});

test('failed charge GET keeps bounded HTTP classification without private errors or logging', async () => {
  const fixture = setup({ transport: async () => new Response(JSON.stringify({ type: 'parameter_error',
    user_message: privateMarker, merchant_message: privateMarker, charge_id: chargeId }), { status: 400 }) });
  assert.equal(typeof fixture.fetchCulqiCharge, 'function');
  await assert.rejects(fixture.fetchCulqiCharge(chargeId), error => {
    assert.equal(error.status, 400);
    assert.equal(error.errorType, 'parameter_error');
    assert.equal(error.message.includes(privateMarker), false);
    assert.equal(error.message.includes(chargeId), false);
    assert.equal(error.chargeId, null);
    return true;
  });
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.logs, []);
});

for (const operation of ['lookup', 'creation']) {
  for (const phase of ['headers', 'body']) {
    test(`${operation} shares a single 10-second headers/body deadline even when abort is ignored (${phase})`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      let now = 0, releaseHeaders, releaseBody, bodyReads = 0;
      const fixture = setup({ now: () => now, transport: () => new Promise(resolve => { releaseHeaders = resolve; }) });
      if (operation === 'lookup') assert.equal(typeof fixture.fetchCulqiCharge, 'function');
      let settled = false;
      const pending = (operation === 'lookup' ? fixture.fetchCulqiCharge(chargeId) : fixture.createCulqiCharge(creation))
        .then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
      await flush();
      assert.equal(fixture.calls.length, 1);
      const response = { ok: true, status: operation === 'lookup' ? 200 : 201, json: () => {
        bodyReads++;
        return phase === 'body' ? new Promise(resolve => { releaseBody = resolve; }) : Promise.resolve(charge);
      } };
      if (phase === 'body') {
        now = 6000; t.mock.timers.tick(6000); releaseHeaders(response); await flush();
        assert.equal(bodyReads, 1);
        now = 9999; t.mock.timers.tick(3999);
      } else { now = 9999; t.mock.timers.tick(9999); }
      await flush();
      assert.equal(settled, false);
      now = 10000; t.mock.timers.tick(1); await flush();
      assert.equal(settled, true, 'Owned deadline must settle even when the mock ignores AbortSignal');
      assert.equal((await pending).error?.name, 'TimeoutError');
      assert.equal(fixture.calls[0].init.signal.aborted, true);
      if (phase === 'body') releaseBody(charge); else releaseHeaders(response);
      await flush();
      assert.equal(fixture.calls.length, 1, 'A lost response cannot trigger a retry');
      assert.equal(bodyReads, phase === 'body' ? 1 : 0, 'A late header response cannot start its JSON body');
      assert.deepEqual(fixture.logs, []);
    });

    test(`${operation} rejects late ${phase} at the monotonic boundary while its timer remains queued`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      let now = 0;
      const fixture = setup({ now: () => now, transport: async () => {
        if (phase === 'headers') now = 10000;
        return { ok: true, status: operation === 'lookup' ? 200 : 201,
          json: async () => { now = 10000; return charge; } };
      } });
      if (operation === 'lookup') assert.equal(typeof fixture.fetchCulqiCharge, 'function');
      await assert.rejects(operation === 'lookup' ? fixture.fetchCulqiCharge(chargeId) : fixture.createCulqiCharge(creation),
        error => error.name === 'TimeoutError');
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.calls[0].init.signal.aborted, true);
      assert.deepEqual(fixture.logs, []);
    });
  }
}

test('completed lookup clears its deadline and preserves a successful response before expiry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  const fixture = setup({ now: () => now, transport: async () => ({ ok: true, status: 200,
    json: async () => { now = 9999; return charge; } }) });
  assert.equal(typeof fixture.fetchCulqiCharge, 'function');
  assert.deepEqual(await fixture.fetchCulqiCharge(chargeId), charge);
  now = 20000; t.mock.timers.tick(20000); await flush();
  assert.equal(fixture.calls[0].init.signal.aborted, false);
});

test('bounded creation keeps the existing 200 REVIEW 3DS branch and requires 201 for a charge', async () => {
  for (const [status, payload, expected] of [[200, { action_code: 'REVIEW' }, true], [201, charge, false]]) {
    const fixture = setup({ transport: async () => new Response(JSON.stringify(payload), { status }) });
    assert.equal((await fixture.createCulqiCharge(creation)).requires3DS, expected);
    assert.equal(fixture.calls.length, 1);
  }
  const fixture = setup({ transport: async () => new Response(JSON.stringify(charge), { status: 200 }) });
  await assert.rejects(fixture.createCulqiCharge(creation), /valid charge/);
  assert.equal(fixture.calls.length, 1);
});

// Real transport/parser, coordinator and evidence policy; only provider and
// database capabilities are synthetic. A requires_3ds claim can continue, so
// incorrectly classifying an ambiguous response would issue another POST.
function coordinatedFixture(client) {
  let state = 'idle';
  const finishes = [], confirmations = [];
  const db = { async rpc(name, args) {
    if (name === 'claim_culqi_charge') {
      if (state !== 'idle' && !(state === 'requires_3ds' && args.p_has_3ds)) {
        return { data: { claimed: false, state }, error: null };
      }
      state = 'submitting';
      return { data: { claimed: true, attempt_id: 'SYNTHETIC_ATTEMPT' }, error: null };
    }
    if (name === 'finish_culqi_charge') {
      finishes.push(args); state = args.p_state;
      return { data: { state }, error: null };
    }
    assert.equal(name, 'confirm_culqi_charge_result');
    confirmations.push(args); state = 'paid';
    return { data: { paymentState: 'paid', orderState: 'payment_confirmed', requiresReview: false }, error: null };
  } };
  const request = (has3DS = false) => coordinateCulqiCharge({
    db, orderId: 'SYNTHETIC_ORDER', orderCode: creation.orderCode,
    checkoutSessionId: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    amountMinor: 12300, mode: 'test', sourceId: creation.sourceId,
    deviceId: 'SYNTHETIC_DEVICE', has3DS,
    createCharge: () => client.createCulqiCharge({ ...creation, deviceFingerprintId: 'SYNTHETIC_DEVICE',
      ...(has3DS ? { authentication3DS: { cavv: 'fixture', eci: '05', protocolVersion: '2.1.0', xid: 'fixture' } } : {}) }),
    fetchCharge: client.fetchCulqiCharge,
  });
  return { request, finishes, confirmations };
}

const boundCapturedCharge = { ...charge, metadata: { bagelito_order_code: creation.orderCode },
  source: { id: creation.sourceId } };
for (const [label, status, payload, retainedId] of [
  ['200 REVIEW with charge identity', 200, { action_code: 'REVIEW', id: chargeId }, chargeId],
  ['200 REVIEW with capture but no identity', 200, { action_code: 'REVIEW', capture: true }, null],
  ['200 REVIEW with captured resource', 200, { ...boundCapturedCharge, action_code: 'REVIEW' }, chargeId],
  ['201 REVIEW with captured resource', 201, { ...boundCapturedCharge, action_code: 'REVIEW' }, chargeId],
]) {
  test(`${label} preserves uncertainty and cannot authorize another POST`, async () => {
    const client = setup({ transport: async () => Response.json(payload, { status }) });
    const fixture = coordinatedFixture(client);
    const first = await fixture.request();
    const continuation = await fixture.request(true);
    assert.equal(client.calls.length, 1, 'An ambiguous response cannot reopen the claim for a 3DS POST or GET');
    assert.equal(first.paymentStatus, 'reconciliation_required');
    assert.equal(continuation.paymentStatus, 'reconciliation_required');
    assert.deepEqual(fixture.confirmations, []);
    assert.deepEqual(fixture.finishes.map(args => [args.p_state, args.p_charge_id]), [['uncertain', retainedId]]);
  });
}

test('ordinary REVIEW permits one matching 3DS continuation and captured confirmation', async () => {
  let requests = 0;
  const client = setup({ transport: async () => ++requests === 1
    ? Response.json({ action_code: 'REVIEW' }, { status: 200 })
    : Response.json(boundCapturedCharge, { status: 201 }) });
  const fixture = coordinatedFixture(client);
  assert.equal((await fixture.request()).paymentStatus, 'requires_3ds');
  assert.equal((await fixture.request(true)).paymentStatus, 'paid');
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every(call => call.init.method === 'POST'));
  const [first, second] = client.calls.map(call => JSON.parse(call.init.body));
  assert.equal(first.source_id, second.source_id);
  assert.equal(first.antifraud_details.device_finger_print_id, second.antifraud_details.device_finger_print_id);
  assert.ok(second.authentication_3DS);
  assert.equal(fixture.confirmations.length, 1);
});

test('authenticated charge POST omits credentials and rejects a redirected response without retrying', async () => {
  const fixture = setup({ transport: async () => new Response(JSON.stringify(charge), { status: 201 }) });
  assert.equal((await fixture.createCulqiCharge(creation)).requires3DS, false);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].init.redirect, 'error');
  assert.equal(fixture.calls[0].init.credentials, 'omit');
  const headers = new Headers(fixture.calls[0].init.headers);
  assert.equal(headers.get('x-api-version'), null, 'Charge creation keeps its existing headers');
  assert.equal(headers.get('x-culqi-env'), null);
  for (const response of [
    { ok: true, status: 201, redirected: true, url: 'https://elsewhere.invalid/', json: async () => charge },
    { ok: true, status: 201, url: 'https://api.culqi.com/v2/other', json: async () => charge },
    new Response(null, { status: 302, headers: { Location: 'https://elsewhere.invalid/' } }),
  ]) {
    const redirected = setup({ transport: async () => response });
    await assert.rejects(redirected.createCulqiCharge(creation));
    assert.equal(redirected.calls.length, 1);
    assert.deepEqual(redirected.logs, []);
  }
});

for (const phase of ['headers', 'body']) {
  test(`real charge client timeout leaves the coordinator uncertain without accepting late ${phase}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let now = 0, releaseHeaders, releaseBody, claimed = false;
    const effects = [];
    const fixture = setup({ now: () => now, transport: () => new Promise(resolve => { releaseHeaders = resolve; }) });
    const db = { rpc: async (name, args) => {
      if (name === 'claim_culqi_charge') {
        if (claimed) return { data: { claimed: false, state: 'uncertain' }, error: null };
        claimed = true;
        return { data: { claimed: true, attempt_id: 'SYNTHETIC_ATTEMPT' }, error: null };
      }
      assert.equal(name, 'finish_culqi_charge');
      effects.push(args);
      return { data: { state: args.p_state }, error: null };
    } };
    const request = { db, orderId: 'SYNTHETIC_ORDER', orderCode: creation.orderCode,
      checkoutSessionId: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', amountMinor: 12300, mode: 'test',
      sourceId: creation.sourceId, deviceId: 'SYNTHETIC_DEVICE', has3DS: false,
      createCharge: () => fixture.createCulqiCharge(creation) };
    const pending = coordinateCulqiCharge(request);
    await flush();
    const response = { ok: true, status: 201, json: () => phase === 'body'
      ? new Promise(resolve => { releaseBody = resolve; }) : Promise.resolve(charge) };
    if (phase === 'body') { releaseHeaders(response); await flush(); }
    now = 10000; t.mock.timers.tick(10000); await flush();
    assert.equal((await pending).paymentStatus, 'reconciliation_required');
    assert.equal(effects.length, 1);
    assert.equal(effects[0].p_state, 'uncertain');
    assert.equal(effects[0].p_charge_id, null);
    if (phase === 'body') releaseBody(charge); else releaseHeaders(response);
    await flush();
    assert.equal(effects.length, 1, 'Late provider success cannot persist submitted after uncertainty');
    assert.equal((await coordinateCulqiCharge(request)).paymentStatus, 'reconciliation_required');
    assert.equal(fixture.calls.length, 1, 'The closed claim cannot issue a second charge');
  });
}

for (const operation of ['lookup', 'creation']) {
  test(`${operation} rejects an expired result after JSON resolves and queued work consumes its budget`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let now = 0;
    const fixture = setup({ now: () => now, transport: async () => ({
      ok: true, status: operation === 'lookup' ? 200 : 201,
      json: async () => {
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { now = 10001; })));
        return charge;
      },
    }) });
    await assert.rejects(operation === 'lookup' ? fixture.fetchCulqiCharge(chargeId) : fixture.createCulqiCharge(creation),
      error => error.name === 'TimeoutError');
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].init.signal.aborted, true);
  });
}
