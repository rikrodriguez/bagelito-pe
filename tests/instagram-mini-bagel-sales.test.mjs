import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const coreSource = await readFile(
  new URL("../supabase/functions/_shared/instagram-sales-core.ts", import.meta.url),
  "utf8",
);
const out = ts.transpileModule(coreSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dir = await mkdtemp(join(tmpdir(), "bagelito-mini-sales-"));
await writeFile(join(dir, "package.json"), '{"type":"module"}', "utf8");
await writeFile(join(dir, "core.js"), out, "utf8");
const core = await import(pathToFileURL(join(dir, "core.js")).href);

const facts = {
  packs: [
    { slug: "6-mixed", name: "6 mixed", units: 6, amount: 60, packType: "mixed" },
    { slug: "6-single", name: "6 single flavor", units: 6, amount: 50, packType: "single" },
  ],
  mini_bagel_packs: [
    { slug: "mini-6-mixed", name: "6 mini mixed", units: 6, amount: 25, packType: "mixed", bagelSize: "mini" },
    { slug: "mini-6-single", name: "6 mini single flavor", units: 6, amount: 20, packType: "single", bagelSize: "mini" },
  ],
  schmears: [],
  delivery_pricing: {
    rate_per_km: 3,
    minimum_fee: 8,
    long_distance_threshold: 15,
    long_distance_discount_rate: 0.3,
    district_distances_km: { Lince: 1.3 },
  },
};

function completeOrder(size) {
  return {
    currentOrder: {
      customer_name: "Test",
      phone: "999111222",
      district: "Lince",
      delivery_address: "Test address",
      bagel_size: size,
      payment_status: "none",
    },
    currentItems: [],
    extraction: {
      intent: "how_to_order",
      confidence: 0.99,
      customer_requested_human: false,
      conflicting_data: false,
      payment_evidence_claimed: false,
      order_patch: {
        bagel_size: size,
        pack_slug: null,
        pack_name: null,
        units: 6,
        customer_name: null,
        phone: null,
        email: null,
        district: null,
        address: null,
        address_reference: null,
        delivery_notes: null,
        requested_date: null,
        custom_request: null,
        items: [
          { key: "plain", name: "Plain", quantity: 3 },
          { key: "blueberry", name: "Blueberry", quantity: 3 },
        ],
        schmears: [],
      },
    },
    facts,
    latestMessage: size === "mini" ? "Quiero 6 minis, 3 Plain y 3 Blueberry" : "Quiero 6, 3 Plain y 3 Blueberry",
  };
}

test("mini bagels quote from the mini pack catalog, never regular pack prices", () => {
  const state = core.projectSalesState(completeOrder("mini"));
  assert.equal(state.projectedOrder.bagel_size, "mini");
  assert.equal(state.quote.pack.slug, "mini-6-mixed");
  assert.equal(state.quote.itemsSubtotal, 25);
  assert.equal(state.quote.total, 33);
});

test("regular bagels still quote from regular packs", () => {
  const state = core.projectSalesState(completeOrder("regular"));
  assert.equal(state.quote.pack.slug, "6-mixed");
  assert.equal(state.quote.itemsSubtotal, 60);
  assert.equal(state.quote.total, 68);
});

test("Instagram draft schema persists bagel size", async () => {
  const sql = await readFile(
    new URL("../supabase/add-instagram-bagel-size.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /add column if not exists bagel_size/);
  assert.match(sql, /'regular','mini'/);
  assert.match(sql, /instagram_production_by_flavor/);
  assert.match(sql, /bagel_size/);
});

test("webhook and enrichment extract mini vs regular before writing or quoting", async () => {
  const webhook = await readFile(
    new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
    "utf8",
  );
  const enrich = await readFile(
    new URL("../supabase/functions/instagram-sales-enrich/index.ts", import.meta.url),
    "utf8",
  );
  for (const source of [webhook, enrich]) {
    assert.match(source, /bagel_size/);
    assert.match(source, /mini_bagel_packs/);
  }
});


test("explicit mini wording overrides a null model size", () => {
  const input = completeOrder(null);
  input.latestMessage = "Quiero 6 minis, 3 Plain y 3 Blueberry";
  input.extraction.order_patch.bagel_size = null;
  const state = core.projectSalesState(input);
  assert.equal(state.projectedOrder.bagel_size, "mini");
  assert.equal(state.quote.pack.slug, "mini-6-mixed");
  assert.equal(state.quote.itemsSubtotal, 25);
});
