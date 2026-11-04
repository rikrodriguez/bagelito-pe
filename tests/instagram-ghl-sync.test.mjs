import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/instagram/ghl-sync.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

const {
  BAGELITO_GHL_CONFIG,
  buildGhlContactPayload,
  buildGhlOpportunityPayload,
  buildGhlOpportunityCustomFields,
  getGhlStage,
  getGhlOpportunityStatus,
} = module;

test("GHL config points to the dedicated Bagelito pipeline", () => {
  assert.equal(BAGELITO_GHL_CONFIG.locationId, "wGVp4L7zAl46JR7gg0Hx");
  assert.equal(BAGELITO_GHL_CONFIG.pipelineId, "atqtqzswVGYoGU18TF8z");
  assert.equal(
    BAGELITO_GHL_CONFIG.stageIds.new_inquiry,
    "bbe7c4a0-e9db-4a07-b57d-0721dd5f8b73",
  );
});

test("sales stages map to the correct GHL stage and status", () => {
  assert.equal(getGhlStage("menu_discovery"), "742a824e-0cf0-4616-9213-5ebeef71dc9d");
  assert.equal(getGhlStage("payment_evidence_received"), "0b8e8d6a-a3a7-4baa-9be2-7dd005ff9083");
  assert.equal(getGhlStage("human_review"), "cc706e8b-07d7-4079-ab48-47609c310542");
  assert.equal(getGhlOpportunityStatus("completed"), "won");
  assert.equal(getGhlOpportunityStatus("lost"), "lost");
  assert.equal(getGhlOpportunityStatus("quote_ready"), "open");
});

test("contact payload preserves Instagram identity and preferences", () => {
  const payload = buildGhlContactPayload({
    instagramUserId: "17840000000000000",
    instagramUsername: "customer.pe",
    displayName: "Ana Pérez",
    phone: "+51999111222",
    email: "ana@example.com",
    preferredLanguage: "es",
    favoriteFlavors: ["Everything", "Blueberry"],
    customerStatus: "repeat",
  });

  assert.equal(payload.firstName, "Ana");
  assert.equal(payload.lastName, "Pérez");
  assert.equal(payload.phone, "+51999111222");
  assert.equal(payload.source, "Bagelito Instagram");
  assert.ok(payload.customFields.some((field) => field.fieldValue === "17840000000000000"));
  assert.ok(payload.customFields.some((field) => field.fieldValue === "Everything, Blueberry"));
});

test("opportunity payload uses draft ID as stable name and live monetary value", () => {
  const payload = buildGhlOpportunityPayload({
    draftId: "draft-123",
    contactId: "contact-456",
    customerName: "Ana Pérez",
    stage: "quote_ready",
    total: 115,
  });

  assert.equal(payload.pipelineId, BAGELITO_GHL_CONFIG.pipelineId);
  assert.equal(payload.pipelineStageId, BAGELITO_GHL_CONFIG.stageIds.quote_ready);
  assert.equal(payload.name, "Bagelito | Ana Pérez | draft-123");
  assert.equal(payload.status, "open");
  assert.equal(payload.monetaryValue, 115);
});

test("opportunity custom fields carry order, payment, and handoff context", () => {
  const fields = buildGhlOpportunityCustomFields({
    draftId: "draft-123",
    conversationId: "conversation-123",
    batchId: "batch-123",
    packName: "12 mixed",
    units: 12,
    items: [
      { name: "Plain", quantity: 6 },
      { name: "Cheddar", quantity: 4 },
      { name: "Blueberry", quantity: 2 },
    ],
    schmears: [{ name: "Original 120 g", quantity: 1 }],
    district: "Miraflores",
    address: "Av. Principal 123",
    total: 145,
    paymentMethod: "Yape",
    paymentStatus: "pending",
    stage: "payment_pending",
    nextBestAction: "request_payment",
    handoffReason: null,
    checkoutUrl: null,
    deliveryWindow: "Friday afternoon",
    voucherReference: null,
  });

  const values = new Map(fields.map((field) => [field.id, field.fieldValue]));
  assert.equal(values.get(BAGELITO_GHL_CONFIG.opportunityFields.draftId), "draft-123");
  assert.equal(values.get(BAGELITO_GHL_CONFIG.opportunityFields.units), 12);
  assert.match(String(values.get(BAGELITO_GHL_CONFIG.opportunityFields.flavors)), /Plain: 6/);
  assert.equal(values.get(BAGELITO_GHL_CONFIG.opportunityFields.total), 145);
  assert.equal(values.get(BAGELITO_GHL_CONFIG.opportunityFields.paymentStatus), "pending");
});
