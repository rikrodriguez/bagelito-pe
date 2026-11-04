import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadCore() {
  const source = await readFile(
    new URL("../supabase/functions/_shared/instagram-sales-core.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = await mkdtemp(join(tmpdir(), "bagelito-sales-core-"));
  await writeFile(join(dir, "package.json"), '{"type":"module"}', "utf8");
  await writeFile(join(dir, "core.js"), output, "utf8");
  return import(pathToFileURL(join(dir, "core.js")).href);
}

const core = await loadCore();

const facts = {
  packs: [
    { slug: "6-mixed", name: "6 mixed", units: 6, amount: 60, packType: "mixed" },
    { slug: "6-single", name: "6 single flavor", units: 6, amount: 50, packType: "single" },
  ],
  bagel_flavors: [
    { slug: "plain", name: "Plain", price: 10 },
    { slug: "cheddar", name: "Cheddar", price: 12 },
  ],
  schmears: [],
  delivery_pricing: {
    rate_per_km: 3,
    minimum_fee: 8,
    long_distance_threshold: 15,
    long_distance_discount_rate: 0.3,
    district_distances_km: { Miraflores: 7.1 },
  },
};

test("latest order patch is merged before planning the reply", () => {
  const state = core.projectSalesState({
    currentOrder: {
      id: "draft",
      sales_stage: "order_configuration",
      payment_status: "none",
      customer_name: "Jimena",
      phone: "999111222",
      district: "Miraflores",
      quote_sent_at: null,
    },
    currentItems: [
      { item_kind: "bagel", item_key: "plain", item_name: "Plain", quantity: 3, unit_price: null, metadata: {} },
    ],
    extraction: {
      intent: "how_to_order",
      confidence: 0.98,
      customer_requested_human: false,
      conflicting_data: false,
      payment_evidence_claimed: false,
      order_patch: {
        pack_slug: null, pack_name: null, units: 6,
        customer_name: null, phone: null, email: null, district: null,
        address: "Av. Example 123", address_reference: null,
        delivery_notes: null, requested_date: null, custom_request: null,
        items: [
          { key: "plain", name: "Plain", quantity: 3 },
          { key: "cheddar", name: "Cheddar", quantity: 3 },
        ],
        schmears: [],
      },
    },
    facts,
    latestMessage: "Av. Example 123. Son 3 Plain y 3 Cheddar",
  });

  assert.equal(state.projectedOrder.delivery_address, "Av. Example 123");
  assert.equal(state.projectedItems.length, 2);
  assert.deepEqual(state.missingFields, []);
  assert.equal(state.quote.verified, true);
  assert.equal(state.quote.itemsSubtotal, 60);
  assert.equal(state.quote.deliveryFee, 16);
  assert.equal(state.quote.total, 76);
  assert.equal(state.stage, "quote_ready");
  assert.equal(state.action, "quote_order");
});

test("custom request interrupts quote and forces human review", () => {
  const state = core.projectSalesState({
    currentOrder: null,
    currentItems: [],
    extraction: {
      intent: "custom_order",
      confidence: 0.99,
      customer_requested_human: false,
      conflicting_data: false,
      payment_evidence_claimed: false,
      order_patch: {
        pack_slug: "6-mixed", pack_name: "6 mixed", units: 6,
        customer_name: null, phone: null, email: null, district: null,
        address: null, address_reference: null, delivery_notes: null,
        requested_date: null, custom_request: "birthday bagel",
        items: [], schmears: [],
      },
    },
    facts,
    latestMessage: "Tienes birthday bagel?",
  });

  assert.equal(state.stage, "human_review");
  assert.equal(state.action, "handoff");
  assert.equal(state.handoffReason, "custom_feasibility");
  assert.equal(state.quote.verified, false);
});

test("payment evidence never becomes confirmed payment", () => {
  const state = core.projectSalesState({
    currentOrder: {
      id: "draft",
      sales_stage: "payment_pending",
      payment_status: "none",
      quote_verified: true,
      quote_sent_at: "2026-11-04T10:00:00Z",
    },
    currentItems: [],
    extraction: {
      intent: "payment_confirmation",
      confidence: 0.99,
      customer_requested_human: false,
      conflicting_data: false,
      payment_evidence_claimed: true,
      order_patch: {
        pack_slug: null, pack_name: null, units: null,
        customer_name: null, phone: null, email: null, district: null,
        address: null, address_reference: null, delivery_notes: null,
        requested_date: null, custom_request: null, items: [], schmears: [],
      },
    },
    facts,
    latestMessage: "Ya te mandé la captura",
  });

  assert.equal(state.paymentStatus, "evidence_received");
  assert.equal(state.stage, "payment_evidence_received");
  assert.equal(state.action, "acknowledge_payment_evidence");
});

test("incomplete configured order asks for operational details", () => {
  const state = core.projectSalesState({
    currentOrder: null,
    currentItems: [],
    extraction: {
      intent: "how_to_order",
      confidence: 0.98,
      customer_requested_human: false,
      conflicting_data: false,
      payment_evidence_claimed: false,
      order_patch: {
        pack_slug: "6-mixed", pack_name: "6 mixed", units: 6,
        customer_name: null, phone: null, email: null, district: null,
        address: null, address_reference: null, delivery_notes: null,
        requested_date: null, custom_request: null,
        items: [
          { key: "plain", name: "Plain", quantity: 3 },
          { key: "cheddar", name: "Cheddar", quantity: 3 },
        ],
        schmears: [],
      },
    },
    facts,
    latestMessage: "3 Plain y 3 Cheddar",
  });

  assert.equal(state.stage, "details_collection");
  assert.equal(state.action, "ask_contact_delivery");
  assert.deepEqual(state.missingFields, ["customer_name", "phone", "district", "address"]);
});
