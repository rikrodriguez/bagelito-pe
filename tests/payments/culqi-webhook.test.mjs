import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';
const source = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse', 'fetchCulqiEvent', 'isCulqiRequestAllowed', 'createSupabaseAdminClient', 'parseCulqiEventResource', 'verifyCulqiEventIdentity', 'console', `${body}; return POST;`);
const id = 'evt_test_12345678';
async function execute({
  event = {}, resource = { id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN' },
  error = null, data = { status: 'paid' }, enabled = true, receivedType = 'charge.creation.succeeded',
  requestBody = JSON.stringify({ id, type: receivedType }), requestHeaders = {},
  fetchError = null, clientError = null, rpcError = null,
} = {}) {
  const calls = [], fetchCalls = [], clientCalls = [], logs = [];
  const post = load({ json: (payload, init = {}) => ({ payload, status: init.status ?? 200 }) }, async (eventId) => {
    fetchCalls.push(eventId);
    if (fetchError) throw fetchError;
    return { id, type: 'charge.creation.succeeded', data: resource, ...event };
  }, () => enabled, () => {
    clientCalls.push('createSupabaseAdminClient');
    if (clientError) throw clientError;
    return { rpc: async (name, args) => {
      calls.push({ name, args });
      if (rpcError) throw rpcError;
      return { data, error };
    } };
  }, parseCulqiEventResource, verifyCulqiEventIdentity, {
    info: (...args) => logs.push({ level: 'info', args }),
    warn: (...args) => logs.push({ level: 'warn', args }),
    error: () => assert.fail('Webhook must not log raw errors'),
    log: () => assert.fail('Webhook must use its bounded diagnostic logger'),
  });
  const response = await post(new Request('https://fixture.invalid', { method: 'POST', body: requestBody, headers: requestHeaders }));
  return { response, calls, fetchCalls, clientCalls, logs };
}
test('authenticated resource is passed once to the transaction RPC', async () => {
  const { response, calls } = await execute();
  assert.equal(response.status, 200); assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'apply_culqi_payment_event');
  assert.equal(calls[0].args.p_resource.amount, 6800);
});
test('documented JSON-string event data is parsed before transaction', async () => {
  const { response, calls } = await execute({ resource: JSON.stringify({ id: 'chr_test_12345678', amount: 6800, currency: 'PEN' }) });
  assert.equal(response.status, 200); assert.equal(calls[0].args.p_resource.currency, 'PEN');
});
test('both selected charge events preserve object and JSON-string data through the mocked RPC', async () => {
  const fixture = {
    object: 'charge', id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN',
    metadata: { bagelito_order_code: 'FIXTURE-ORDER' },
    source: { id: 'tkn_test_fixture123', type: 'card' },
  };
  for (const [type, status] of [
    ['charge.creation.succeeded', 'paid'],
    ['charge.creation.failed', 'failed'],
  ]) {
    for (const resource of [fixture, JSON.stringify(fixture)]) {
      const { response, calls, fetchCalls, clientCalls } = await execute({ event: { type }, resource, data: { status }, receivedType: type });
      assert.equal(response.status, 200);
      assert.deepEqual(response.payload, { ok: true, status });
      assert.deepEqual(fetchCalls, [id]);
      assert.deepEqual(clientCalls, ['createSupabaseAdminClient']);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, 'apply_culqi_payment_event');
      assert.equal(calls[0].args.p_event_id, id);
      assert.equal(calls[0].args.p_event_type, type);
      assert.deepEqual(calls[0].args.p_resource, fixture);
      assert.deepEqual(calls[0].args.p_verified_payload, { id, type, data: resource });
    }
  }
});
test('invalid provider identity or absent provider type cannot use caller type', async () => {
  for (const event of [{ id: 'different' }, { type: undefined }, { type: '' }]) {
    const { response, calls } = await execute({ event });
    assert.equal(response.status, 500); assert.equal(calls.length, 0);
  }
});
test('malformed resources never reach the transaction', async () => {
  for (const resource of ['{', 'null', '[]', {}, [], 12]) {
    const { response, calls } = await execute({ resource });
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  }
});
test('missing migration or failed transaction is retryable, never success', async () => {
  for (const message of ['function does not exist', 'amount mismatch', 'history write failed']) {
    const { response, calls } = await execute({ error: { message } });
    assert.equal(response.status, 500); assert.equal(calls.length, 1);
    assert.equal(response.payload.ok, false);
  }
});
test('duplicate transaction result is returned without extra writes', async () => {
  const { response, calls } = await execute({ data: { duplicate: true } });
  assert.equal(response.payload.duplicate, true); assert.equal(calls.length, 1);
});
test('disabled payments make no provider lookup, database client or transaction call for either charge event', async () => {
  for (const type of ['charge.creation.succeeded', 'charge.creation.failed']) {
    for (const resource of [{ id: 'chr_test_12345678' }, '{"id":"chr_test_12345678"}']) {
      const { response, calls, fetchCalls, clientCalls } = await execute({ enabled: false, event: { type }, resource, receivedType: type });
      assert.equal(response.status, 503);
      assert.deepEqual(fetchCalls, []);
      assert.deepEqual(clientCalls, []);
      assert.deepEqual(calls, []);
    }
  }
});
test('refund events require reconciliation and never reach payment transaction', async () => {
 for(const event of [{type:'refund.creation.succeeded'},{type:'charge.creation.succeeded',data:{object:'refund',id:'ref_test_fixture123'}}]) {
  const {response,calls}=await execute({event});assert.equal(response.status,501);assert.equal(calls.length,0);
 }
});

const sensitiveMarkers = [
  'sk_test_synthetic_never_use', 'pk_test_synthetic_never_use',
  'fixture-person@example.invalid', '4111111111111111',
  'Bearer fixture-authorization-token', 'fixture_cookie=synthetic_session',
  'merchant_message_synthetic_private', 'private_payload_synthetic',
];
const sensitiveText = sensitiveMarkers.join(' ');
const hostileError = () => Object.assign(new Error(sensitiveText), {
  headers: { authorization: sensitiveMarkers[4], cookie: sensitiveMarkers[5] },
  merchant_message: sensitiveMarkers[6], payload: sensitiveMarkers[7],
});
const diagnosticStages = new Set(['scope', 'request', 'event_lookup', 'event_identity', 'resource', 'database_client', 'transaction']);
const diagnosticReasons = new Set([
  'scope_rejected', 'invalid_event_id', 'malformed_request',
  'upstream_unauthorized', 'upstream_not_found', 'upstream_rate_limited', 'upstream_failure',
  'event_identity_mismatch', 'refund_requires_review', 'event_ignored', 'missing_resource',
  'database_client_failure', 'rpc_missing', 'rpc_permission_denied', 'amount_currency_mismatch',
  'order_missing', 'source_mismatch', 'payment_attempt_missing', 'legacy_requires_review',
  'rpc_failure', 'invalid_rpc_result', 'applied', 'duplicate', 'unexpected_failure',
]);
const diagnosticPaymentStates = new Set(['none', 'unknown', 'paid', 'pending', 'failed', 'expired']);
function assertOneSafeDiagnostic(result) {
  assert.equal(result.logs.length, 1, 'Every handled webhook must produce one bounded diagnostic');
  const [{ level, args }] = result.logs;
  assert.equal(level, 'info');
  assert.equal(args.length, 2, 'Diagnostic consists only of a constant label and a bounded object');
  assert.equal(args[0], 'culqi_webhook_diagnostic');
  assert.ok(args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]));
  assert.deepEqual(Object.keys(args[1]).sort(), [
    'stage', 'reason', 'httpStatus', 'eventVerified', 'transactionAttempted', 'paymentState', 'duplicate',
  ].sort(), 'No dynamic field may be added to the private diagnostic');
  assert.ok(diagnosticStages.has(args[1].stage), 'Stage must be a fixed local enum');
  assert.ok(diagnosticReasons.has(args[1].reason), 'Reason must be a fixed local enum');
  assert.ok(diagnosticPaymentStates.has(args[1].paymentState), 'Payment state must be normalized to a fixed enum');
  assert.equal(args[1].httpStatus, result.response.status);
  assert.equal(typeof args[1].eventVerified, 'boolean');
  assert.equal(typeof args[1].transactionAttempted, 'boolean');
  assert.equal(typeof args[1].duplicate, 'boolean');
  assert.equal(args[1].transactionAttempted, result.calls.length > 0, 'Transaction flag describes an actual mocked RPC invocation');
  for (const value of Object.values(args[1])) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), 'No error, payload, header or nested object may enter logs');
  }
  const serialized = JSON.stringify(result.logs);
  for (const marker of [...sensitiveMarkers, id, 'chr_test_12345678', 'tkn_test_fixture123', 'FIXTURE-ORDER']) {
    assert.equal(serialized.includes(marker), false, `Diagnostic leaked a synthetic sensitive marker: ${marker}`);
  }
  return args[1];
}

test('invalid request bodies log a bounded failure without provider or database access', async () => {
  for (const requestBody of ['{', JSON.stringify({ id: sensitiveText, payload: sensitiveText })]) {
    const result = await execute({ requestBody });
    assert.ok([400, 500].includes(result.response.status));
    assert.deepEqual(result.fetchCalls, []);
    assert.deepEqual(result.clientCalls, []);
    assert.deepEqual(result.calls, []);
    assertOneSafeDiagnostic(result);
  }
});

test('provider and database exceptions never log error messages, payloads or headers', async () => {
  for (const options of [
    { fetchError: hostileError() },
    { clientError: hostileError() },
    { rpcError: hostileError() },
    { error: { message: sensitiveText, details: sensitiveText, hint: sensitiveText } },
  ]) {
    const result = await execute(options);
    assert.equal(result.response.status, 500);
    assert.equal(result.response.payload.ok, false);
    assertOneSafeDiagnostic(result);
  }
});

test('success diagnostics omit request, authenticated resource and RPC result private fields', async () => {
  const baseline = await execute();
  const result = await execute({
    requestHeaders: { authorization: sensitiveMarkers[4], cookie: sensitiveMarkers[5], 'x-fixture-secret': sensitiveText },
    requestBody: JSON.stringify({ id, type: sensitiveText, payload: sensitiveText }),
    resource: {
      id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN',
      source: { id: 'tkn_test_fixture123', number: sensitiveMarkers[3] },
      email: sensitiveMarkers[2], merchant_message: sensitiveMarkers[6],
      metadata: { bagelito_order_code: 'FIXTURE-ORDER', secret: sensitiveText },
      payload: sensitiveMarkers[7],
    },
    data: { status: 'paid', privateField: sensitiveText },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.calls.length, 1);
  assertOneSafeDiagnostic(result);
  assert.deepEqual(result.logs, baseline.logs, 'Private request, event and RPC fields cannot alter the diagnostic');
});

test('diagnostics report verified transaction outcomes and normalize unknown or forged states', async () => {
  for (const [data, paymentState, duplicate, reason] of [
    [{ status: 'paid' }, 'paid', false, 'applied'],
    [{ status: 'pending' }, 'pending', false, 'applied'],
    [{ status: 'failed' }, 'failed', false, 'applied'],
    [{ status: 'expired' }, 'expired', false, 'applied'],
    [{ status: sensitiveText }, 'unknown', false, 'applied'],
    [{ status: { secret: sensitiveText } }, 'unknown', false, 'applied'],
    [{ duplicate: true }, 'unknown', true, 'duplicate'],
    [{ status: 'paid', duplicate: 'true' }, 'paid', false, 'applied'],
  ]) {
    const result = await execute({ data, requestBody: JSON.stringify({ id, status: 'paid', duplicate: true }) });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(result.response.status, 200);
    assert.equal(diagnostic.stage, 'transaction');
    assert.equal(diagnostic.eventVerified, true);
    assert.equal(diagnostic.paymentState, paymentState);
    assert.equal(diagnostic.duplicate, duplicate);
    assert.equal(diagnostic.reason, reason);
  }
});

test('failed request and unverified provider identity cannot claim verified payment progress', async () => {
  for (const [options, stage, reason] of [
    [{ enabled: false }, 'scope', 'scope_rejected'],
    [{ requestBody: '{' }, 'request', 'malformed_request'],
    [{ requestBody: JSON.stringify({ id: sensitiveText }) }, 'request', 'invalid_event_id'],
    [{ fetchError: hostileError() }, 'event_lookup', 'upstream_failure'],
    [{ event: { id: 'different' } }, 'event_identity', 'event_identity_mismatch'],
  ]) {
    const result = await execute(options);
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.stage, stage);
    assert.equal(diagnostic.reason, reason);
    assert.equal(diagnostic.eventVerified, false);
    assert.equal(diagnostic.transactionAttempted, false);
    assert.equal(diagnostic.paymentState, 'none');
    assert.equal(diagnostic.duplicate, false);
  }
});

test('provider HTTP failures map only to allowlisted diagnostic reasons while remaining retryable', async () => {
  for (const [status, reason] of [
    [401, 'upstream_unauthorized'], [403, 'upstream_unauthorized'],
    [404, 'upstream_not_found'], [429, 'upstream_rate_limited'],
    [500, 'upstream_failure'], [sensitiveText, 'upstream_failure'],
  ]) {
    const result = await execute({ fetchError: Object.assign(hostileError(), { status }) });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(result.response.status, 500);
    assert.equal(diagnostic.stage, 'event_lookup');
    assert.equal(diagnostic.reason, reason);
    assert.equal(diagnostic.eventVerified, false);
    assert.equal(diagnostic.paymentState, 'none');
  }
});

test('verified but unsupported or malformed resources remain bounded and never invoke the transaction', async () => {
  for (const [options, reason, status] of [
    [{ event: { type: 'refund.creation.succeeded' } }, 'refund_requires_review', 501],
    [{ event: { data: { object: 'refund', id: 'ref_test_fixture123' } } }, 'refund_requires_review', 501],
    [{ event: { type: sensitiveText } }, 'event_ignored', 200],
    [{ resource: '{}' }, 'missing_resource', 400],
  ]) {
    const result = await execute(options);
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(result.response.status, status);
    assert.equal(diagnostic.stage, 'resource');
    assert.equal(diagnostic.reason, reason);
    assert.equal(diagnostic.eventVerified, true);
    assert.equal(diagnostic.transactionAttempted, false);
    assert.equal(diagnostic.paymentState, 'unknown');
    assert.equal(diagnostic.duplicate, false);
  }
});

test('known database codes and exact local validation messages become enum reasons without raw details', async () => {
  for (const [error, reason] of [
    [{ code: 'PGRST202', message: sensitiveText }, 'rpc_missing'],
    [{ code: '42883', message: sensitiveText }, 'rpc_missing'],
    [{ code: '42501', message: sensitiveText }, 'rpc_permission_denied'],
    [{ message: 'Payment amount or currency mismatch' }, 'amount_currency_mismatch'],
    [{ message: 'Payment order not found' }, 'order_missing'],
    [{ message: 'Charge source does not match the claimed attempt' }, 'source_mismatch'],
    [{ message: 'Payment attempt not found' }, 'payment_attempt_missing'],
    [{ message: 'Legacy payment requires manual reconciliation' }, 'legacy_requires_review'],
    [{ message: 'Alternative payment orders require manual reconciliation' }, 'legacy_requires_review'],
    [{ message: `Payment amount or currency mismatch ${sensitiveText}`, code: sensitiveText }, 'rpc_failure'],
  ]) {
    const result = await execute({ error: { ...error, details: sensitiveText, hint: sensitiveText } });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(result.response.status, 500);
    assert.equal(diagnostic.stage, 'transaction');
    assert.equal(diagnostic.reason, reason);
    assert.equal(diagnostic.eventVerified, true);
    assert.equal(diagnostic.transactionAttempted, true);
    assert.equal(diagnostic.paymentState, 'unknown');
  }
});

test('every handled result logs one bounded diagnostic without changing its response or RPC behavior', async () => {
  for (const [options, expectedStatus, expectedCalls] of [
    [{ enabled: false }, 503, 0],
    [{ event: { id: 'different' } }, 500, 0],
    [{ event: { type: 'refund.creation.succeeded' } }, 501, 0],
    [{ event: { type: 'fixture.ignored' } }, 200, 0],
    [{ event: { type: sensitiveText } }, 200, 0],
    [{ resource: '{}' }, 400, 0],
    [{ data: null }, 500, 1],
    [{ data: [] }, 500, 1],
    [{ data: { duplicate: true } }, 200, 1],
    [{ data: { status: 'paid' } }, 200, 1],
    [{ data: { status: 'failed' } }, 200, 1],
    [{ data: { status: 'expired' } }, 200, 1],
    [{ data: { status: 'pending' } }, 200, 1],
    [{ data: { status: sensitiveText } }, 200, 1],
  ]) {
    const result = await execute(options);
    assert.equal(result.response.status, expectedStatus);
    assert.equal(result.calls.length, expectedCalls);
    assertOneSafeDiagnostic(result);
  }
});

test('webhook diagnostics remain local and add no notification or extra write mechanism', () => {
  assert.doesNotMatch(source, /monitoring-alerts|\blogError\s*\(|\bfetch\s*\(|\.from\s*\(|\.insert\s*\(|\.update\s*\(/);
});
