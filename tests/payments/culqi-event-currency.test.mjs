import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerifiedCulqiChargeCurrency as complete } from '../../src/lib/payments/culqi-event-currency-evidence.ts';

const event = { object: 'charge', id: 'chr_test_ABCDEFGHIJKLMNOP', amount: 5800,
  source: { id: 'tkn_test_ABCDEFGHIJKLMNOP' }, metadata: { bagelito_order_code: 'BAG-000013' } };
const captured = { ...event, currency_code: 'PEN', capture: true, paid: false,
  current_amount: 5800, amount_refunded: 0, dispute: false };

test('authenticated capture independently completes missing currency only', async () => {
  const got = [];
  const result = await complete('charge.creation.succeeded', event,
    async id => { got.push(id); return captured; });
  assert.deepEqual(got, [event.id]);
  assert.deepEqual(result, { ...event, currency_code: 'PEN' });
  assert.equal(Object.hasOwn(event, 'currency_code'), false);
});

test('explicit currency cannot be replaced or trigger charge GET', async () => {
  for (const res of [
    { ...event, currency_code: 'USD' }, { ...event, currency: 'USD' },
    { ...event, currency_code: null }, { ...event, currency_code: 'PEN' },
  ]) {
    assert.strictEqual(await complete('charge.creation.succeeded', res,
      async () => { throw new Error('No GET permitted'); }), res);
  }
});

test('no currency enrichment on failed, expired, refund or order events', async () => {
  for (const kind of ['charge.creation.failed', 'charge.expired',
    'order.status.changed', 'refund.creation.succeeded', 'unknown']) {
    assert.strictEqual(await complete(kind, event,
      async () => { throw new Error('No GET permitted'); }), event);
  }
});

test('refuses incorrect charge identity or adverse financial evidence', async () => {
  const cases = [
    { object: 'order' }, { id: 'chr_test_NOTTHESAME' }, { amount: 5801 },
    { currency_code: 'USD' }, { currency: 'USD' },
    { source: { id: 'tkn_test_BADSOURCE01' } },
    { metadata: { bagelito_order_code: 'BAG-OTHER' } },
    { capture: false }, { current_amount: 5799 }, { amount_refunded: 1 },
    { dispute: true }, { current_amount: undefined },
    { amount_refunded: null }, { dispute: undefined },
  ];
  for (const patch of cases) {
    await assert.rejects(complete('charge.creation.succeeded', event,
      async () => ({ ...captured, ...patch })), /evidence is incomplete or inconsistent/);
  }
});

test('invalid event fields fail before provider fetch', async () => {
  for (const patch of [
    { id: 'chr_test_bad' }, { amount: -1 },
    { source: { id: 'ype_live_wrong1234' } }, { source: null },
    { metadata: null }, { metadata: { bagelito_order_code: 'bad' } },
  ]) {
    let called = false;
    await assert.rejects(complete('charge.creation.succeeded', { ...event, ...patch },
      async () => { called = true; return captured; }));
    assert.equal(called, false);
  }
});

test('live-mode event also requires matching live source and verified capture', async () => {
  const e = { ...event, id: 'chr_live_ABCDEFGHIJKLMNOP',
    source: { id: 'tkn_live_ABCDEFGHIJKLMNOP' } };
  const res = await complete('charge.creation.succeeded', e, async id => {
    assert.equal(id, e.id);
    return { ...captured, id, source: e.source };
  });
  assert.equal(res.currency_code, 'PEN');
});

test('network errors never produce an inferred payment currency', async () => {
  await assert.rejects(complete('charge.creation.succeeded', event,
    async () => { throw new Error('Provider unavailable'); }));
});
