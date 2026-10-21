import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from '../helpers/load-ts.mjs';

// Integration at the application boundary: real route, coordinator, Culqi
// transport/parser and evidence validator. Only external capabilities are fake.
// The PostgreSQL transaction/locking contract is tested separately in SQL.
const origin = 'http://127.0.0.1:4208';
const checkoutSessionId = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCheckoutSessionId = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = '33333333-cccc-4ccc-8ccc-cccccccccccc';
const attemptId = '44444444-dddd-4ddd-8ddd-dddddddddddd';
const orderCode = 'BAG-LOCAL-CONFIRM';
const sourceId = 'tkn_test_LOCAL_SOURCE123';
const chargeId = 'chr_test_LOCAL_CHARGE123';
const syntheticSecret = 'sk_test_LOCAL_CONFIRMATION_FIXTURE';
// Node's test runner isolates this file in its own worker. Never inherit a real
// provider credential into the helper under test, even though fetch is mocked.
process.env.CULQI_SECRET_KEY = syntheticSecret;

const captured = (overrides = {}) => ({
  object: 'charge', id: chargeId, amount: 6800, currency_code: 'PEN',
  metadata: { bagelito_order_code: orderCode }, source: { id: sourceId },
  capture: true, current_amount: 6800, amount_refunded: 0, dispute: false,
  // A truthy provider "paid" flag is deliberately not the evidence contract.
  paid: false,
  ...overrides,
});
const jsonResponse = (payload, status = 201) => Response.json(payload, { status });
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options = {}) {
  const events = [], providerCalls = [], rpcCalls = [], filters = [], selections = [];
  const forbidden = [], securityCalls = [], configReads = [];
  const row = {
    id: orderId, order_code: orderCode, checkout_session_id: checkoutSessionId,
    email: 'fixture@example.invalid', customer_name: 'Local Fixture',
    delivery_address: 'Synthetic address — do not deliver', district: 'Lince',
    whatsapp: '000000000', total_amount: 68, status: 'payment_pending_review',
    payment_status: 'pending', payment_lane: 'token', payment_order_id: null,
    payment_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    ...options.order,
  };
  let claimState = 'idle';
  const config = { mode: 'sandbox', enabled: true, hasSecretKey: true, ...options.config };
  class FixturePublicApiError extends Error {
    constructor(message, status, retryAfterSeconds) {
      super(message); this.status = status; this.retryAfterSeconds = retryAfterSeconds;
    }
  }
  const configCapability = {
    getPaymentConfig() { configReads.push('route'); return config; },
    assertCulqiEnabled() {
      configReads.push('provider');
      if (!config.enabled || !config.hasSecretKey) throw new Error('Synthetic payments disabled');
      return config;
    },
    isCulqiRequestAllowed(request) {
      return config.enabled && request.url === origin + '/api/payments/culqi/charge'
        && request.headers.get('origin') === origin;
    },
  };
  const query = {
    select(columns) { selections.push(columns); return query; },
    eq(column, value) { filters.push([column, value]); return query; },
    async maybeSingle() {
      events.push('order.read');
      return { data: options.missingOrder ? null : row, error: options.queryError ?? null };
    },
  };
  const db = {
    from(table) { assert.equal(table, 'orders'); return query; },
    async rpc(name, args) {
      events.push('rpc.' + name); rpcCalls.push({ name, args });
      if (name === 'claim_culqi_charge') {
        assert.equal(args.p_order_id, orderId);
        if (claimState !== 'idle') return { data: { claimed: false, state: claimState }, error: null };
        claimState = 'submitting';
        return { data: { claimed: true, state: claimState, attempt_id: attemptId }, error: null };
      }
      if (name === 'finish_culqi_charge') {
        assert.equal(args.p_order_id, orderId); assert.equal(args.p_attempt_id, attemptId);
        claimState = args.p_state;
        return { data: { state: claimState }, error: null };
      }
      if (name === 'confirm_culqi_charge_result') {
        assert.equal(args.p_order_id, orderId);
        assert.equal(args.p_checkout_session_id, checkoutSessionId);
        assert.equal(args.p_charge_attempt_id, attemptId);
        row.payment_status = 'paid'; claimState = 'paid';
        return { data: { paymentState: 'paid', orderState: 'payment_confirmed', requiresReview: false }, error: null };
      }
      forbidden.push('RPC:' + name);
      throw new Error('Unapproved fixture RPC');
    },
  };
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', init };
    providerCalls.push(call); events.push('provider.' + call.method);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('authorization'), 'Bearer ' + syntheticSecret);
    if (call.url === 'https://api.culqi.com/v2/charges' && call.method === 'POST') {
      call.body = JSON.parse(init.body);
      return options.post ? options.post(call) : jsonResponse(captured(options.charge));
    }
    if (call.url === 'https://api.culqi.com/v2/charges/' + chargeId && call.method === 'GET') {
      return options.get ? options.get(call) : jsonResponse(captured(), 200);
    }
    forbidden.push(call.method + ':' + call.url);
    throw new Error('Every unapproved transport, event and webhook is blocked');
  });

  const overrides = {
    './config': configCapability,
    'next/server': { NextResponse: { json: (payload, init) => Response.json(payload, init) } },
    '@/lib/public-api-security': {
      PublicApiError: FixturePublicApiError,
      async enforcePublicApiSecurity(args) {
        securityCalls.push({ email: args.email, scope: args.scope, origin: args.request.headers.get('origin') });
        assert.equal(args.scope, 'payments'); assert.equal(args.whatsapp, '');
        if (options.securityDenied) throw new FixturePublicApiError('Synthetic local rate limit', 429, 60);
      },
    },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
  };
  const cache = new Map();
  // Loading the barrel preserves its real exports and all implementation below
  // it; ./config alone is the bounded synthetic server configuration capability.
  overrides['@/lib/payments'] = sourceModule('src/lib/payments/index.ts', overrides, cache);
  const { POST } = sourceModule('src/app/api/payments/culqi/charge/route.ts', overrides, cache);
  const request = async (payload = {}, requestOrigin = origin) => {
    const response = await POST(new Request(origin + '/api/payments/culqi/charge', {
      method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ orderCode, checkoutSessionId, email: row.email,
        sourceId, deviceId: 'LOCAL_DEVICE123', ...payload }),
    }));
    return { response, body: await response.json() };
  };
  t.after(() => assert.deepEqual(forbidden, [], 'No event, webhook, unknown RPC or real transport is permitted'));
  return { request, row, events, providerCalls, rpcCalls, filters, selections, securityCalls, configReads,
    confirmations: () => rpcCalls.filter(call => call.name === 'confirm_culqi_charge_result'),
    finishes: () => rpcCalls.filter(call => call.name === 'finish_culqi_charge') };
}

test('route integrates captured 201 through real validation and RPC into HTTP paid without GET or event', async t => {
  const f = fixture(t);
  const { response, body } = await f.request({ amount: 1, amountMinor: 1, currency: 'USD', mode: 'live' });
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, orderCode, paymentStatus: 'paid' });
  assert.deepEqual(f.events, ['order.read', 'rpc.claim_culqi_charge', 'provider.POST',
    'rpc.finish_culqi_charge', 'rpc.confirm_culqi_charge_result']);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.providerCalls[0].body.amount, 6800, 'Persisted soles, not caller amount, bind the charge');
  assert.equal(f.providerCalls[0].body.currency_code, 'PEN');
  assert.equal(f.providerCalls[0].body.capture, true);
  assert.equal(f.providerCalls[0].body.source_id, sourceId);
  assert.deepEqual(f.providerCalls[0].body.metadata, { bagelito_order_code: orderCode });
  assert.equal(f.providerCalls[0].body.antifraud_details.device_finger_print_id, 'LOCAL_DEVICE123');
  assert.deepEqual(f.filters, [['order_code', orderCode], ['checkout_session_id', checkoutSessionId]]);
  assert.deepEqual(f.securityCalls, [{ email: f.row.email, scope: 'payments', origin }]);
  assert.deepEqual(f.finishes().map(call => call.args.p_state), ['submitted']);
  const confirmation = f.confirmations()[0].args;
  assert.equal(confirmation.p_provenance, 'culqi_charge_post');
  assert.equal(confirmation.p_mode, 'test');
  assert.ok(Number.isFinite(Date.parse(confirmation.p_observed_at)));
  assert.deepEqual(confirmation.p_observation, { chargeId, sourceId, amountMinor: 6800,
    currencyCode: 'PEN', capture: true, currentAmountMinor: 6800, amountRefundedMinor: 0,
    dispute: false, captureDatePresent: false });
  assert.equal(JSON.stringify(body).includes(sourceId), false);
});

test('route supplements incomplete 201 with one GET of that same charge and records GET provenance', async t => {
  const incomplete = captured(); delete incomplete.current_amount;
  const f = fixture(t, { post: async () => jsonResponse(incomplete) });
  const { response, body } = await f.request();
  assert.equal(response.status, 200); assert.equal(body.paymentStatus, 'paid');
  assert.deepEqual(f.providerCalls.map(call => [call.method, call.url]), [
    ['POST', 'https://api.culqi.com/v2/charges'],
    ['GET', 'https://api.culqi.com/v2/charges/' + chargeId],
  ]);
  assert.equal(f.confirmations().length, 1);
  assert.equal(f.confirmations()[0].args.p_provenance, 'culqi_charge_get');
  assert.equal(f.confirmations()[0].args.p_observation.chargeId, chargeId);
});

test('route sends HTTP 200 REVIEW into 3DS without confirming or looking up a charge', async t => {
  const f = fixture(t, { post: async () => jsonResponse({ action_code: 'REVIEW', object: 'charge' }, 200) });
  const { response, body } = await f.request();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, orderCode, paymentStatus: 'requires_3ds', requires3DS: true });
  assert.deepEqual(f.finishes().map(call => call.args.p_state), ['requires_3ds']);
  assert.equal(f.confirmations().length, 0); assert.equal(f.providerCalls.length, 1);
});

const providerPrivateMarker = 'PRIVATE-PROVIDER-CARD-CONTACT-OFFLINE';
const privateProviderCharge = () => captured({
  email: providerPrivateMarker,
  metadata: { bagelito_order_code: orderCode, private_customer: providerPrivateMarker },
  source: { id: sourceId, card_number: '411111******1111 ' + providerPrivateMarker,
    last_four: providerPrivateMarker, iin: { bin: providerPrivateMarker },
    client: { ip: providerPrivateMarker, device_fingerprint: providerPrivateMarker } },
  antifraud_details: { first_name: providerPrivateMarker, last_name: providerPrivateMarker,
    address: providerPrivateMarker, email: providerPrivateMarker, phone_number: providerPrivateMarker },
  outcome: { merchant_message: providerPrivateMarker, user_message: providerPrivateMarker },
});
for (const [label, providerOptions, status, expectedPayload] of [
  ['captured POST', { post: async () => jsonResponse(privateProviderCharge()) }, 'paid',
    { stage: 'submitted', provenance: 'culqi_charge_post' }],
  ['captured GET supplement', { post: async () => {
    const incomplete = privateProviderCharge(); delete incomplete.current_amount;
    return jsonResponse(incomplete);
  }, get: async () => jsonResponse(privateProviderCharge(), 200) }, 'paid',
  { stage: 'submitted', provenance: 'culqi_charge_get' }],
  ['3DS REVIEW', { post: async () => jsonResponse({ action_code: 'REVIEW',
    source: privateProviderCharge().source, antifraud_details: privateProviderCharge().antifraud_details,
    merchant_message: providerPrivateMarker }, 200) }, 'requires_3ds',
  { stage: 'requires_3ds', action_code: 'REVIEW' }],
  ['ambiguous REVIEW', { post: async () => jsonResponse({ ...privateProviderCharge(), action_code: 'REVIEW' }) },
    'reconciliation_required', { stage: 'reconciliation_required', reason: 'authentication_required' }],
  ['provider error', { post: async () => jsonResponse({ object: 'error', type: 'card_error',
    user_message: providerPrivateMarker, source: privateProviderCharge().source }, 402) },
  'reconciliation_required', { stage: 'reconciliation_required' }],
]) {
  test(`route persists only reduced markers for ${label}, excluding provider card and contact data`, async t => {
    const f = fixture(t, providerOptions);
    const { body } = await f.request();
    assert.equal(body.paymentStatus, status);
    const persistedPayloads = f.rpcCalls.filter(call => Object.hasOwn(call.args, 'p_payload'))
      .map(call => call.args.p_payload);
    assert.equal(JSON.stringify(persistedPayloads).includes(providerPrivateMarker), false,
      'All persisted RPC payloads must exclude raw source, customer, antifraud, action and error fields');
    assert.deepEqual(persistedPayloads, [expectedPayload]);
  });
}

for (const [label, post] of [
  ['provider HTTP rejection', async () => jsonResponse({ object: 'error', type: 'card_error', message: 'Synthetic decline' }, 402)],
  ['provider transport failure', async () => { throw new Error('Synthetic transport failure'); }],
]) {
  test(`route keeps ${label} in review and a retry cannot create another charge`, async t => {
    const f = fixture(t, { post });
    for (let i = 0; i < 2; i++) {
      const { response, body } = await f.request();
      assert.equal(response.status, 409); assert.equal(body.paymentStatus, 'reconciliation_required');
    }
    assert.deepEqual(f.finishes().map(call => call.args.p_state), ['uncertain']);
    assert.equal(f.confirmations().length, 0); assert.equal(f.providerCalls.length, 1);
  });
}

test('route bounds provider timeout, keeps review and cannot issue a second charge', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const f = fixture(t, { post: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.request(); await flush();
  assert.equal(f.providerCalls.length, 1);
  t.mock.timers.tick(10_000); await flush();
  const { response, body } = await pending;
  assert.equal(response.status, 409); assert.equal(body.paymentStatus, 'reconciliation_required');
  assert.equal(f.providerCalls[0].init.signal.aborted, true);
  release(jsonResponse(captured())); await flush();
  assert.deepEqual(f.finishes().map(call => call.args.p_state), ['uncertain']);
  assert.equal(f.confirmations().length, 0);
  assert.equal((await f.request()).body.paymentStatus, 'reconciliation_required');
  assert.equal(f.providerCalls.length, 1);
});

for (const [label, charge] of [
  ['amount', { amount: 1 }], ['currency', { currency_code: 'USD' }],
  ['source', { source: { id: 'tkn_test_OTHER_SOURCE123' } }],
  ['order', { metadata: { bagelito_order_code: 'BAG-OTHER' } }],
  ['mode', { id: 'chr_live_LOCAL_CHARGE123' }], ['capture', { capture: false }],
]) {
  test(`route never reports paid for contradictory provider ${label}`, async t => {
    const f = fixture(t, { charge });
    const { response, body } = await f.request();
    assert.equal(response.status, 409); assert.equal(body.paymentStatus, 'reconciliation_required');
    assert.equal(f.confirmations().length, 0); assert.equal(f.providerCalls.length, 1, 'Contradiction must not be repaired by GET');
    assert.equal(f.finishes()[0].args.p_state, 'uncertain');
  });
}

test('route never pays when incomplete evidence GET contradicts the captured amount', async t => {
  const incomplete = captured(); delete incomplete.dispute;
  const f = fixture(t, { post: async () => jsonResponse(incomplete), get: async () => jsonResponse(captured({ amount: 1 }), 200) });
  const { response, body } = await f.request();
  assert.equal(response.status, 409); assert.equal(body.paymentStatus, 'reconciliation_required');
  assert.equal(f.providerCalls.length, 2); assert.equal(f.confirmations().length, 0);
  assert.equal(f.finishes()[0].args.p_charge_id, chargeId);
});

for (const [label, options, payload] of [
  ['caller checkout session', {}, { checkoutSessionId: otherCheckoutSessionId }],
  ['persisted checkout session', { order: { checkout_session_id: otherCheckoutSessionId } }, {}],
  ['trusted mode unavailable', { config: { mode: 'disabled' } }, {}],
  ['trusted mode disagrees with test token', { config: { mode: 'live' } }, {}],
  ['trusted configuration disabled', { config: { enabled: false } }, {}],
]) {
  test(`route never pays or contacts provider with ${label}`, async t => {
    const f = fixture(t, options);
    const { response, body } = await f.request(payload);
    assert.ok(response.status >= 400); assert.notEqual(body.paymentStatus, 'paid');
    assert.equal(f.providerCalls.length, 0); assert.equal(f.confirmations().length, 0);
    assert.equal(f.rpcCalls.length, 0);
  });
}

test('route enforces its bounded origin and security capabilities before any provider operation', async t => {
  const f = fixture(t, { securityDenied: true });
  const outside = await f.request({}, 'https://outside.invalid');
  assert.equal(outside.response.status, 503);
  assert.equal(f.securityCalls.length, 0);
  const denied = await f.request();
  assert.equal(denied.response.status, 429);
  assert.equal(denied.response.headers.get('retry-after'), '60');
  assert.deepEqual(f.providerCalls, []); assert.deepEqual(f.rpcCalls, []);
});
