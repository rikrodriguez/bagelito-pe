import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';
const source = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse', 'fetchCulqiEvent', 'isCulqiRequestAllowed', 'createSupabaseAdminClient', 'parseCulqiEventResource', 'verifyCulqiEventIdentity', 'console', 'randomUUID', `${body}; return POST;`);
const id = 'evt_test_12345678';
async function execute({
  event = {}, resource = { id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN' },
  error = null, data = { status: 'paid' }, enabled = true, receivedType = 'charge.creation.succeeded',
  requestBody = JSON.stringify({ id, type: receivedType }), requestHeaders = {},
  fetchError = null, clientError = null, rpcError = null, rpcImplementation = null,
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
      if (rpcImplementation) return rpcImplementation(name, args);
      return { data, error };
    } };
  }, parseCulqiEventResource, verifyCulqiEventIdentity, {
    info: (...args) => logs.push({ level: 'info', args }),
    warn: (...args) => logs.push({ level: 'warn', args }),
    error: () => assert.fail('Webhook must not log raw errors'),
    log: () => assert.fail('Webhook must use its bounded diagnostic logger'),
  }, randomUUID);
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
const diagnosticEventPaymentStates = new Set(['none', 'unknown', 'paid', 'pending', 'failed', 'expired']);
const diagnosticUpstreamFailureClasses = new Set(['none', 'http', 'timeout', 'transport_or_unknown']);
const diagnosticUpstreamErrorTypes = new Set(['none', 'unknown', 'invalid_request_error', 'authentication_error',
  'parameter_error', 'card_error', 'limit_api_error', 'resource_error', 'api_error']);
function assertOneSafeDiagnostic(result) {
  assert.equal(result.logs.length, 1, 'Every handled webhook must produce one bounded diagnostic');
  const [{ level, args }] = result.logs;
  assert.equal(level, 'info');
  assert.equal(args.length, 2, 'Diagnostic consists only of a constant label and a bounded object');
  assert.equal(args[0], 'culqi_webhook_diagnostic');
  assert.ok(args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]));
  assert.deepEqual(Object.keys(args[1]).sort(), [
    'stage', 'reason', 'httpStatus', 'eventVerified', 'transactionAttempted', 'eventPaymentState', 'duplicate',
    'upstreamHttpStatus', 'upstreamFailureClass', 'upstreamErrorType', 'eventModeMatchesConfig',
    'diagnosticVersion', 'invocationId', 'buildCommit', 'buildSourceDigest', 'buildSourceMatchesCommit',
    'requestParse', 'bodyKind', 'bodyObject', 'bodyIdKind', 'bodyHasData', 'bodyDataKind',
    'bodyHasCamelFields', 'bodyHasSnakeFields', 'lookupResource', 'lookupIdKind', 'lookupState',
  ].sort(), 'No dynamic field may be added to the private diagnostic');
  assert.ok(diagnosticStages.has(args[1].stage), 'Stage must be a fixed local enum');
  assert.ok(diagnosticReasons.has(args[1].reason), 'Reason must be a fixed local enum');
  assert.ok(diagnosticEventPaymentStates.has(args[1].eventPaymentState), 'Payment state must be normalized to a fixed enum');
  assert.ok(diagnosticUpstreamFailureClasses.has(args[1].upstreamFailureClass), 'Upstream failure class must be a fixed local enum');
  assert.ok(diagnosticUpstreamErrorTypes.has(args[1].upstreamErrorType), 'Provider error type must be a fixed local enum');
  assert.ok(args[1].eventModeMatchesConfig === null || typeof args[1].eventModeMatchesConfig === 'boolean',
    'Event/configured environment agreement is only a boolean or null');
  assert.ok(args[1].upstreamHttpStatus === null || (Number.isInteger(args[1].upstreamHttpStatus)
    && args[1].upstreamHttpStatus >= 100 && args[1].upstreamHttpStatus <= 599), 'Upstream HTTP status must be a bounded integer or null');
  assert.equal(args[1].upstreamFailureClass === 'http', args[1].upstreamHttpStatus !== null);
  if (args[1].stage !== 'event_lookup') {
    assert.equal(args[1].upstreamHttpStatus, null, 'Other stages cannot claim a provider HTTP status');
    assert.equal(args[1].upstreamFailureClass, 'none', 'Successful lookup or other stages cannot claim an upstream failure');
    assert.equal(args[1].upstreamErrorType, 'none', 'Other stages cannot claim a provider error type');
    assert.equal(args[1].eventModeMatchesConfig, null, 'Other stages cannot claim event/configured environment agreement');
  }
  assert.equal(args[1].httpStatus, result.response.status);
  assert.equal(typeof args[1].eventVerified, 'boolean');
  assert.equal(typeof args[1].transactionAttempted, 'boolean');
  assert.equal(typeof args[1].duplicate, 'boolean');
  assert.equal(args[1].diagnosticVersion, 2);
  assert.match(args[1].invocationId, /^[a-f0-9-]{36}$/);
  assert.ok(['not_read', 'read_or_parse_failed', 'parsed'].includes(args[1].requestParse));
  assert.ok(['not_read', 'object', 'null', 'array', 'other'].includes(args[1].bodyKind));
  assert.ok(['not_read', 'missing', 'charge', 'event', 'other'].includes(args[1].bodyObject));
  assert.ok(['not_read', 'missing', 'chr', 'evt', 'other'].includes(args[1].bodyIdKind));
  assert.ok(['not_read', 'missing', 'object', 'array', 'null', 'string', 'other'].includes(args[1].bodyDataKind));
  assert.ok(['none', 'events'].includes(args[1].lookupResource));
  assert.ok(['none', 'evt'].includes(args[1].lookupIdKind));
  assert.ok(['not_attempted', 'started', 'returned', 'failed'].includes(args[1].lookupState));
  for (const key of ['bodyHasData', 'bodyHasCamelFields', 'bodyHasSnakeFields']) assert.equal(typeof args[1][key], 'boolean');
  assert.equal(args[1].transactionAttempted, result.calls.length > 0, 'Transaction flag describes an actual mocked RPC invocation');
  for (const [key, value] of Object.entries(args[1])) {
    assert.ok((['upstreamHttpStatus', 'eventModeMatchesConfig', 'buildCommit', 'buildSourceDigest', 'buildSourceMatchesCommit'].includes(key) && value === null) || ['string', 'number', 'boolean'].includes(typeof value),
      'No error, payload, header or nested object may enter logs');
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
  const withoutCorrelation = (logs) => logs.map(({ level, args: [label, diagnostic] }) => ({ level, args: [label, { ...diagnostic, invocationId: null }] }));
  assert.deepEqual(withoutCorrelation(result.logs), withoutCorrelation(baseline.logs), 'Private request, event and RPC fields cannot alter the diagnostic');
});

test('diagnostics report verified event outcomes and normalize unknown or forged states', async () => {
  for (const [data, eventPaymentState, duplicate, reason] of [
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
    assert.equal(diagnostic.eventPaymentState, eventPaymentState);
    assert.equal(diagnostic.duplicate, duplicate);
    assert.equal(diagnostic.reason, reason);
  }
});

test('a late failed event reports its event outcome while the effective paid order remains unchanged', async () => {
  const effectiveOrder = { payment_status: 'paid', order_status: 'payment_confirmed' };
  const result = await execute({
    event: { type: 'charge.creation.failed' },
    rpcImplementation: async (name, args) => {
      assert.equal(name, 'apply_culqi_payment_event');
      assert.equal(args.p_event_type, 'charge.creation.failed');
      assert.equal(effectiveOrder.payment_status, 'paid');
      // Model the installed RPC's protected late-event behavior: its result is
      // the event's failed outcome, while the paid order is not downgraded.
      return { data: { status: 'failed' }, error: null };
    },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.response.payload, { ok: true, status: 'failed' });
  assert.deepEqual(effectiveOrder, { payment_status: 'paid', order_status: 'payment_confirmed' });
  assert.equal(result.calls.length, 1);
  const diagnostic = assertOneSafeDiagnostic(result);
  assert.equal(diagnostic.eventPaymentState, 'failed');
  assert.equal(Object.hasOwn(diagnostic, 'paymentState'), false);
  assert.equal(diagnostic.reason, 'applied');
  assert.equal(diagnostic.eventVerified, true);
  assert.equal(diagnostic.transactionAttempted, true);
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
    assert.equal(diagnostic.eventPaymentState, 'none');
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
    assert.equal(diagnostic.eventPaymentState, 'none');
  }
});

test('lookup diagnostics distinguish the observed HTTP 400, HTTP 500 and transport failures', async () => {
  for (const [fetchError, upstreamHttpStatus, upstreamFailureClass] of [
    [Object.assign(hostileError(), { status: 400 }), 400, 'http'],
    [Object.assign(hostileError(), { status: 500 }), 500, 'http'],
    [new TypeError(sensitiveText), null, 'transport_or_unknown'],
  ]) {
    const result = await execute({ fetchError });
    assert.equal(result.logs[0].args[1].reason, 'upstream_failure', 'The existing failure reason is preserved');
    assert.equal(result.logs[0].args[1].upstreamHttpStatus, upstreamHttpStatus);
    assert.equal(result.logs[0].args[1].upstreamFailureClass, upstreamFailureClass);
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.eventVerified, false);
    assert.equal(diagnostic.transactionAttempted, false);
    assert.deepEqual(result.clientCalls, []);
    assert.deepEqual(result.calls, []);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.response.payload, { ok: false, error: 'Could not process Culqi webhook.' });
  }
});

test('lookup error types are fixed labels and never read raw upstream error fields', async () => {
  const knownTypes = [...diagnosticUpstreamErrorTypes].filter((type) => !['none', 'unknown'].includes(type));
  for (const errorType of [...knownTypes, 'unknown', 'none', sensitiveText, 'parameter_error ',
    undefined, null, ['parameter_error'], { secret: sensitiveText }, Symbol(sensitiveText)]) {
    let paramReads = 0, payloadReads = 0, codeReads = 0;
    const fetchError = Object.assign(hostileError(), { status: 400, errorType });
    Object.defineProperties(fetchError, {
      param: { get() { paramReads++; throw new Error(sensitiveText); } },
      payload: { get() { payloadReads++; throw new Error(sensitiveText); } },
      code: { get() { codeReads++; throw new Error(sensitiveText); } },
    });
    const result = await execute({ fetchError });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.upstreamErrorType, knownTypes.includes(errorType) ? errorType : 'unknown');
    assert.equal(diagnostic.upstreamHttpStatus, 400);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.clientCalls, []);
    assert.deepEqual(result.calls, []);
    assert.equal(paramReads + payloadReads + codeReads, 0);
  }
  let typeReads = 0;
  const fetchError = Object.assign(hostileError(), { status: 400 });
  Object.defineProperty(fetchError, 'errorType', { get() { typeReads++; throw new Error(sensitiveText); } });
  const result = await execute({ fetchError });
  assert.equal(assertOneSafeDiagnostic(result).upstreamErrorType, 'unknown');
  assert.equal(typeReads, 1);
  assert.equal(result.response.status, 500);
});

test('event mode diagnostics normalize hostile fields without exposing IDs or changing lookup rejection', async () => {
  for (const eventModeMatchesConfig of [true, false, undefined, null, 'true', 'false', sensitiveText,
    { id, private: sensitiveText }, [true], 1, 0, Symbol(sensitiveText)]) {
    const result = await execute({ fetchError: Object.assign(hostileError(), { status: 400, eventModeMatchesConfig }) });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.eventModeMatchesConfig,
      typeof eventModeMatchesConfig === 'boolean' ? eventModeMatchesConfig : null);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.clientCalls, []);
    assert.deepEqual(result.calls, []);
  }
  let modeReads = 0;
  const fetchError = Object.assign(hostileError(), { status: 400 });
  Object.defineProperty(fetchError, 'eventModeMatchesConfig', { get() { modeReads++; throw new Error(sensitiveText); } });
  const result = await execute({ fetchError });
  assert.equal(assertOneSafeDiagnostic(result).eventModeMatchesConfig, null);
  assert.equal(modeReads, 1);
  const transportResult = await execute({ fetchError: Object.assign(hostileError(), { eventModeMatchesConfig: true }) });
  assert.equal(assertOneSafeDiagnostic(transportResult).eventModeMatchesConfig, null,
    'A transport error cannot claim context from a provider HTTP response');
});

test('lookup diagnostics accept only numeric integer upstream HTTP statuses from 100 through 599', async () => {
  for (const status of [100, 400, 500, 599]) {
    const result = await execute({ fetchError: Object.assign(hostileError(), { status, name: sensitiveText }) });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.upstreamHttpStatus, status);
    assert.equal(diagnostic.upstreamFailureClass, 'http');
    assert.equal(result.response.status, 500);
  }
  for (const status of [99, 600, -1, 400.5, NaN, Infinity, -Infinity, null, undefined,
    '400', sensitiveText, { private: sensitiveText }, [500], true, 500n, Symbol(sensitiveText)]) {
    const result = await execute({ fetchError: Object.assign(hostileError(), { status, name: sensitiveText }) });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.upstreamHttpStatus, null);
    assert.equal(diagnostic.upstreamFailureClass, 'transport_or_unknown');
    assert.equal(diagnostic.reason, 'upstream_failure');
    assert.equal(result.response.status, 500);
  }
});

test('lookup timeout labels never serialize untrusted names or nested causes', async () => {
  for (const [name, upstreamFailureClass] of [
    ['TimeoutError', 'timeout'],
    ['AbortError', 'transport_or_unknown'],
    ['TypeError', 'transport_or_unknown'],
    [sensitiveText, 'transport_or_unknown'],
    [{ private: sensitiveText }, 'transport_or_unknown'],
  ]) {
    let causeReads = 0;
    const fetchError = Object.assign(hostileError(), { name });
    Object.defineProperty(fetchError, 'cause', { get() { causeReads++; throw new Error(sensitiveText); } });
    const result = await execute({ fetchError });
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.equal(diagnostic.upstreamHttpStatus, null);
    assert.equal(diagnostic.upstreamFailureClass, upstreamFailureClass);
    assert.equal(diagnostic.reason, 'upstream_failure');
    assert.equal(causeReads, 0, 'Nested causes must not be inspected');
    assert.equal(JSON.stringify(result.logs).includes('TimeoutError'), false, 'Raw error names must not enter logs');
  }
  const result = await execute({ fetchError: Object.assign(hostileError(), { status: 504, name: 'TimeoutError' }) });
  const diagnostic = assertOneSafeDiagnostic(result);
  assert.equal(diagnostic.upstreamHttpStatus, 504);
  assert.equal(diagnostic.upstreamFailureClass, 'http', 'An HTTP response takes precedence over an error name');
});

test('hostile upstream status and name accessors cannot throw or add raw diagnostics', async () => {
  let statusReads = 0, nameReads = 0, causeReads = 0;
  const fetchError = hostileError();
  Object.defineProperties(fetchError, {
    status: { get() { statusReads++; throw new Error(sensitiveText); } },
    name: { get() { nameReads++; throw new Error(sensitiveText); } },
    cause: { get() { causeReads++; throw new Error(sensitiveText); } },
  });
  const result = await execute({ fetchError });
  const diagnostic = assertOneSafeDiagnostic(result);
  assert.equal(diagnostic.upstreamHttpStatus, null);
  assert.equal(diagnostic.upstreamFailureClass, 'transport_or_unknown');
  assert.equal(diagnostic.reason, 'upstream_failure');
  assert.equal(statusReads, 1, 'Read an upstream error status at most once');
  assert.equal(nameReads, 1);
  assert.equal(causeReads, 0);
  assert.equal(result.response.status, 500);
  assert.deepEqual(result.response.payload, { ok: false, error: 'Could not process Culqi webhook.' });
});

test('successful lookup and failures at other stages never claim an upstream HTTP status or failure', async () => {
  const hostileFields = { status: 500, name: 'TimeoutError', cause: { private: sensitiveText } };
  for (const options of [
    {}, { data: { duplicate: true } }, { enabled: false }, { requestBody: '{' },
    { event: { id: 'different', ...hostileFields } }, { resource: '{}' },
    { event: { type: 'fixture.ignored', ...hostileFields } },
    { clientError: Object.assign(hostileError(), hostileFields) },
    { rpcError: Object.assign(hostileError(), hostileFields) },
    { error: hostileFields },
  ]) {
    const result = await execute(options);
    const diagnostic = assertOneSafeDiagnostic(result);
    assert.notEqual(diagnostic.stage, 'event_lookup');
    assert.equal(diagnostic.upstreamHttpStatus, null);
    assert.equal(diagnostic.upstreamFailureClass, 'none');
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
    assert.equal(diagnostic.eventPaymentState, 'unknown');
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
    assert.equal(diagnostic.eventPaymentState, 'unknown');
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
