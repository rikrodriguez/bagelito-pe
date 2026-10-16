import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCulqiEventIdentity, verifyCulqiPaymentAmount, nextCulqiOrderStatus } from '../../src/lib/payments/verification.ts';

test('accepts only the authenticated event identity and type', () => {
  assert.equal(verifyCulqiEventIdentity('evt_test_12345678', { id: 'evt_test_12345678', type: 'charge.creation.succeeded' }), 'charge.creation.succeeded');
  for (const event of [{}, { id: 'other', type: 'charge.creation.succeeded' }, { id: 'evt_test_12345678' }, { id: 'evt_test_12345678', type: '' }]) {
    assert.throws(() => verifyCulqiEventIdentity('evt_test_12345678', event));
  }
});

test('accepts the exact integer amount in PEN using either provider currency field', () => {
  assert.doesNotThrow(() => verifyCulqiPaymentAmount({ amount: 6800, currency_code: 'PEN' }, 6800));
  assert.doesNotThrow(() => verifyCulqiPaymentAmount({ amount: 6800, currency: 'PEN' }, 6800));
});

test('rejects missing, nonnumeric, fractional, wrong and unsafe amounts', () => {
  for (const amount of [undefined, null, '6800', 6799, 6800.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => verifyCulqiPaymentAmount({ amount, currency_code: 'PEN' }, 6800));
  }
  for (const expected of [0, -1, NaN, Infinity, 6800.5]) {
    assert.throws(() => verifyCulqiPaymentAmount({ amount: expected, currency_code: 'PEN' }, expected));
  }
});

test('rejects absent, mismatched and conflicting currencies', () => {
  for (const fields of [{}, { currency: 'USD' }, { currency_code: 'USD' }, { currency_code: 'PEN', currency: 'USD' }, { currency_code: 'USD', currency: 'PEN' }]) {
    assert.throws(() => verifyCulqiPaymentAmount({ amount: 6800, ...fields }, 6800));
  }
});

test('a repeated paid event preserves every fulfillment stage', () => {
  for (const status of ['payment_confirmed', 'in_production', 'ready_for_delivery', 'delivered']) {
    assert.equal(nextCulqiOrderStatus(status, 'paid'), status);
  }
});

test('initial payment confirmation and other transitions remain compatible', () => {
  assert.equal(nextCulqiOrderStatus('payment_pending_review', 'paid'), 'payment_confirmed');
  assert.equal(nextCulqiOrderStatus('payment_pending_review', 'failed'), 'needs_correction');
  assert.equal(nextCulqiOrderStatus('payment_pending_review', 'expired'), 'cancelled');
  assert.equal(nextCulqiOrderStatus('in_production', 'pending'), 'in_production');
});
