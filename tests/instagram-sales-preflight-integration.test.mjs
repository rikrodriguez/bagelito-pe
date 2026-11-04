import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const webhook = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);

test("Instagram reply generation is sales-state-first, not writer-first", () => {
  assert.match(webhook, /import \{ projectSalesState \} from "\.\.\/_shared\/instagram-sales-core\.ts"/);
  assert.match(webhook, /async function extractSalesTurn/);
  assert.match(webhook, /const salesExtraction = await extractSalesTurn/);
  assert.match(webhook, /const projectedSales = projectSalesState/);
  assert.match(webhook, /PROJECTED_SALES_STATE: projectedSales/);
});

test("writer intent and confidence come from preflight extraction", () => {
  assert.match(webhook, /const intent = salesExtraction\.intent/);
  assert.match(webhook, /const language = salesExtraction\.language/);
  assert.match(webhook, /const confidence = salesExtraction\.confidence/);
});

test("AUTO gate receives projected sales state", () => {
  assert.match(webhook, /currentOrder: projectedSales\.projectedOrder/);
  assert.match(webhook, /projectedSales/);
});
