import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';

const clientSource = await readFile(new URL('../../src/lib/payments/culqi.ts', import.meta.url), 'utf8');
const handlerSource = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const executable = (source) => stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const loadClient = new Function('assertCulqiEnabled', 'fetch', 'process', 'performance', `${executable(clientSource)}; return { fetchCulqiEvent, createCulqiCharge, CulqiApiError };`);
const loadHandler = new Function('NextResponse', 'fetchCulqiEvent', 'isCulqiRequestAllowed', 'createSupabaseAdminClient',
  'parseCulqiEventResource', 'verifyCulqiEventIdentity', 'console', `${executable(handlerSource)}; return POST;`);
const eventId = 'evt_test_lookup123';
const chargeId = 'chr_test_lookup123';
const privateMarker = 'fixture-PRIVATE-never-log@example.invalid sk_test_fixture_do_not_use card_4111111111111111';
const errorTypes = ['invalid_request_error', 'authentication_error', 'parameter_error', 'card_error',
  'limit_api_error', 'resource_error', 'api_error'];
const verifiedEvent = { id: eventId, type: 'charge.creation.succeeded',
  data: JSON.stringify({ object: 'charge', id: chargeId, amount: 6600, currency_code: 'PEN' }) };

function setup({ mode = 'sandbox', enabled = true, hasSecretKey = true, status = 200, payload = verifiedEvent,
  transport = null, enforceSdkContract = false, now = () => performance.now() } = {}) {
  const requests = [], rpcCalls = [], clientCalls = [], logs = [];
  const client = loadClient(() => {
    if (!enabled) throw new Error('Culqi payments are not enabled yet.');
    return { enabled: true, hasSecretKey, mode };
  }, async (url, init) => {
    requests.push({ url, init });
    if (transport) return transport(url, init);
    // This is the official Python SDK request contract, NOT a claim about
    // Culqi's server behavior. Only this fixture rejects missing SDK headers.
    const headers = new Headers(init.headers);
    const matchingContract = headers.get('x-api-version') === '2'
      && headers.get('x-culqi-env') === (mode === 'sandbox' ? 'test' : 'live');
    const responseStatus = enforceSdkContract && !matchingContract ? 400 : status;
    const responsePayload = enforceSdkContract && !matchingContract
      ? { type: 'parameter_error', merchant_message: privateMarker } : payload;
    return new Response(JSON.stringify(responsePayload), { status: responseStatus,
      headers: { 'Content-Type': 'application/json' } });
  }, { env: { CULQI_SECRET_KEY: 'fixture-only-not-a-key' } }, { now });
  const post = loadHandler({ json: (responsePayload, init = {}) => ({ payload: responsePayload,
    status: init.status ?? 200, headers: init.headers }) }, client.fetchCulqiEvent, () => enabled, () => {
    clientCalls.push('database');
    return { rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: { status: 'paid' }, error: null };
    } };
  }, parseCulqiEventResource, verifyCulqiEventIdentity, {
    info: (...args) => logs.push(args), error: () => assert.fail('No raw error logging'),
    warn: () => assert.fail('No raw error logging'), log: () => assert.fail('No raw logging'),
  });
  return { ...client, requests, clientCalls, rpcCalls, logs,
    post: (received = { id: eventId, type: 'charge.creation.succeeded', paid: true, data: verifiedEvent.data }) =>
      post(new Request('https://fixture.invalid/api/webhooks/culqi', { method: 'POST', body: JSON.stringify(received) })) };
}

function assertSafeFailure(fixture, response, errorType = 'unknown') {
  assert.equal(response.status, 500);
  assert.deepEqual(response.payload, { ok: false, error: 'Could not process Culqi webhook.' });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(fixture.clientCalls, []);
  assert.deepEqual(fixture.rpcCalls, []);
  assert.equal(fixture.logs.length, 1);
  const diagnostic = fixture.logs[0][1];
  assert.equal(diagnostic.stage, 'event_lookup');
  assert.equal(diagnostic.eventVerified, false);
  assert.equal(diagnostic.transactionAttempted, false);
  assert.equal(diagnostic.upstreamErrorType, errorType);
  for (const marker of [privateMarker, eventId, chargeId, 'fixture-only-not-a-key', 'raw-param', 'raw-code']) {
    assert.equal(JSON.stringify(fixture.logs).includes(marker), false);
    assert.equal(JSON.stringify(response).includes(marker), false);
  }
}

test('real event client uses the SDK GET contract for each existing configured mode', async () => {
  for (const [mode, providerEnvironment] of [['sandbox', 'test'], ['live', 'live']]) {
    const fixture = setup({ mode });
    await fixture.fetchCulqiEvent(eventId);
    assert.equal(fixture.requests.length, 1);
    const [{ url, init }] = fixture.requests;
    assert.equal(url, `https://api.culqi.com/v2/events/${eventId}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.cache, 'no-store');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('accept'), 'application/json');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('authorization'), 'Bearer fixture-only-not-a-key');
    assert.equal(headers.get('x-api-version'), '2');
    assert.equal(headers.get('x-culqi-env'), providerEnvironment);
  }
});

test('SDK-contract transport fixture reaches the real verification handler and one unchanged RPC', async () => {
  const fixture = setup({ enforceSdkContract: true });
  const response = await fixture.post({ id: eventId, type: 'charge.creation.failed', paid: false,
    data: { id: 'unverified-caller-charge', amount: 1, currency_code: 'USD' } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { ok: true, status: 'paid' });
  assert.equal(fixture.requests.length, 1);
  assert.deepEqual(fixture.clientCalls, ['database']);
  assert.deepEqual(fixture.rpcCalls, [{ name: 'apply_culqi_payment_event', args: {
    p_event_id: eventId, p_event_type: 'charge.creation.succeeded',
    p_resource: JSON.parse(verifiedEvent.data), p_verified_payload: verifiedEvent,
  } }]);
  assert.equal(fixture.logs[0][1].upstreamErrorType, 'none');
});

const flush = () => new Promise(resolve => setImmediate(resolve));
for (const phase of ['headers', 'body']) {
  for (const elapsed of [10000, 10001]) {
    test(`event lookup rejects late ${phase} at ${elapsed}ms before delayed timers`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      let now = 0, headers, body, bodyReads = 0;
      const fixture = setup({ now: () => now,
        transport: () => new Promise(resolve => { headers = resolve; }) });
      const response = { ok: true, status: 200, json: () => {
        bodyReads++;
        return phase === 'body' ? new Promise(resolve => { body = resolve; }) : Promise.resolve(verifiedEvent);
      } };
      const pending = fixture.post();
      await flush();
      assert.equal(fixture.requests.length, 1);
      if (phase === 'body') {
        now = 6000;
        headers(response);
        await flush();
        assert.equal(bodyReads, 1);
      }
      // The clock advances while the timer callback remains queued. A result
      // outside the budget cannot proceed to identity verification or SQL.
      now = elapsed;
      if (phase === 'headers') headers(response);
      else body(verifiedEvent);
      assertSafeFailure(fixture, await pending);
      assert.equal(fixture.logs[0][1].upstreamFailureClass, 'timeout');
      assert.equal(fixture.logs[0][1].upstreamHttpStatus, null);
      assert.equal(fixture.requests[0].init.signal.aborted, true);
      assert.equal(bodyReads, phase === 'body' ? 1 : 0, 'Expired headers cannot start reading a body');
      t.mock.timers.tick(20000);
      await flush();
      assert.equal(fixture.logs.length, 1);
      assert.deepEqual(fixture.rpcCalls, []);
    });
  }
  test(`event lookup accepts ${phase} at 9999ms with its timer still queued`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let now = 0;
    const fixture = setup({ now: () => now, transport: async () => {
      if (phase === 'headers') now = 9999;
      return { ok: true, status: 200, json: async () => { now = 9999; return verifiedEvent; } };
    } });
    assert.equal((await fixture.post()).status, 200);
    assert.equal(fixture.rpcCalls.length, 1);
    t.mock.timers.tick(20000);
    await flush();
    assert.equal(fixture.requests[0].init.signal.aborted, false);
    assert.equal(fixture.logs.length, 1);
  });
}

test('event lookup rejects an expired result when queued continuations resume', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  const fixture = setup({ now: () => now, transport: async () => ({
    ok: true, status: 200, json: async () => {
      // The provider body resolves in time; subsequent queued work consumes
      // the budget before the handler can accept its result.
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { now = 10001; })));
      return verifiedEvent;
    },
  }) });
  assertSafeFailure(fixture, await fixture.post());
  assert.equal(fixture.logs[0][1].upstreamFailureClass, 'timeout');
  assert.equal(fixture.requests[0].init.signal.aborted, true);
  assert.deepEqual(fixture.rpcCalls, []);
});

for (const phase of ['headers', 'body']) {
  test(`event lookup bounds stalled ${phase} and ignores its late response`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let headers, body;
    const fixture = setup({ transport: () => new Promise(resolve => { headers = resolve; }) });
    let settled = false;
    const pending = fixture.post().then(response => { settled = true; return response; });
    await flush();
    assert.equal(fixture.requests.length, 1);
    if (phase === 'body') {
      t.mock.timers.tick(6000);
      headers({ ok: true, status: 200, json: () => new Promise(resolve => { body = resolve; }) });
      await flush();
      t.mock.timers.tick(3999);
    } else t.mock.timers.tick(9999);
    await flush(); assert.equal(settled, false);
    t.mock.timers.tick(1); await flush();
    assert.equal(settled, true, 'The event GET and JSON body must share one 10-second deadline, even if abort is ignored');
    assertSafeFailure(fixture, await pending);
    assert.equal(fixture.logs[0][1].upstreamFailureClass, 'timeout');
    assert.equal(fixture.logs[0][1].upstreamHttpStatus, null);
    assert.equal(fixture.requests[0].init.signal.aborted, true);
    if (phase === 'body') body(verifiedEvent);
    else headers({ ok: true, status: 200, json: async () => verifiedEvent });
    await flush();
    assert.deepEqual(fixture.rpcCalls, []);
    assert.equal(fixture.logs.length, 1, 'A late response cannot continue to verification or settlement');
  });
}

test('a completed event lookup clears its deadline without cancelling the successful response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = setup();
  assert.equal((await fixture.post()).status, 200);
  assert.ok(fixture.requests[0].init.signal instanceof AbortSignal, 'Event GET must carry its owned cancellation signal');
  t.mock.timers.tick(20000); await flush();
  assert.equal(fixture.requests[0].init.signal.aborted, false);
  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(fixture.logs.length, 1);
});

test('each SDK error type is classified without acknowledging caller payment claims or opening DB', async () => {
  for (const type of errorTypes) {
    const fixture = setup({ status: 400, payload: { type, param: 'raw-param', code: 'raw-code',
      message: privateMarker, merchant_message: privateMarker, user_message: privateMarker,
      details: { authorization: privateMarker, payload: privateMarker } } });
    const response = await fixture.post();
    assertSafeFailure(fixture, response, type);
    assert.equal(fixture.logs[0][1].upstreamHttpStatus, 400);
    assert.equal(fixture.logs[0][1].upstreamFailureClass, 'http');
  }
});

test('HTTP lookup failures report only whether the event prefix matches the configured provider environment', async () => {
  for (const [mode, id, expected] of [
    ['sandbox', eventId, true], ['sandbox', 'evt_live_lookup123', false],
    ['live', 'evt_live_lookup123', true], ['live', eventId, false],
  ]) {
    const fixture = setup({ mode, status: 400, payload: { type: 'parameter_error', message: privateMarker } });
    const response = await fixture.post({ id, paid: true, data: verifiedEvent.data });
    assertSafeFailure(fixture, response, 'parameter_error');
    assert.equal(fixture.logs[0][1].eventModeMatchesConfig, expected);
    assert.equal(fixture.logs[0][1].upstreamHttpStatus, 400);
    assert.equal(JSON.stringify(fixture.logs).includes(id), false);
    await assert.rejects(fixture.fetchCulqiEvent(id), (error) => {
      assert.equal(error.eventModeMatchesConfig, expected);
      assert.throws(() => { error.eventModeMatchesConfig = !expected; }, TypeError);
      assert.equal(error.eventModeMatchesConfig, expected);
      return true;
    });
  }
});

test('typed client errors normalize unknown, absent, and hostile types to a fixed safe classification', async () => {
  const fixture = setup();
  for (const type of [...errorTypes, undefined, null, privateMarker, 'parameter_error ',
    ['parameter_error'], { private: privateMarker }, 400, true]) {
    const error = new fixture.CulqiApiError({ type, message: privateMarker, param: privateMarker }, 400);
    assert.equal(error.errorType, errorTypes.includes(type) ? type : 'unknown');
  }
  const payload = { message: privateMarker };
  Object.defineProperty(payload, 'type', { get() { throw new Error(privateMarker); } });
  const error = new fixture.CulqiApiError(payload, 400);
  assert.equal(error.errorType, 'unknown', 'Hostile type accessors must not interrupt safe classification');
});

test('unknown and malformed provider errors preserve a bounded retryable response', async () => {
  for (const payload of [null, 'private-provider-body', [], {}, { type: privateMarker },
    { type: { private: privateMarker } }, { type: ['parameter_error'] }]) {
    const fixture = setup({ status: 400, payload });
    assertSafeFailure(fixture, await fixture.post());
  }
  const fixture = setup({ transport: async () => ({ ok: false, status: 400,
    json: async () => { throw new Error(privateMarker); } }) });
  assertSafeFailure(fixture, await fixture.post());
});

test('authenticated event identity mismatch never uses the claimed paid caller resource', async () => {
  const fixture = setup({ payload: { ...verifiedEvent, id: 'evt_test_different' } });
  const response = await fixture.post();
  assert.equal(response.status, 500);
  assert.equal(fixture.requests.length, 1);
  assert.deepEqual(fixture.clientCalls, []);
  assert.deepEqual(fixture.rpcCalls, []);
  assert.equal(fixture.logs[0][1].stage, 'event_identity');
  assert.equal(fixture.logs[0][1].upstreamErrorType, 'none');
});

test('invalid incoming IDs and disabled scope make zero provider or DB calls', async () => {
  for (const id of ['evt_test_short', 'evt_test_abcdefgh?secret=x', '../events', '', null]) {
    const fixture = setup();
    const response = await fixture.post({ id, type: 'charge.creation.succeeded', paid: true });
    assert.equal(response.status, 400);
    assert.deepEqual(fixture.requests, []);
    assert.deepEqual(fixture.clientCalls, []);
    assert.deepEqual(fixture.rpcCalls, []);
  }
  const fixture = setup({ enabled: false });
  assert.equal((await fixture.post()).status, 503);
  await assert.rejects(fixture.fetchCulqiEvent(eventId), /not enabled/);
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.clientCalls, []);
  assert.deepEqual(fixture.rpcCalls, []);
});

test('unrecognized configured modes and missing secret fail before event transport', async () => {
  for (const mode of ['disabled', null, '', 'test', 'LIVE', privateMarker]) {
    const fixture = setup({ mode });
    await assert.rejects(fixture.fetchCulqiEvent(eventId), /event environment/);
    assert.deepEqual(fixture.requests, []);
  }
  const fixture = setup({ hasSecretKey: false });
  await assert.rejects(fixture.fetchCulqiEvent(eventId), /secret key/);
  assert.deepEqual(fixture.requests, []);
});

test('event-only SDK headers cannot alter the existing single-charge request or body', async () => {
  const fixture = setup({ transport: async (url) => ({ ok: true,
    status: url.endsWith('/charges') ? 201 : 200,
    json: async () => url.endsWith('/charges') ? { object: 'charge', id: chargeId } : verifiedEvent }) });
  const result = await fixture.createCulqiCharge({ amount: 66, customerEmail: 'fixture@example.invalid',
    customerName: 'Fixture Person', deliveryAddress: 'Fixture', district: 'Lince', orderCode: 'BAG-FIXTURE',
    phoneNumber: '000000000', sourceId: 'ype_test_fixture123' });
  assert.equal(result.requires3DS, false);
  await fixture.fetchCulqiEvent(eventId);
  assert.equal(fixture.requests.length, 2);
  const [{ url, init }, eventRequest] = fixture.requests;
  assert.equal(url, 'https://api.culqi.com/v2/charges');
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('x-api-version'), null);
  assert.equal(headers.get('x-culqi-env'), null);
  assert.equal(headers.get('authorization'), 'Bearer fixture-only-not-a-key');
  assert.equal(JSON.parse(init.body).amount, 6600);
  assert.equal(JSON.parse(init.body).source_id, 'ype_test_fixture123');
  assert.equal(eventRequest.init.body, undefined);
});
