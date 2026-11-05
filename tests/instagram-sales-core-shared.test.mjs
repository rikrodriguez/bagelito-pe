import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-sales-enrich/index.ts", import.meta.url),
  "utf8",
);

test("async enrichment uses the same deterministic sales core as the webhook", () => {
  assert.match(source, /import \{ projectSalesState \} from "\.\.\/_shared\/instagram-sales-core\.ts"/);
  assert.match(source, /const projectedSales = projectSalesState/);
  assert.match(source, /const mergedItems = projectedSales\.projectedItems/);
  assert.match(source, /const mergedDraft = projectedSales\.projectedOrder/);
  assert.match(source, /const quote = projectedSales\.quote/);
  assert.match(source, /const handoffReason = projectedSales\.handoffReason/);
  assert.match(source, /const paymentStatus = projectedSales\.paymentStatus/);
});
