import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const webhook=await readFile(new URL("../supabase/functions/instagram-webhook/index.ts",import.meta.url),"utf8");
const enrich=await readFile(new URL("../supabase/functions/instagram-sales-enrich/index.ts",import.meta.url),"utf8");

test("writer sees trusted customer memory before drafting",()=>{
  assert.match(webhook,/get_instagram_customer_memory/);
  assert.match(webhook,/CUSTOMER_MEMORY/);
  assert.match(webhook,/explicit repeat reference/i);
});

test("sales enrichment also sees trusted memory",()=>{
  assert.match(enrich,/get_instagram_customer_memory/);
  assert.match(enrich,/CUSTOMER_MEMORY/);
  assert.match(enrich,/same as last time|lo mismo|otro pedido/i);
});
