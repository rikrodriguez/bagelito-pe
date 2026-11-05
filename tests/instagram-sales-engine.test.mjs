import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function transpile(relativePath, targetPath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  await writeFile(targetPath, output, "utf8");
}

const buildDir = await mkdtemp(join(tmpdir(), "bagelito-sales-engine-"));
await writeFile(join(buildDir, "package.json"), '{"type":"module"}', "utf8");
await transpile("../src/lib/instagram/sales-playbook.ts", join(buildDir, "sales-playbook.js"));
await transpile("../src/lib/instagram/sales-engine.ts", join(buildDir, "sales-engine.js"));

const {
  classifyObjection,
  classifySalesStage,
  mergeOrderPatch,
  planNextSalesAction,
  shouldHandoff,
} = await import(pathToFileURL(join(buildDir, "sales-engine.js")).href);

test("a first menu question enters discovery and sends the menu", () => {
  const context = {
    latestMessage: "Holaaa, qué sabores tienen?",
    intent: "flavors",
    confidence: 0.99,
    order: {},
  };

  assert.equal(classifySalesStage(context), "menu_discovery");
  assert.equal(planNextSalesAction(context).action, "send_menu");
});

test("the newest custom question interrupts an existing order and hands off", () => {
  const context = {
    latestMessage: "Tienes birthday bagel?",
    intent: "custom_order",
    confidence: 0.99,
    order: {
      units: 12,
      items: [
        { key: "plain", name: "Plain", quantity: 6 },
        { key: "blueberry", name: "Blueberry", quantity: 2 },
        { key: "cheddar", name: "Cheddar", quantity: 4 },
      ],
    },
  };

  const handoff = shouldHandoff(context);
  const plan = planNextSalesAction(context);

  assert.equal(handoff.handoff, true);
  assert.equal(handoff.reason, "custom_feasibility");
  assert.equal(plan.action, "handoff");
  assert.equal(plan.stage, "human_review");
});

test("price objections are clarified before the script resumes", () => {
  const context = {
    latestMessage: "Está un poco caro, no tienes algo más barato?",
    intent: "price",
    confidence: 0.96,
    order: {},
  };

  assert.equal(classifyObjection(context.latestMessage), "price");
  const plan = planNextSalesAction(context);
  assert.equal(plan.action, "handle_objection");
  assert.equal(plan.objectionType, "price");
  assert.equal(plan.resumeAction, "recommend_pack");
});

test("partial order patches preserve known fields and merge item quantities", () => {
  const current = {
    customerName: "Jimena",
    phone: "999111222",
    district: "Miraflores",
    items: [
      { key: "plain", name: "Plain", quantity: 4 },
      { key: "cheddar", name: "Cheddar", quantity: 2 },
    ],
  };

  const merged = mergeOrderPatch(current, {
    customerName: undefined,
    phone: "",
    items: [
      { key: "plain", name: "Plain", quantity: 6 },
      { key: "blueberry", name: "Blueberry", quantity: 2 },
    ],
  });

  assert.equal(merged.customerName, "Jimena");
  assert.equal(merged.phone, "999111222");
  assert.deepEqual(merged.items, [
    { key: "plain", name: "Plain", quantity: 6 },
    { key: "cheddar", name: "Cheddar", quantity: 2 },
    { key: "blueberry", name: "Blueberry", quantity: 2 },
  ]);
});

test("configured items with missing customer data ask only for delivery details", () => {
  const context = {
    latestMessage: "Quiero 6 plain y 6 cheddar",
    intent: "how_to_order",
    confidence: 0.98,
    order: {
      units: 12,
      items: [
        { key: "plain", name: "Plain", quantity: 6 },
        { key: "cheddar", name: "Cheddar", quantity: 6 },
      ],
    },
  };

  assert.equal(classifySalesStage(context), "details_collection");
  const plan = planNextSalesAction(context);
  assert.equal(plan.action, "ask_contact_delivery");
  assert.deepEqual(plan.missingFields, ["customer_name", "phone", "district", "address"]);
});

test("a complete order is quoted before payment is requested", () => {
  const base = {
    latestMessage: "Listo, esa es mi dirección",
    intent: "how_to_order",
    confidence: 0.98,
    order: {
      units: 6,
      customerName: "Jimena",
      phone: "999111222",
      district: "Miraflores",
      address: "Dirección confirmada",
      items: [{ key: "plain", name: "Plain", quantity: 6 }],
    },
    quote: { verified: true, sent: false, total: 58, currency: "PEN" },
    payment: { status: "none" },
  };

  assert.equal(classifySalesStage(base), "quote_ready");
  assert.equal(planNextSalesAction(base).action, "quote_order");

  const afterQuote = {
    ...base,
    quote: { ...base.quote, sent: true },
  };
  assert.equal(classifySalesStage(afterQuote), "payment_pending");
  assert.equal(planNextSalesAction(afterQuote).action, "request_payment");
});

test("payment evidence is acknowledged but never treated as confirmed payment", () => {
  const context = {
    latestMessage: "Ya te mandé la captura",
    intent: "payment_confirmation",
    confidence: 0.98,
    order: { units: 6, items: [{ key: "plain", name: "Plain", quantity: 6 }] },
    payment: { status: "evidence_received" },
  };

  assert.equal(classifySalesStage(context), "payment_evidence_received");
  const plan = planNextSalesAction(context);
  assert.equal(plan.action, "acknowledge_payment_evidence");
  assert.equal(plan.requiresHumanVerification, true);
  assert.notEqual(plan.stage, "confirmed");
});

test("safety and support cases always hand off", () => {
  for (const intent of ["complaint", "refund", "allergy", "food_safety", "payment_dispute", "fraud"]) {
    const handoff = shouldHandoff({
      latestMessage: "Necesito ayuda",
      intent,
      confidence: 0.99,
      order: {},
    });
    assert.equal(handoff.handoff, true, intent);
  }
});
