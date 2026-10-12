import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';
const source = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse', 'fetchCulqiEvent', 'getPaymentConfig', 'createSupabaseAdminClient', 'parseCulqiEventResource', 'verifyCulqiEventIdentity', `${body}; return POST;`);
const id = 'evt_test_12345678';
async function execute({ event = {}, resource = { id: 'chr_test_12345678', amount: 6800, currency_code: 'PEN' }, error = null, data = { status: 'paid' }, enabled = true } = {}) {
  const calls = [];
  const post = load({ json: (payload, init = {}) => ({ payload, status: init.status ?? 200 }) }, async () => ({ id, type: 'charge.creation.succeeded', data: resource, ...event }), () => ({ enabled }), () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } }), parseCulqiEventResource, verifyCulqiEventIdentity);
  const response = await post(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ id, type: 'charge.creation.succeeded' }) }));
  return { response, calls };
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
test('disabled provider makes no transaction call', async () => {
  const { response, calls } = await execute({ enabled: false });
  assert.equal(response.status, 503); assert.equal(calls.length, 0);
});
