import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SALES_STAGES = [
  "new_inquiry",
  "menu_discovery",
  "recommendation",
  "order_configuration",
  "details_collection",
  "quote_ready",
  "payment_pending",
  "payment_evidence_received",
  "confirmed",
  "production",
  "delivery",
  "completed",
  "lost",
  "human_review",
] as const;

const NEXT_ACTIONS = [
  "answer_question",
  "send_menu",
  "recommend_pack",
  "ask_quantity_flavors",
  "ask_contact_delivery",
  "summarize_order",
  "quote_order",
  "request_payment",
  "acknowledge_payment_evidence",
  "handle_objection",
  "handoff",
  "wait",
  "confirm_fulfillment",
] as const;

const BUYER_SIGNALS = [
  "browsing",
  "interested",
  "selection_started",
  "order_complete",
  "payment_ready",
  "payment_sent",
  "urgent",
  "objection",
  "custom_request",
  "support",
] as const;

const OBJECTION_TYPES = [
  "none",
  "price",
  "minimum_order",
  "availability",
  "delivery",
  "timing",
  "choice_overload",
  "trust",
  "custom_request",
  "other",
] as const;

const HANDOFF_REASONS = [
  "complaint",
  "refund",
  "missing_or_damaged_order",
  "food_safety",
  "allergy",
  "payment_dispute",
  "fraud",
  "custom_feasibility",
  "discount_exception",
  "delivery_exception",
  "customer_requested_human",
  "repeated_misunderstanding",
  "low_confidence",
  "conflicting_data",
] as const;

const HIGH_RISK_INTENTS: Record<string, string> = {
  complaint: "complaint",
  refund: "refund",
  missing_item: "missing_or_damaged_order",
  damaged_order: "missing_or_damaged_order",
  food_safety: "food_safety",
  allergy: "allergy",
  payment_dispute: "payment_dispute",
  fraud: "fraud",
  custom_order: "custom_feasibility",
  discount_exception: "discount_exception",
};

const SALES_RELEVANT_INTENTS = new Set([
  "menu",
  "price",
  "flavors",
  "product_photo",
  "batch_status",
  "delivery_area",
  "how_to_order",
  "order_status",
  "payment_confirmation",
  "address_change",
  "custom_order",
  "catering",
  "discount_exception",
  "complaint",
  "refund",
  "missing_item",
  "damaged_order",
  "payment_dispute",
  "fraud",
]);

const ACTIVE_DRAFT_STATUSES = [
  "active",
  "quoted",
  "payment_pending",
  "payment_verification",
  "confirmed",
  "in_production",
  "ready_for_delivery",
  "human_review",
];

function ghlConfigReady(config: any) {
  if (!config || config.enabled !== true) return false;
  if (typeof config.locationId !== "string" || !config.locationId.trim()) return false;
  if (typeof config.pipelineId !== "string" || !config.pipelineId.trim()) return false;
  if (!config.stages || !config.contactFields || !config.opportunityFields) return false;
  return true;
}

type JsonRecord = Record<string, unknown>;
type DraftItem = {
  item_kind: "bagel" | "schmear" | "addon";
  item_key: string;
  item_name: string;
  quantity: number;
  unit_price: number | null;
  metadata: JsonRecord;
};

type Extraction = {
  buyer_signal: typeof BUYER_SIGNALS[number];
  sales_stage: typeof SALES_STAGES[number];
  next_best_action: typeof NEXT_ACTIONS[number];
  objection_type: typeof OBJECTION_TYPES[number];
  handoff_reason: typeof HANDOFF_REASONS[number] | null;
  customer_requested_human: boolean;
  conflicting_data: boolean;
  payment_evidence_claimed: boolean;
  order_patch: {
    pack_slug: string | null;
    pack_name: string | null;
    units: number | null;
    customer_name: string | null;
    phone: string | null;
    email: string | null;
    district: string | null;
    address: string | null;
    address_reference: string | null;
    delivery_notes: string | null;
    requested_date: string | null;
    custom_request: string | null;
    items: Array<{ key: string; name: string; quantity: number }>;
    schmears: Array<{ key: string; name: string; quantity: number }>;
  };
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractOutputText(payload: any) {
  const pieces: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

function parseDate(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mergeItems(current: DraftItem[], patch: Extraction["order_patch"]) {
  const merged = new Map<string, DraftItem>();
  const order: string[] = [];

  for (const item of current) {
    const mapKey = `${item.item_kind}:${normalize(item.item_key || item.item_name)}`;
    merged.set(mapKey, { ...item, item_key: item.item_key || normalize(item.item_name) });
    order.push(mapKey);
  }

  const apply = (
    kind: "bagel" | "schmear",
    lines: Array<{ key: string; name: string; quantity: number }>,
  ) => {
    for (const line of lines ?? []) {
      const key = normalize(text(line.key) || text(line.name));
      if (!key || !Number.isFinite(line.quantity)) continue;
      const mapKey = `${kind}:${key}`;
      if (line.quantity <= 0) {
        merged.delete(mapKey);
        continue;
      }
      if (!merged.has(mapKey)) order.push(mapKey);
      merged.set(mapKey, {
        item_kind: kind,
        item_key: key,
        item_name: text(line.name) || merged.get(mapKey)?.item_name || key,
        quantity: line.quantity,
        unit_price: merged.get(mapKey)?.unit_price ?? null,
        metadata: merged.get(mapKey)?.metadata ?? {},
      });
    }
  };

  apply("bagel", patch.items);
  apply("schmear", patch.schmears);
  return order.filter((key) => merged.has(key)).map((key) => merged.get(key)!);
}

function mergeScalar<T>(current: T | null | undefined, patch: T | null | undefined) {
  if (patch === undefined || patch === null) return current ?? null;
  if (typeof patch === "string" && patch.trim() === "") return current ?? null;
  return patch;
}

function classifyObjection(message: string) {
  if (/\b(birthday|cumplea[nñ]os|cumple|custom|personaliz|forma especial|shape|color especial|logo|tem[aá]tico)\b/i.test(message)) return "custom_request";
  if (/\b(caro|car[ií]simo|presupuesto|barato|descuento|price|expensive|budget|cheaper)\b/i.test(message)) return "price";
  if (/\b(menos de 6|solo [1-5]\b|minimum|minimo|mínimo|individual)\b/i.test(message)) return "minimum_order";
  if (/\b(disponible|stock|queda|available|sold out|agotad)\b/i.test(message)) return "availability";
  if (/\b(delivery|env[ií]o|distrito|recojo|pickup|deliver)\b/i.test(message)) return "delivery";
  if (/\b(hoy|ma[nñ]ana|urgente|fecha|hora|cuando|cuándo|today|tomorrow|urgent|when)\b/i.test(message)) return "timing";
  if (/\b(no s[eé] cu[aá]l|recomienda|recomiendas|cu[aá]l elijo|too many|recommend)\b/i.test(message)) return "choice_overload";
  if (/\b(fresco|calidad|seguro|confianza|real|fresh|quality|trust)\b/i.test(message)) return "trust";
  return "none";
}

function deterministicHandoff(args: {
  intent: string;
  latestMessage: string;
  confidence: number | null;
  extraction: Extraction;
  customRequest: string | null;
}) {
  const highRisk = HIGH_RISK_INTENTS[args.intent];
  if (highRisk) return highRisk;
  if (args.customRequest || /\b(birthday|cumplea[nñ]os|cumple|custom|personaliz|forma especial|shape|color especial|logo|tem[aá]tico)\b/i.test(args.latestMessage)) {
    return "custom_feasibility";
  }
  if (args.extraction.customer_requested_human || /\b(humano|persona real|hablar con (alguien|una persona)|asesor|Dawn|human|real person|talk to someone)\b/i.test(args.latestMessage)) {
    return "customer_requested_human";
  }
  if (args.extraction.conflicting_data) return "conflicting_data";
  if (typeof args.confidence === "number" && args.confidence < 0.78) return "low_confidence";
  return null;
}

function missingFields(draft: JsonRecord, items: DraftItem[]) {
  const missing: string[] = [];
  const bagels = items.filter((item) => item.item_kind === "bagel" && item.quantity > 0);
  if (!bagels.length) missing.push("items");
  if (!text(draft.customer_name)) missing.push("customer_name");
  if (!text(draft.phone)) missing.push("phone");
  if (!text(draft.district)) missing.push("district");
  if (!text(draft.delivery_address)) missing.push("address");
  return missing;
}

function calculateDeliveryFee(district: string, fact: any) {
  if (!district || !fact?.district_distances_km) return null;
  const entries = Object.entries(fact.district_distances_km as Record<string, unknown>);
  const matched = entries.find(([name]) => normalize(name) === normalize(district));
  const distance = matched ? Number(matched[1]) : NaN;
  if (!Number.isFinite(distance)) return null;
  const rate = Number(fact.rate_per_km ?? 3);
  const minimum = Number(fact.minimum_fee ?? 8);
  const threshold = Number(fact.long_distance_threshold ?? 15);
  const discount = Number(fact.long_distance_discount_rate ?? 0.3);
  const base = Math.ceil(distance * rate);
  const adjusted = base >= threshold ? Math.ceil(base * (1 - discount)) : base;
  return Math.max(minimum, adjusted);
}

function findPack(packs: any[], draft: JsonRecord, items: DraftItem[]) {
  const slug = text(draft.pack_slug);
  const name = text(draft.pack_name);
  if (slug) {
    const found = packs.find((pack) => normalize(text(pack.slug)) === normalize(slug));
    if (found) return found;
  }
  if (name) {
    const found = packs.find((pack) => normalize(text(pack.name)) === normalize(name));
    if (found) return found;
  }
  const bagels = items.filter((item) => item.item_kind === "bagel" && item.quantity > 0);
  const units = bagels.reduce((total, item) => total + item.quantity, 0);
  const packType = bagels.length > 1 ? "mixed" : "single";
  return packs.find((pack) => Number(pack.units) === units && text(pack.packType) === packType) ?? null;
}

function calculateQuote(args: {
  draft: JsonRecord;
  items: DraftItem[];
  facts: Record<string, any>;
  handoffReason: string | null;
}) {
  const packs = Array.isArray(args.facts.packs) ? args.facts.packs : [];
  const flavors = Array.isArray(args.facts.bagel_flavors) ? args.facts.bagel_flavors : [];
  const schmearFacts = Array.isArray(args.facts.schmears) ? args.facts.schmears : [];
  const pack = findPack(packs, args.draft, args.items);
  const bagels = args.items.filter((item) => item.item_kind === "bagel");
  const schmears = args.items.filter((item) => item.item_kind === "schmear");
  const bagelQuantity = bagels.reduce((total, item) => total + item.quantity, 0);
  const packUnits = pack ? Number(pack.units) : null;
  const deliveryFee = calculateDeliveryFee(text(args.draft.district), args.facts.delivery_pricing);
  const flavorMap = new Map(flavors.map((flavor: any) => [normalize(text(flavor.slug) || text(flavor.name)), flavor]));
  const schmearMap = new Map(schmearFacts.map((item: any) => [normalize(text(item.slug) || text(item.name)), item]));

  for (const item of bagels) {
    const flavor = flavorMap.get(normalize(item.item_key)) as any;
    item.metadata = { ...item.metadata, catalog_unit_price: flavor ? numberOrNull(flavor.price) : null };
  }

  let schmearsSubtotal = 0;
  let unpricedSchmear = false;
  for (const item of schmears) {
    const fact = schmearMap.get(normalize(item.item_key)) as any;
    const unitPrice = fact ? numberOrNull(fact.price) : null;
    item.unit_price = unitPrice;
    if (unitPrice === null) unpricedSchmear = true;
    else schmearsSubtotal += unitPrice * item.quantity;
  }

  const verified = Boolean(
    pack &&
    packUnits === bagelQuantity &&
    deliveryFee !== null &&
    !unpricedSchmear &&
    !text(args.draft.custom_request) &&
    !args.handoffReason,
  );
  const itemsSubtotal = pack ? Number(pack.amount) : null;
  const total = verified && itemsSubtotal !== null
    ? roundMoney(itemsSubtotal + schmearsSubtotal + Number(deliveryFee))
    : null;

  return {
    verified,
    pack,
    bagelQuantity,
    itemsSubtotal,
    schmearsSubtotal: roundMoney(schmearsSubtotal),
    deliveryFee,
    total,
    reason: verified
      ? null
      : (!pack
          ? "pack_not_resolved"
          : packUnits !== bagelQuantity
            ? "item_quantity_mismatch"
            : deliveryFee === null
              ? "delivery_fee_unavailable"
              : unpricedSchmear
                ? "schmear_price_unavailable"
                : text(args.draft.custom_request)
                  ? "custom_request_requires_review"
                  : args.handoffReason || "quote_not_verified"),
  };
}

function stageAndAction(args: {
  intent: string;
  latestMessage: string;
  draft: JsonRecord;
  items: DraftItem[];
  paymentStatus: string;
  quoteVerified: boolean;
  quoteSent: boolean;
  handoffReason: string | null;
}) {
  if (args.handoffReason) return { stage: "human_review", action: "handoff" };
  if (args.paymentStatus === "confirmed") return { stage: "confirmed", action: "confirm_fulfillment" };
  if (args.paymentStatus === "evidence_received") return { stage: "payment_evidence_received", action: "acknowledge_payment_evidence" };
  if (args.quoteSent) return { stage: "payment_pending", action: "request_payment" };

  const objection = classifyObjection(args.latestMessage);
  if (objection !== "none") return { stage: text(args.draft.sales_stage) || "menu_discovery", action: "handle_objection" };

  const missing = missingFields(args.draft, args.items);
  const hasBagels = !missing.includes("items");
  if (hasBagels && missing.length === 0) {
    return { stage: "quote_ready", action: args.quoteVerified ? "quote_order" : "wait" };
  }
  if (hasBagels) return { stage: "details_collection", action: "ask_contact_delivery" };
  if (numberOrNull(args.draft.units) || text(args.draft.pack_slug)) {
    return { stage: "order_configuration", action: "ask_quantity_flavors" };
  }
  if (["menu", "flavors", "price", "product_photo", "how_to_order", "delivery_area", "batch_status"].includes(args.intent)) {
    return {
      stage: "menu_discovery",
      action: ["menu", "flavors", "price", "product_photo"].includes(args.intent)
        ? "send_menu"
        : "ask_quantity_flavors",
    };
  }
  return { stage: "new_inquiry", action: "answer_question" };
}

function statusFor(stage: string, quoteSent: boolean) {
  if (stage === "human_review") return "human_review";
  if (stage === "payment_evidence_received") return "payment_verification";
  if (stage === "payment_pending") return "payment_pending";
  if (stage === "confirmed") return "confirmed";
  if (stage === "production") return "in_production";
  if (stage === "delivery") return "ready_for_delivery";
  if (stage === "completed") return "delivered";
  if (stage === "lost") return "lost";
  if (quoteSent) return "quoted";
  return "active";
}

function buyerSignal(args: {
  modelSignal: string;
  stage: string;
  objection: string;
  handoffReason: string | null;
  paymentStatus: string;
}) {
  if (args.paymentStatus === "evidence_received") return "payment_sent";
  if (args.handoffReason === "custom_feasibility") return "custom_request";
  if (args.handoffReason) return "support";
  if (args.objection !== "none") return "objection";
  if (args.stage === "quote_ready") return "order_complete";
  if (["order_configuration", "details_collection"].includes(args.stage)) return "selection_started";
  return BUYER_SIGNALS.includes(args.modelSignal as any) ? args.modelSignal : "interested";
}

function scoreVoice(messages: unknown) {
  const bubbles = Array.isArray(messages)
    ? messages.filter((item) => typeof item === "string").map((item) => String(item).trim()).filter(Boolean)
    : [];
  const combined = bubbles.join("\n\n");
  const issues: string[] = [];
  if (!bubbles.length) issues.push("empty_reply");
  if (bubbles.length > 2) issues.push("too_many_bubbles");
  if (bubbles.some((bubble) => [...bubble].length > 450)) issues.push("bubble_too_long");
  if (bubbles.some((bubble) => [...bubble].length > 180 && !bubble.includes("\n\n"))) issues.push("wall_of_text");
  if (combined.includes("|")) issues.push("pipe_separator");
  if (combined.split("\n").some((line) => [...line].length > 155)) issues.push("line_too_long");
  if (combined.split(/\n\s*\n/).some((block) => [...block].length > 180)) issues.push("block_too_long");
  const emojiCount = combined.match(/[\u{1F1E6}-\u{1FAFF}\u2600-\u27BF]/gu)?.length ?? 0;
  if (emojiCount > 5) issues.push("excessive_emojis");
  if (/estimad[oa] cliente|hemos recibido tu solicitud|te guiaremos|siguientes pasos|proceder con tu solicitud/i.test(combined)) {
    issues.push("support_bot_language");
  }
  const penalties: Record<string, number> = {
    empty_reply: 100,
    too_many_bubbles: 20,
    bubble_too_long: 20,
    wall_of_text: 30,
    pipe_separator: 25,
    line_too_long: 15,
    block_too_long: 10,
    excessive_emojis: 25,
    support_bot_language: 30,
  };
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + (penalties[issue] ?? 10), 0));
  return { score, pass: score >= 80 && !issues.some((issue) => (penalties[issue] ?? 0) >= 30), issues };
}

function addCustomField(fields: any[], id: string, value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    fields.push({ id, fieldValue: value });
    return;
  }
  const normalized = text(value);
  if (normalized) fields.push({ id, fieldValue: normalized });
}

function splitName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Instagram Lead",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function ghlStatus(stage: string) {
  if (stage === "completed") return "won";
  if (stage === "lost") return "lost";
  return "open";
}

function buildGhlPayload(args: {
  lead: any;
  contact: any;
  draft: any | null;
  items: DraftItem[];
  stage: string;
  action: string;
  handoffReason: string | null;
  paymentPolicy: any;
  batch: any;
  ghlConfig: any;
}) {
  const GHL = args.ghlConfig;
  if (!ghlConfigReady(GHL)) return null;

  const displayName = text(args.draft?.customer_name) || text(args.contact.display_name) || text(args.contact.username) || `Instagram Lead ${text(args.contact.instagram_user_id).slice(-6)}`;
  const name = splitName(displayName);
  const contactFields: any[] = [];
  addCustomField(contactFields, GHL.contactFields.instagramUserId, args.contact.instagram_user_id);
  addCustomField(contactFields, GHL.contactFields.instagramUsername, args.contact.username);
  addCustomField(contactFields, GHL.contactFields.preferredLanguage, args.contact.detected_language);
  addCustomField(contactFields, GHL.contactFields.favoriteFlavors, args.lead.preferred_flavors?.join?.(", "));
  addCustomField(contactFields, GHL.contactFields.customerStatus, args.lead.status === "customer" ? "repeat" : "lead");

  const contactBody: JsonRecord = {
    firstName: name.firstName,
    source: "Bagelito Instagram",
    country: "PE",
    timezone: "America/Lima",
    customFields: contactFields,
  };
  if (name.lastName) contactBody.lastName = name.lastName;
  if (text(args.draft?.phone)) contactBody.phone = text(args.draft.phone);
  if (text(args.draft?.email)) contactBody.email = text(args.draft.email);

  if (!args.draft) {
    return {
      leadId: args.lead.id,
      draftId: null,
      contact: { id: args.lead.ghl_contact_id, body: contactBody },
      opportunity: null,
    };
  }

  const flavorLines = args.items
    .filter((item) => item.item_kind === "bagel")
    .map((item) => `${item.item_name}: ${item.quantity}`)
    .join("\n");
  const schmearLines = args.items
    .filter((item) => item.item_kind === "schmear")
    .map((item) => `${item.item_name}: ${item.quantity}`)
    .join("\n");
  const opportunityFields: any[] = [];
  addCustomField(opportunityFields, GHL.opportunityFields.draftId, args.draft.id);
  addCustomField(opportunityFields, GHL.opportunityFields.conversationId, args.draft.conversation_id);
  addCustomField(opportunityFields, GHL.opportunityFields.batchId, args.draft.batch_id);
  addCustomField(opportunityFields, GHL.opportunityFields.pack, args.draft.pack_name);
  addCustomField(opportunityFields, GHL.opportunityFields.units, args.draft.units);
  addCustomField(opportunityFields, GHL.opportunityFields.flavors, flavorLines);
  addCustomField(opportunityFields, GHL.opportunityFields.schmears, schmearLines);
  addCustomField(opportunityFields, GHL.opportunityFields.district, args.draft.district);
  addCustomField(opportunityFields, GHL.opportunityFields.address, args.draft.delivery_address);
  addCustomField(opportunityFields, GHL.opportunityFields.total, args.draft.total_amount);
  addCustomField(opportunityFields, GHL.opportunityFields.paymentMethod, args.draft.payment_method || args.paymentPolicy?.display_name);
  addCustomField(opportunityFields, GHL.opportunityFields.paymentStatus, args.draft.payment_status);
  addCustomField(opportunityFields, GHL.opportunityFields.stage, args.stage);
  addCustomField(opportunityFields, GHL.opportunityFields.nextBestAction, args.action);
  addCustomField(opportunityFields, GHL.opportunityFields.handoffReason, args.handoffReason);
  addCustomField(opportunityFields, GHL.opportunityFields.checkoutUrl, args.draft.metadata?.checkout_url);
  addCustomField(opportunityFields, GHL.opportunityFields.deliveryWindow, args.draft.requested_delivery_at || args.batch?.delivery_date);
  addCustomField(opportunityFields, GHL.opportunityFields.voucherReference, args.draft.payment_evidence_path);

  return {
    leadId: args.lead.id,
    draftId: args.draft.id,
    contact: { id: args.lead.ghl_contact_id, body: contactBody },
    opportunity: {
      id: args.draft.ghl_opportunity_id,
      body: {
        pipelineId: GHL.pipelineId,
        pipelineStageId: GHL.stages[args.stage] || GHL.stages.new_inquiry,
        name: `Bagelito | ${displayName} | ${args.draft.id}`,
        status: ghlStatus(args.stage),
        ...(typeof args.draft.total_amount === "number" ? { monetaryValue: args.draft.total_amount } : {}),
      },
      customFields: opportunityFields,
    },
  };
}

async function callOpenAI(args: {
  apiKey: string;
  model: string;
  input: JsonRecord;
}) {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
  const line = {
    type: "object",
    additionalProperties: false,
    properties: {
      key: { type: "string" },
      name: { type: "string" },
      quantity: { type: "number", minimum: 0 },
    },
    required: ["key", "name", "quantity"],
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      store: false,
      instructions: [
        "You extract sales and order state from a Bagelito Instagram conversation.",
        "The latest inbound message has priority. Use older messages only to resolve references and preserve context.",
        "order_patch must contain only details explicitly added, changed or removed by the customer in the latest turn. Unknown values are null or empty arrays.",
        "Use quantity 0 only when the customer explicitly removes an existing item.",
        "Normalize known product keys to the supplied live catalog slug when confident; otherwise use a short lowercase key based on the customer's wording.",
        "Never infer phone, email, address, district, custom feasibility, payment confirmation or a delivery date.",
        "A screenshot or statement that payment was sent is payment evidence only, never confirmed payment.",
        "Birthday bagels, shapes, colors, logos and personalization are custom requests requiring feasibility review.",
        "Return JSON only matching the schema.",
      ].join("\n"),
      input: JSON.stringify(args.input),
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "bagelito_sales_enrichment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              buyer_signal: { type: "string", enum: BUYER_SIGNALS },
              sales_stage: { type: "string", enum: SALES_STAGES },
              next_best_action: { type: "string", enum: NEXT_ACTIONS },
              objection_type: { type: "string", enum: OBJECTION_TYPES },
              handoff_reason: {
                anyOf: [
                  { type: "string", enum: HANDOFF_REASONS },
                  { type: "null" },
                ],
              },
              customer_requested_human: { type: "boolean" },
              conflicting_data: { type: "boolean" },
              payment_evidence_claimed: { type: "boolean" },
              order_patch: {
                type: "object",
                additionalProperties: false,
                properties: {
                  pack_slug: nullableString,
                  pack_name: nullableString,
                  units: nullableNumber,
                  customer_name: nullableString,
                  phone: nullableString,
                  email: nullableString,
                  district: nullableString,
                  address: nullableString,
                  address_reference: nullableString,
                  delivery_notes: nullableString,
                  requested_date: nullableString,
                  custom_request: nullableString,
                  items: { type: "array", maxItems: 24, items: line },
                  schmears: { type: "array", maxItems: 12, items: line },
                },
                required: [
                  "pack_slug",
                  "pack_name",
                  "units",
                  "customer_name",
                  "phone",
                  "email",
                  "district",
                  "address",
                  "address_reference",
                  "delivery_notes",
                  "requested_date",
                  "custom_request",
                  "items",
                  "schmears",
                ],
              },
            },
            required: [
              "buyer_signal",
              "sales_stage",
              "next_best_action",
              "objection_type",
              "handoff_reason",
              "customer_requested_human",
              "conflicting_data",
              "payment_evidence_claimed",
              "order_patch",
            ],
          },
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`openai_${response.status}:${raw.slice(0, 1000)}`);
  const payload = JSON.parse(raw);
  const output = extractOutputText(payload);
  if (!output) throw new Error("empty_openai_output");
  return JSON.parse(output) as Extraction;
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
  const model = Deno.env.get("INSTAGRAM_AI_MODEL")?.trim() || "gpt-6-luna";

  if (req.method === "GET") {
    return respond({
      ok: true,
      function: "instagram-sales-enrich",
      configured: Boolean(supabaseUrl && serviceRoleKey && openaiKey),
      model,
    });
  }
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
    return respond({ ok: false, error: "configuration_missing" }, 503);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const internalToken = req.headers.get("x-internal-token")?.trim() ?? "";
  const { data: tokenValid, error: tokenError } = await db.rpc(
    "verify_instagram_sales_internal_token",
    { p_token: internalToken },
  );
  if (tokenError || !tokenValid) return respond({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const aiRunId = text(body?.ai_run_id);
  if (!/^[0-9a-f-]{36}$/i.test(aiRunId)) return respond({ ok: false, error: "invalid_ai_run_id" }, 400);

  const { data: claimed, error: claimError } = await db
    .from("instagram_ai_runs")
    .update({ sales_enrichment_status: "processing" })
    .eq("id", aiRunId)
    .in("sales_enrichment_status", ["pending", "error"])
    .select("*")
    .maybeSingle();

  if (claimError) return respond({ ok: false, error: `claim_failed:${claimError.message}` }, 500);
  if (!claimed) {
    const { data: existing } = await db
      .from("instagram_ai_runs")
      .select("sales_enrichment_status,sales_enriched_at")
      .eq("id", aiRunId)
      .maybeSingle();
    return respond({ ok: true, duplicate: true, status: existing?.sales_enrichment_status ?? "missing" });
  }

  try {
    const { data: triggeringMessage, error: messageError } = await db
      .from("instagram_messages")
      .select("id,conversation_id,text_content,attachments,sent_at")
      .eq("id", claimed.triggering_message_id)
      .single();
    if (messageError) throw new Error(`message_lookup_failed:${messageError.message}`);

    const { data: conversation, error: conversationError } = await db
      .from("instagram_conversations")
      .select("id,contact_id,mode,status")
      .eq("id", claimed.conversation_id)
      .single();
    if (conversationError) throw new Error(`conversation_lookup_failed:${conversationError.message}`);

    const [contactResult, messagesResult, factsResult, batchResult, draftResult] = await Promise.all([
      db.from("instagram_contacts")
        .select("id,instagram_user_id,username,display_name,detected_language,first_seen_at,last_seen_at")
        .eq("id", conversation.contact_id)
        .single(),
      db.from("instagram_messages")
        .select("direction,text_content,message_type,attachments,sent_at")
        .eq("conversation_id", conversation.id)
        .order("sent_at", { ascending: false })
        .limit(20),
      db.from("instagram_agent_facts")
        .select("fact_key,fact_value,source,updated_at"),
      db.from("batches")
        .select("id,name,status,orders_open_at,orders_close_at,delivery_date,created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("instagram_order_drafts")
        .select("*")
        .eq("conversation_id", conversation.id)
        .in("status", ACTIVE_DRAFT_STATUSES)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (contactResult.error) throw new Error(`contact_lookup_failed:${contactResult.error.message}`);
    if (messagesResult.error) throw new Error(`messages_lookup_failed:${messagesResult.error.message}`);
    if (factsResult.error) throw new Error(`facts_lookup_failed:${factsResult.error.message}`);
    if (batchResult.error) throw new Error(`batch_lookup_failed:${batchResult.error.message}`);
    if (draftResult.error) throw new Error(`draft_lookup_failed:${draftResult.error.message}`);

    const contact = contactResult.data;
    const recentMessages = [...(messagesResult.data ?? [])].reverse();
    const facts = Object.fromEntries((factsResult.data ?? []).map((fact: any) => [fact.fact_key, fact.fact_value]));
    const batch = batchResult.data;
    const existingDraft = draftResult.data;
    let existingItems: DraftItem[] = [];
    if (existingDraft?.id) {
      const { data, error } = await db
        .from("instagram_order_draft_items")
        .select("item_kind,item_key,item_name,quantity,unit_price,metadata")
        .eq("draft_id", existingDraft.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`draft_items_lookup_failed:${error.message}`);
      existingItems = (data ?? []) as DraftItem[];
    }

    const latestMessage = text(triggeringMessage.text_content);
    const preflightExtraction = claimed.facts_used?.preflight_extraction ?? null;
    const preflightSales = claimed.facts_used?.preflight_sales ?? null;
    const hasReusablePreflight = Boolean(
      preflightExtraction &&
      preflightSales &&
      typeof preflightExtraction === "object" &&
      typeof preflightSales === "object" &&
      preflightExtraction.order_patch &&
      typeof preflightSales.stage === "string" &&
      typeof preflightSales.action === "string"
    );

    const extraction = hasReusablePreflight
      ? {
          ...preflightExtraction,
          buyer_signal: preflightSales.buyerSignal ?? preflightExtraction.buyer_signal ?? "interested",
          sales_stage: preflightSales.stage,
          next_best_action: preflightSales.action,
          handoff_reason: preflightSales.handoffReason ?? preflightExtraction.handoff_reason ?? null,
        } as Extraction
      : await callOpenAI({
          apiKey: openaiKey,
          model,
          input: {
            LATEST_INBOUND_MESSAGE: {
              text: latestMessage,
              has_attachments:
                Array.isArray(triggeringMessage.attachments) &&
                triggeringMessage.attachments.length > 0,
            },
            RECENT_MESSAGES: recentMessages,
            CURRENT_ORDER_DRAFT: existingDraft
              ? { ...existingDraft, items: existingItems }
              : null,
            CURRENT_AI_CLASSIFICATION: {
              intent: claimed.intent,
              language: claimed.language,
              confidence: claimed.confidence,
              proposed_messages: claimed.proposed_messages,
            },
            LIVE_FACTS: {
              packs: facts.packs ?? [],
              bagel_flavors: facts.bagel_flavors ?? [],
              schmears: facts.schmears ?? [],
              delivery_pricing: facts.delivery_pricing ?? null,
              payment_policy: facts.payment_policy ?? null,
              current_batch: batch ?? null,
            },
          },
        });

    const patch = extraction.order_patch;
    const mergedItems = mergeItems(existingItems, patch);
    const mergedDraft: JsonRecord = {
      ...(existingDraft ?? {}),
      pack_slug: mergeScalar(existingDraft?.pack_slug, patch.pack_slug),
      pack_name: mergeScalar(existingDraft?.pack_name, patch.pack_name),
      units: mergeScalar(existingDraft?.units, patch.units),
      customer_name: mergeScalar(existingDraft?.customer_name, patch.customer_name),
      phone: mergeScalar(existingDraft?.phone, patch.phone),
      email: mergeScalar(existingDraft?.email, patch.email),
      district: mergeScalar(existingDraft?.district, patch.district),
      delivery_address: mergeScalar(existingDraft?.delivery_address, patch.address),
      address_reference: mergeScalar(existingDraft?.address_reference, patch.address_reference),
      delivery_notes: mergeScalar(existingDraft?.delivery_notes, patch.delivery_notes),
      requested_delivery_at: mergeScalar(existingDraft?.requested_delivery_at, parseDate(patch.requested_date)),
      custom_request: mergeScalar(existingDraft?.custom_request, patch.custom_request),
      sales_stage: existingDraft?.sales_stage ?? extraction.sales_stage,
    };

    const bagelQuantity = mergedItems
      .filter((item) => item.item_kind === "bagel")
      .reduce((total, item) => total + item.quantity, 0);
    if (!numberOrNull(mergedDraft.units) && [6, 12].includes(bagelQuantity)) {
      mergedDraft.units = bagelQuantity;
    }

    const currentPaymentStatus = text(existingDraft?.payment_status) || "none";
    const hasInboundAttachment = Array.isArray(triggeringMessage.attachments) && triggeringMessage.attachments.length > 0;
    const paymentEvidence =
      currentPaymentStatus !== "confirmed" &&
      claimed.intent === "payment_confirmation" &&
      (hasInboundAttachment || extraction.payment_evidence_claimed);
    const paymentStatus = currentPaymentStatus === "confirmed"
      ? "confirmed"
      : paymentEvidence
        ? "evidence_received"
        : currentPaymentStatus;
    const handoffReason = deterministicHandoff({
      intent: text(claimed.intent),
      latestMessage,
      confidence: numberOrNull(claimed.confidence),
      extraction,
      customRequest: text(mergedDraft.custom_request) || null,
    });
    const quote = calculateQuote({
      draft: mergedDraft,
      items: mergedItems,
      facts,
      handoffReason,
    });

    if (quote.pack) {
      mergedDraft.pack_slug = quote.pack.slug;
      mergedDraft.pack_name = quote.pack.name;
      mergedDraft.units = Number(quote.pack.units);
    }

    const state = stageAndAction({
      intent: text(claimed.intent),
      latestMessage,
      draft: mergedDraft,
      items: mergedItems,
      paymentStatus,
      quoteVerified: quote.verified,
      quoteSent: Boolean(existingDraft?.quote_sent_at),
      handoffReason,
    });
    const objectionType = classifyObjection(latestMessage) !== "none"
      ? classifyObjection(latestMessage)
      : (OBJECTION_TYPES.includes(extraction.objection_type as any) ? extraction.objection_type : "none");
    const signal = buyerSignal({
      modelSignal: extraction.buyer_signal,
      stage: state.stage,
      objection: objectionType,
      handoffReason,
      paymentStatus,
    });
    const missing = missingFields(mergedDraft, mergedItems);
    const voice = scoreVoice(claimed.proposed_messages);

    const { data: existingLead, error: leadLookupError } = await db
      .from("instagram_leads")
      .select("*")
      .eq("contact_id", contact.id)
      .maybeSingle();
    if (leadLookupError) throw new Error(`lead_lookup_failed:${leadLookupError.message}`);

    let lead: any;
    if (existingLead) {
      const { data, error } = await db
        .from("instagram_leads")
        .update({
          current_sales_stage: state.stage,
          buyer_signal: signal,
          first_intent: existingLead.first_intent || claimed.intent,
          last_intent: claimed.intent,
          preferred_language: claimed.language || contact.detected_language,
          last_seen_at: triggeringMessage.sent_at || new Date().toISOString(),
        })
        .eq("id", existingLead.id)
        .select("*")
        .single();
      if (error) throw new Error(`lead_update_failed:${error.message}`);
      lead = data;
    } else {
      const { data, error } = await db
        .from("instagram_leads")
        .insert({
          contact_id: contact.id,
          status: "active",
          current_sales_stage: state.stage,
          buyer_signal: signal,
          first_intent: claimed.intent,
          last_intent: claimed.intent,
          preferred_language: claimed.language || contact.detected_language,
          first_seen_at: contact.first_seen_at || new Date().toISOString(),
          last_seen_at: triggeringMessage.sent_at || new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(`lead_insert_failed:${error.message}`);
      lead = data;
    }

    const shouldCreateDraft = Boolean(
      existingDraft ||
      SALES_RELEVANT_INTENTS.has(text(claimed.intent)) ||
      mergedItems.length ||
      text(mergedDraft.custom_request),
    );

    let savedDraft: any = null;
    if (shouldCreateDraft) {
      const metadata = {
        ...(existingDraft?.metadata ?? {}),
        latest_ai_run_id: claimed.id,
        latest_message_id: triggeringMessage.id,
        model_sales_stage: extraction.sales_stage,
        model_next_best_action: extraction.next_best_action,
        model_objection_type: extraction.objection_type,
        quote_calculation: quote,
        voice: { score: voice.score, pass: voice.pass, issues: voice.issues },
      };
      const draftPayload = {
        conversation_id: conversation.id,
        contact_id: contact.id,
        lead_id: lead.id,
        batch_id: existingDraft?.batch_id || batch?.id || null,
        source_message_id: triggeringMessage.id,
        last_ai_run_id: claimed.id,
        sales_stage: state.stage,
        buyer_signal: signal,
        status: statusFor(state.stage, Boolean(existingDraft?.quote_sent_at)),
        pack_slug: text(mergedDraft.pack_slug) || null,
        pack_name: text(mergedDraft.pack_name) || null,
        units: numberOrNull(mergedDraft.units),
        customer_name: text(mergedDraft.customer_name) || null,
        phone: text(mergedDraft.phone) || null,
        email: text(mergedDraft.email) || null,
        district: text(mergedDraft.district) || null,
        delivery_address: text(mergedDraft.delivery_address) || null,
        address_reference: text(mergedDraft.address_reference) || null,
        delivery_notes: text(mergedDraft.delivery_notes) || null,
        requested_delivery_at: parseDate(mergedDraft.requested_delivery_at),
        custom_request: text(mergedDraft.custom_request) || null,
        items_subtotal: quote.itemsSubtotal,
        schmears_subtotal: quote.schmearsSubtotal,
        delivery_fee: quote.deliveryFee,
        total_amount: quote.total,
        quote_verified: quote.verified,
        payment_method: existingDraft?.payment_method || facts.payment_policy?.method || null,
        payment_status: paymentStatus,
        payment_evidence_path: paymentEvidence
          ? (existingDraft?.payment_evidence_path || `instagram-message:${triggeringMessage.id}`)
          : existingDraft?.payment_evidence_path || null,
        payment_evidence_received_at: paymentEvidence
          ? (existingDraft?.payment_evidence_received_at || new Date().toISOString())
          : existingDraft?.payment_evidence_received_at || null,
        handoff_reason: handoffReason,
        handoff_at: handoffReason
          ? (existingDraft?.handoff_at || new Date().toISOString())
          : existingDraft?.handoff_at || null,
        metadata,
      };

      if (existingDraft) {
        const { data, error } = await db
          .from("instagram_order_drafts")
          .update(draftPayload)
          .eq("id", existingDraft.id)
          .select("*")
          .single();
        if (error) throw new Error(`draft_update_failed:${error.message}`);
        savedDraft = data;
      } else {
        const { data, error } = await db
          .from("instagram_order_drafts")
          .insert(draftPayload)
          .select("*")
          .single();
        if (error) throw new Error(`draft_insert_failed:${error.message}`);
        savedDraft = data;
      }

      const itemPayload = mergedItems.map((item) => ({
        item_kind: item.item_kind,
        item_key: item.item_key,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        metadata: item.metadata ?? {},
      }));
      const { error: itemError } = await db.rpc("replace_instagram_order_draft_items", {
        p_draft_id: savedDraft.id,
        p_items: itemPayload,
      });
      if (itemError) throw new Error(`draft_items_replace_failed:${itemError.message}`);
    }

    if (handoffReason) {
      await db
        .from("instagram_conversations")
        .update({ mode: "human_active", updated_at: new Date().toISOString() })
        .eq("id", conversation.id);
    }

    const { error: eventError } = await db
      .from("instagram_sales_events")
      .insert({
        conversation_id: conversation.id,
        lead_id: lead.id,
        draft_id: savedDraft?.id ?? null,
        message_id: triggeringMessage.id,
        ai_run_id: claimed.id,
        event_type: "sales_enriched",
        from_stage: existingDraft?.sales_stage ?? existingLead?.current_sales_stage ?? null,
        to_stage: state.stage,
        actor: "system",
        payload: {
          buyer_signal: signal,
          next_best_action: state.action,
          missing_fields: missing,
          objection_type: objectionType,
          handoff_reason: handoffReason,
          order_patch: patch,
          quote,
          voice,
        },
      });
    if (eventError) throw new Error(`sales_event_failed:${eventError.message}`);

    const ghlPayload = buildGhlPayload({
      lead,
      contact,
      draft: savedDraft,
      items: mergedItems,
      stage: state.stage,
      action: state.action,
      handoffReason,
      paymentPolicy: facts.payment_policy,
      batch,
      ghlConfig: facts.ghl_crm_config,
    });
    const crmSyncEnabled = Boolean(ghlPayload);
    if (crmSyncEnabled && ghlPayload) {
      const queueEntityType = savedDraft ? "opportunity" : "contact";
      const queueEntityId = savedDraft?.id ?? lead.id;
      const queueVersion = savedDraft?.version ?? lead.version ?? 1;
      const { error: queueError } = await db.rpc("enqueue_instagram_crm_sync", {
        p_entity_type: queueEntityType,
        p_entity_id: queueEntityId,
        p_operation: "upsert",
        p_entity_version: queueVersion,
        p_payload: ghlPayload,
      });
      if (queueError) throw new Error(`crm_queue_failed:${queueError.message}`);
    }

    const { error: runUpdateError } = await db
      .from("instagram_ai_runs")
      .update({
        sales_enrichment_status: "completed",
        sales_enriched_at: new Date().toISOString(),
        buyer_signal: signal,
        sales_stage: state.stage,
        next_best_action: state.action,
        missing_fields: missing,
        objection_type: objectionType,
        handoff_reason: handoffReason,
        order_patch: patch,
        voice_score: voice.score,
        voice_pass: voice.pass,
      })
      .eq("id", claimed.id);
    if (runUpdateError) throw new Error(`run_update_failed:${runUpdateError.message}`);

    if (crmSyncEnabled) {
      fetch(`${supabaseUrl}/functions/v1/instagram-ghl-sync`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 5 }),
      }).catch((error) => console.error("ghl_worker_invoke_failed", error));
    }

    return respond({
      ok: true,
      aiRunId: claimed.id,
      leadId: lead.id,
      draftId: savedDraft?.id ?? null,
      salesStage: state.stage,
      nextBestAction: state.action,
      buyerSignal: signal,
      missingFields: missing,
      objectionType,
      handoffReason,
      quoteVerified: quote.verified,
      voiceScore: voice.score,
      voicePass: voice.pass,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .from("instagram_ai_runs")
      .update({
        sales_enrichment_status: "error",
        error_message: `sales_enrichment:${message.slice(0, 1500)}`,
      })
      .eq("id", aiRunId);
    console.error("instagram_sales_enrichment_failed", message);
    return respond({ ok: false, error: "sales_enrichment_failed" }, 500);
  }
});
