import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/instagram/order-drafts.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const buildDir = await mkdtemp(join(tmpdir(), "bagelito-order-drafts-"));
await writeFile(join(buildDir, "package.json"), '{"type":"module"}', "utf8");
await writeFile(join(buildDir, "order-drafts.js"), output, "utf8");

const {
  buildCrmIdempotencyKey,
  calculateOrderDraftTotals,
  getProductionSummary,
  mergeOrderDraft,
  validateOrderDraft,
} = await import(pathToFileURL(join(buildDir, "order-drafts.js")).href);

test("partial draft updates preserve existing customer and order fields", () => {
  const current = {
    customerName: "Jimena",
    phone: "999111222",
    district: "Miraflores",
    address: "Av. Principal 123",
    items: [
      { key: "plain", name: "Plain", quantity: 4 },
      { key: "cheddar", name: "Cheddar", quantity: 2 },
    ],
  };

  const merged = mergeOrderDraft(current, {
    phone: "",
    items: [
      { key: "plain", name: "Plain", quantity: 6 },
      { key: "blueberry", name: "Blueberry", quantity: 2 },
    ],
  });

  assert.equal(merged.customerName, "Jimena");
  assert.equal(merged.phone, "999111222");
  assert.equal(merged.address, "Av. Principal 123");
  assert.deepEqual(merged.items, [
    { key: "plain", name: "Plain", quantity: 6 },
    { key: "cheddar", name: "Cheddar", quantity: 2 },
    { key: "blueberry", name: "Blueberry", quantity: 2 },
  ]);
});

test("draft totals use live unit prices and a supplied delivery fee", () => {
  const totals = calculateOrderDraftTotals(
    {
      items: [
        { key: "plain", name: "Plain", quantity: 4 },
        { key: "cheddar", name: "Cheddar", quantity: 2 },
      ],
      schmears: [{ key: "original-120", name: "Original 120 g", quantity: 1 }],
    },
    {
      itemPrices: { plain: 10, cheddar: 12 },
      schmearPrices: { "original-120": 14 },
      deliveryFee: 12,
    },
  );

  assert.deepEqual(totals, {
    itemsSubtotal: 64,
    schmearsSubtotal: 14,
    deliveryFee: 12,
    total: 90,
    currency: "PEN",
  });
});

test("a complete draft must reconcile declared units with item quantities", () => {
  const result = validateOrderDraft({
    units: 12,
    customerName: "Jimena",
    phone: "999111222",
    district: "Miraflores",
    address: "Av. Principal 123",
    items: [
      { key: "plain", name: "Plain", quantity: 6 },
      { key: "cheddar", name: "Cheddar", quantity: 4 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("item_quantity_mismatch"));
});

test("payment evidence never becomes confirmed payment automatically", () => {
  const result = validateOrderDraft({
    units: 6,
    customerName: "Jimena",
    phone: "999111222",
    district: "Miraflores",
    address: "Av. Principal 123",
    paymentStatus: "evidence_received",
    paymentEvidencePath: "private/voucher.jpg",
    items: [{ key: "plain", name: "Plain", quantity: 6 }],
  });

  assert.equal(result.normalizedPaymentStatus, "evidence_received");
  assert.equal(result.requiresPaymentVerification, true);
});

test("production summary aggregates flavor, district, revenue, and unpaid orders", () => {
  const summary = getProductionSummary([
    {
      status: "payment_confirmed",
      paymentStatus: "confirmed",
      district: "Miraflores",
      total: 90,
      items: [
        { key: "plain", name: "Plain", quantity: 4 },
        { key: "cheddar", name: "Cheddar", quantity: 2 },
      ],
    },
    {
      status: "payment_pending",
      paymentStatus: "pending",
      district: "San Isidro",
      total: 60,
      items: [{ key: "plain", name: "Plain", quantity: 6 }],
    },
  ]);

  assert.deepEqual(summary.bagelsByFlavor, {
    cheddar: 2,
    plain: 10,
  });
  assert.deepEqual(summary.ordersByDistrict, {
    Miraflores: 1,
    "San Isidro": 1,
  });
  assert.equal(summary.confirmedRevenue, 90);
  assert.equal(summary.pipelineValue, 150);
  assert.equal(summary.paymentPendingOrders, 1);
});

test("CRM idempotency key is stable for the same entity version", () => {
  assert.equal(
    buildCrmIdempotencyKey("opportunity", "draft-123", 4),
    "ghl:opportunity:draft-123:v4",
  );
  assert.equal(
    buildCrmIdempotencyKey("opportunity", "draft-123", 4),
    buildCrmIdempotencyKey("opportunity", "draft-123", 4),
  );
});
