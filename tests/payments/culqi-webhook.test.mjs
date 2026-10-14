import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';
const source = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse', 'fetchCulqiEvent', 'isCulqiRequestAllowed', 'createSupabaseAdminClient', 'parseCulqiEventResource', 'verifyCulqiEventIdentity', `${body}; return POST;`);
const id = 'evt_test_12345678';
async function execute({ event = {}, resource = { id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN' }, error = null, data = { status: 'paid' }, enabled = true, receivedType = 'charge.creation.succeeded' } = {}) {
  const calls = [], fetchCalls = [], clientCalls = [];
  const post = load({ json: (payload, init = {}) => ({ payload, status: init.status ?? 200 }) }, async (eventId) => {
    fetchCalls.push(eventId);
    return { id, type: 'charge.creation.succeeded', data: resource, ...event };
  }, () => enabled, () => {
    clientCalls.push('createSupabaseAdminClient');
    return { rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } };
  }, parseCulqiEventResource, verifyCulqiEventIdentity);
  const response = await post(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ id, type: receivedType }) }));
  return { response, calls, fetchCalls, clientCalls };
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
