import test from 'node:test';
import assert from 'node:assert/strict';
import {isBatchAcceptingOrders} from '../src/lib/batch-availability.ts';
const now=Date.parse('2026-10-02T15:00:00Z');
test('a scheduled opening is enforced before the cutoff',()=> {
 assert.equal(isBatchAcceptingOrders('orders_open','2026-10-10T00:00:00Z',now,'2026-10-03T00:00:00Z'),false);
});
test('open window accepts at opening and rejects at cutoff',()=> {
 assert.equal(isBatchAcceptingOrders('orders_open','2026-10-10T00:00:00Z',now,'2026-10-02T15:00:00Z'),true);
 assert.equal(isBatchAcceptingOrders('orders_open','2026-10-02T15:00:00Z',now,null),false);
});
