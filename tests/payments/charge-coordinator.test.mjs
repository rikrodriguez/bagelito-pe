import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateCulqiCharge } from '../../src/lib/payments/charge-coordinator.ts';

// This fixture models the RPC contract; it does NOT execute PostgreSQL locks.
function database() {
  const row = { state: 'idle', attempt: null, source: null, device: null };
  let calls = 0;
  return { row, async rpc(name, args) {
    if (name === 'claim_culqi_charge') {
      if (row.state === 'requires_3ds') {
        if (!args.p_has_3ds || row.source !== args.p_source_id || row.device !== args.p_device_id)
          return { data: { claimed: false, state: row.state }, error: null };
      } else if (row.state !== 'idle' || args.p_has_3ds) {
        return { data: { claimed: false, state: row.state }, error: null };
      }
      row.state = 'submitting'; row.attempt = `claim-${++calls}`;
      row.source = args.p_source_id; row.device = args.p_device_id;
      return { data: { claimed: true, state: row.state, attempt_id: row.attempt }, error: null };
    }
    assert.equal(name, 'finish_culqi_charge');
    assert.equal(args.p_attempt_id, row.attempt);
    if (row.state === 'submitting') row.state = args.p_state;
    return { data: { state: row.state }, error: null };
  }};
}
const base = { orderId: 'order-1', orderCode: 'BAG-1', sourceId: 'tkn_test_12345678', deviceId: 'device123', has3DS: false };
const success = { requires3DS: false, charge: { id: 'chr_test_12345678', amount: 6800 } };

test('20 concurrent requests produce only one provider charge call', async () => {
  const db = database(); let calls = 0;
  let release; const gate = new Promise(resolve => { release = resolve; });
  const createCharge = async () => { calls++; await gate; return success; };
  const requests = Array.from({ length: 20 }, (_, i) => coordinateCulqiCharge({ ...base, sourceId: `tkn_test_token${i}12345678`, db, createCharge }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); release();
  const results = await Promise.all(requests);
  assert.ok(results.every(r => r.paymentStatus === 'awaiting_webhook'));
  assert.equal(db.row.state, 'submitted');
});

test('timeout leaves a closed uncertain attempt and cannot re-charge', async () => {
  const db = database(); let calls = 0;
  const createCharge = async () => { calls++; throw new Error('timeout after request was sent'); };
  const result = await coordinateCulqiCharge({ ...base, db, createCharge });
  assert.equal(result.paymentStatus, 'reconciliation_required');
  assert.equal(db.row.state, 'uncertain');
  await coordinateCulqiCharge({ ...base, db, sourceId: 'tkn_test_different', createCharge });
  assert.equal(calls, 1);
});

test('missing migration prevents calling Culqi', async () => {
  let calls = 0;
  await assert.rejects(() => coordinateCulqiCharge({ ...base, db: { rpc: async () => ({ data: null, error: { message: 'function does not exist' } }) }, createCharge: async () => { calls++; return success; } }));
  assert.equal(calls, 0);
});

test('3DS continuation requires matching source and fingerprint and runs once', async () => {
  const db = database(); let calls = 0;
  const review = async () => { calls++; return { requires3DS: true, response: { action_code: 'REVIEW', amount: 6800 } }; };
  assert.equal((await coordinateCulqiCharge({ ...base, db, createCharge: review })).requires3DS, true);
  const charge = async () => { calls++; return success; };
  await coordinateCulqiCharge({ ...base, db, has3DS: true, sourceId: 'tkn_test_other123', createCharge: charge });
  await coordinateCulqiCharge({ ...base, db, has3DS: true, deviceId: 'different', createCharge: charge });
  assert.equal(calls, 1);
  const results = await Promise.all(Array.from({ length: 10 }, () => coordinateCulqiCharge({ ...base, db, has3DS: true, createCharge: charge })));
  assert.equal(calls, 2);
  assert.ok(results.every(r => r.paymentStatus === 'awaiting_webhook'));
});

test('a repeated 3DS action after authentication closes the attempt and prevents a third provider call', async () => {
  const db = database(); let calls = 0;
  const review = async () => {
    calls++;
    return { requires3DS: true, response: { action_code: 'REVIEW', amount: 6800 } };
  };
  assert.equal((await coordinateCulqiCharge({ ...base, db, createCharge: review })).requires3DS, true);
  const continuation = await coordinateCulqiCharge({ ...base, db, has3DS: true, createCharge: review });
  assert.equal(continuation.paymentStatus, 'reconciliation_required');
  assert.equal(continuation.ok, false);
  assert.equal(db.row.state, 'uncertain');
  const replay = await coordinateCulqiCharge({ ...base, db, has3DS: true, createCharge: review });
  assert.equal(replay.paymentStatus, 'reconciliation_required');
  assert.equal(db.row.state, 'uncertain');
  assert.equal(calls, 2, 'a repeated action must not reopen authenticated charge submission');
});

test('post-charge database failure never triggers a second provider call', async () => {
  const db = database(); const original = db.rpc; let calls = 0;
  db.rpc = async (name, args) => name === 'finish_culqi_charge' ? { data: null, error: { message: 'database unavailable' } } : original(name, args);
  const createCharge = async () => { calls++; return success; };
  const first = await coordinateCulqiCharge({ ...base, db, createCharge });
  assert.equal(first.paymentStatus, 'reconciliation_required');
  await coordinateCulqiCharge({ ...base, db, createCharge });
  assert.equal(calls, 1);
  assert.equal(db.row.state, 'submitting');
});
