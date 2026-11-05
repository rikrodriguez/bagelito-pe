import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-sales-enrich/index.ts", import.meta.url),
  "utf8",
);

test("sales enrichment reuses webhook preflight instead of reclassifying normally", () => {
  assert.match(source, /preflight_extraction/);
  assert.match(source, /preflight_sales/);
  assert.match(source, /const hasReusablePreflight =/);
  assert.match(source, /hasReusablePreflight[\s\S]*preflightExtraction[\s\S]*callOpenAI/);
});

test("preflight projected stage/action are preserved into enrichment extraction", () => {
  assert.match(source, /sales_stage: preflightSales\.stage/);
  assert.match(source, /next_best_action: preflightSales\.action/);
  assert.match(source, /buyer_signal: preflightSales\.buyerSignal/);
});
