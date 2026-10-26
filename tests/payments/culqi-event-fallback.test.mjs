import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = await readFile(new URL('../../src/lib/payments/culqi.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const loadClient = new Function('assertCulqiEnabled', 'fetch', 'process', 'performance',
  executable + '; return { fetchCulqiEvent, CulqiApiError };');

const validId = 'evt_test_ABCDEFGHIJKLMNOP';
const liveId = 'evt_live_ABCDEFGHIJKLMNOP';
const secret = 'test-fixture-not-a-real-key';
const event = { object: 'event', id: validId, type: 'charge.creation.succeeded',
  data: JSON.stringify({ object: 'charge', id: 'chr_test_ABCDEFGHIJKLMNOP', amount: 5800,
    currency_code: 'PEN' }) };

function setup({ mode = 'sandbox', firstStatus = 400, firstParam = 'x-api-version',
  secondStatus = 200, secondEvent = event, afterFirst = () => {} } = {}) {
  let ms = 0;
  const calls = [];
  const client = loadClient(() => ({ hasSecretKey: true, mode }), async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url, init, headers });
    const first = calls.length === 1;
    if (first) afterFirst(() => { ms = 10001; });
    return new Response(JSON.stringify(first
      ? { type: 'parameter_error', param: firstParam, message: 'PRIVATE_PROVIDER_MESSAGE' }
      : secondStatus === 200 ? secondEvent : {
        type: 'parameter_error', param: 'id', message: 'PRIVATE_PROVIDER_MESSAGE',
      }), { status: first ? firstStatus : secondStatus });
  }, { env: { CULQI_SECRET_KEY: secret } }, { now: () => ms });
  return { ...client, calls };
}

test('one auth-only GET fallback verifies the same-mode documented-length event', async () => {
  const f = setup();
  assert.deepEqual(await f.fetchCulqiEvent(validId), event);
  assert.equal(f.calls.length, 2, 'Only one fallback allowed');
  assert.equal(f.calls[0].url, 'https://api.culqi.com/v2/events/' + validId);
  assert.equal(f.calls[1].url, f.calls[0].url);
  assert.equal(f.calls[0].headers.get('x-api-version'), '2');
  assert.equal(f.calls[0].headers.get('x-culqi-env'), 'test');
  assert.equal(f.calls[1].headers.get('x-api-version'), null);
  assert.equal(f.calls[1].headers.get('x-culqi-env'), null);
  for (const call of f.calls) {
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.body, undefined);
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.credentials, 'omit');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.headers.get('authorization'), 'Bearer ' + secret);
    assert.equal(call.headers.get('accept'), 'application/json');
    assert.ok(call.init.signal instanceof AbortSignal);
  }
  assert.equal(f.calls[0].init.signal, f.calls[1].init.signal, 'The deadline must be shared');
});

test('HTTP 400 on the explicit ID parameter cannot trigger fallback', async () => {
  const f = setup({ firstParam: 'id' });
  await assert.rejects(f.fetchCulqiEvent(validId), error =>
    error instanceof f.CulqiApiError && error.status === 400);
  assert.equal(f.calls.length, 1);
});

test('HTTP 400 for a wrong environment cannot trigger fallback', async () => {
  const f = setup({ mode: 'sandbox' });
  await assert.rejects(f.fetchCulqiEvent(liveId), error => error.status === 400);
  assert.equal(f.calls.length, 1);
});

test('A short ID and non-parameter HTTP error cannot trigger fallback', async () => {
  for (const options of [{ id: 'evt_test_lookup123' }, { firstStatus: 401 }, { firstStatus: 429 }]) {
    const f = setup(options);
    await assert.rejects(f.fetchCulqiEvent(options.id ?? validId));
    assert.equal(f.calls.length, 1);
  }
});

test('Second GET failure remains a failure and never starts another request', async () => {
  const f = setup({ secondStatus: 400 });
  await assert.rejects(f.fetchCulqiEvent(validId), error =>
    error instanceof f.CulqiApiError && error.status === 400);
  assert.equal(f.calls.length, 2);
});

test('No fallback is attempted after the original ten-second deadline', async () => {
  const f = setup({ afterFirst: advance => advance() });
  await assert.rejects(f.fetchCulqiEvent(validId), error => error.name === 'TimeoutError');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].init.signal.aborted, true);
});
