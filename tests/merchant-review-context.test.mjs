import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const batch = { accepting: true, batchName: "Synthetic review batch", status: "orders_open", reservedPacks: 0, reservedBagels: 0 };
function provider(liveBatch = batch) {
  return loadTs("src/components/BatchAvailabilityProvider.tsx", {
    "@/lib/reservations/use-live-batch-availability": { useLiveBatchAvailability: () => liveBatch },
  }).BatchAvailabilityProvider;
}

test("the explicit server review flag accompanies live batch data without changing availability", () => {
  const value = provider()({ children: null, initialBatch: batch, merchantReviewOnly: true }).props.value;
  assert.equal(value.merchantReviewOnly, true);
  assert.equal(value.accepting, true);
  assert.equal(value.batchName, batch.batchName);
});

test("live refresh data cannot replace the server's display-mode flag", () => {
  const value = provider({ ...batch, merchantReviewOnly: false })({ children: null, initialBatch: batch, merchantReviewOnly: true }).props.value;
  assert.equal(value.merchantReviewOnly, true);
});

test("ordinary batches default to the existing sales display", () => {
  const value = provider()({ children: null, initialBatch: batch }).props.value;
  assert.equal(value.merchantReviewOnly, false);
  assert.equal(value.accepting, true);
});
