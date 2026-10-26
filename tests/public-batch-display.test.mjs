import test from "node:test";
import assert from "node:assert/strict";
import { getPublicBatchDisplay } from "../src/lib/public-batch-display.ts";

const today = Date.parse("2026-10-26T12:00:00Z");
function batch(extra = {}) {
  return {
    accepting: false, status: "orders_closed",
    ordersOpenAt: "2026-08-01T00:00:00Z",
    deliveryDate: "2026-10-22T15:00:00Z",
    ...extra,
  };
}

test("past closed batch hides stale dates and opening", () => {
  assert.deepEqual(getPublicBatchDisplay(batch(), today), {
    nextOpeningAt: null, showFutureDelivery: false,
  });
});

test("first server render hides closed-batch dates", () => {
  assert.deepEqual(getPublicBatchDisplay(batch({
    status: "waitlist_open", ordersOpenAt: "2026-11-02T14:00:00Z",
    deliveryDate: "2026-12-02T14:00:00Z",
  }), 0), { nextOpeningAt: null, showFutureDelivery: false });
});

test("only future dates in a waitlist state appear as next order opening", () => {
  const future = "2026-11-02T14:00:00Z";
  assert.equal(getPublicBatchDisplay(batch({
    status: "waitlist_open", ordersOpenAt: future,
  }), today).nextOpeningAt, future);
  assert.equal(getPublicBatchDisplay(batch({ ordersOpenAt: future }), today).nextOpeningAt, null);
});

test("future deliveries remain visible only before being delivered", () => {
  const future = "2026-11-30T16:00:00Z";
  assert.equal(getPublicBatchDisplay(batch({ deliveryDate: future }), today).showFutureDelivery, true);
  assert.equal(getPublicBatchDisplay(batch({
    status: "delivered", deliveryDate: future,
  }), today).showFutureDelivery, false);
});

test("open orders never display as a closed historical batch", () => {
  assert.deepEqual(getPublicBatchDisplay(batch({
    accepting: true, status: "orders_open", deliveryDate: "2026-11-30T16:00:00Z",
  }), today), { nextOpeningAt: null, showFutureDelivery: false });
});

test("missing, malformed, elapsed or nonfinite timestamps fail closed", () => {
  for(const deliveryDate of [null, "", "not a date", "2026-10-25T00:00:00Z"]) {
    assert.equal(getPublicBatchDisplay(batch({ deliveryDate }), today).showFutureDelivery, false);
  }
  assert.equal(getPublicBatchDisplay(batch({
    status: "waitlist_open", ordersOpenAt: "not a date",
  }), today).nextOpeningAt, null);
  assert.equal(getPublicBatchDisplay(batch({
    status: "waitlist_open", ordersOpenAt: "2026-11-02T00:00:00Z",
  }), Number.NaN).nextOpeningAt, null);
});
