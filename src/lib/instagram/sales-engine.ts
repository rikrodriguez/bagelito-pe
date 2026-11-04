import {
  BAGELITO_SALES_PLAYBOOK,
  type HandoffReason,
  type NextSalesAction,
  type ObjectionType,
  type OrderField,
  type SalesStage,
} from "./sales-playbook.js";

export type OrderLine = {
  key: string;
  name: string;
  quantity: number;
  unitPrice?: number;
};

export type OrderDraftPatch = {
  packSlug?: string | null;
  packName?: string | null;
  units?: number | null;
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
  district?: string | null;
  address?: string | null;
  addressReference?: string | null;
  deliveryNotes?: string | null;
  requestedDate?: string | null;
  customRequest?: string | null;
  items?: OrderLine[];
  schmears?: OrderLine[];
};

export type OrderDraftSnapshot = OrderDraftPatch & {
  status?: string | null;
};

export type SalesContext = {
  latestMessage: string;
  intent?: string | null;
  confidence?: number | null;
  currentStage?: SalesStage | null;
  order: OrderDraftSnapshot;
  quote?: {
    verified: boolean;
    sent: boolean;
    subtotal?: number | null;
    deliveryFee?: number | null;
    total?: number | null;
    currency?: "PEN" | null;
  } | null;
  payment?: {
    status: "none" | "pending" | "evidence_received" | "confirmed";
  } | null;
  customerRequestedHuman?: boolean;
  repeatedMisunderstandingCount?: number;
  conflictingData?: boolean;
};

export type HandoffDecision = {
  handoff: boolean;
  reason: HandoffReason | null;
};

export type SalesActionPlan = {
  stage: SalesStage;
  action: NextSalesAction;
  missingFields: OrderField[];
  objectionType: ObjectionType;
  resumeAction: NextSalesAction | null;
  handoffReason: HandoffReason | null;
  requiresHumanVerification: boolean;
  maximumQuestions: 1;
};

const HIGH_RISK_INTENT_REASONS: Record<string, HandoffReason> = {
  complaint: "complaint",
  refund: "refund",
  missing_item: "missing_or_damaged_order",
  damaged_order: "missing_or_damaged_order",
  food_safety: "food_safety",
  allergy: "allergy",
  payment_dispute: "payment_dispute",
  payment_exception: "payment_exception",
  fraud: "fraud",
  custom_order: "custom_feasibility",
  discount_exception: "discount_exception",
};

const CUSTOM_REQUEST_PATTERN =
  /\b(birthday|cumplea[nñ]os|cumple|custom|personaliz|forma especial|shape|color especial|logo|tem[aá]tico)\b/i;
const HUMAN_REQUEST_PATTERN =
  /\b(humano|persona real|hablar con (alguien|una persona)|asesor|Dawn|human|real person|talk to someone)\b/i;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("es").replace(/\s+/g, "-");
}

function mergeLines(current: OrderLine[] = [], patch: OrderLine[] = []) {
  const merged = new Map<string, OrderLine>();
  const order: string[] = [];

  for (const line of current) {
    const key = normalizeKey(line.key || line.name);
    if (!key) continue;
    merged.set(key, { ...line, key: line.key || key });
    order.push(key);
  }

  for (const line of patch) {
    const key = normalizeKey(line.key || line.name);
    if (!key || !Number.isFinite(line.quantity)) continue;

    if (line.quantity <= 0) {
      merged.delete(key);
      continue;
    }

    if (!merged.has(key)) order.push(key);
    merged.set(key, {
      ...merged.get(key),
      ...line,
      key: line.key || key,
      name: cleanText(line.name) || merged.get(key)?.name || key,
      quantity: line.quantity,
    });
  }

  return order.filter((key) => merged.has(key)).map((key) => merged.get(key)!);
}

export function mergeOrderPatch(
  current: OrderDraftSnapshot,
  patch: OrderDraftPatch,
): OrderDraftSnapshot {
  const merged: OrderDraftSnapshot = { ...current };
  const scalarKeys: Array<keyof Omit<OrderDraftPatch, "items" | "schmears">> = [
    "packSlug",
    "packName",
    "units",
    "customerName",
    "phone",
    "email",
    "district",
    "address",
    "addressReference",
    "deliveryNotes",
    "requestedDate",
    "customRequest",
  ];

  for (const key of scalarKeys) {
    const value = patch[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    (merged as Record<string, unknown>)[key] = value;
  }

  if (patch.items) merged.items = mergeLines(current.items, patch.items);
  if (patch.schmears) merged.schmears = mergeLines(current.schmears, patch.schmears);

  return merged;
}

export function getMissingOrderFields(order: OrderDraftSnapshot): OrderField[] {
  const missing: OrderField[] = [];
  if (!order.items?.some((item) => item.quantity > 0)) missing.push("items");
  if (!cleanText(order.customerName)) missing.push("customer_name");
  if (!cleanText(order.phone)) missing.push("phone");
  if (!cleanText(order.district)) missing.push("district");
  if (!cleanText(order.address)) missing.push("address");
  return missing;
}

export function classifyObjection(message: string): ObjectionType {
  const text = message.trim();
  if (!text) return "none";
  if (CUSTOM_REQUEST_PATTERN.test(text)) return "custom_request";
  if (/\b(caro|car[ií]simo|presupuesto|barato|descuento|price|expensive|budget|cheaper)\b/i.test(text)) {
    return "price";
  }
  if (/\b(menos de 6|solo [1-5]\b|minimum|minimo|mínimo|individual)\b/i.test(text)) {
    return "minimum_order";
  }
  if (/\b(disponible|stock|queda|available|sold out|agotad)\b/i.test(text)) {
    return "availability";
  }
  if (/\b(delivery|env[ií]o|distrito|recojo|pickup|deliver)\b/i.test(text)) {
    return "delivery";
  }
  if (/\b(hoy|ma[nñ]ana|urgente|fecha|hora|cuando|cuándo|today|tomorrow|urgent|when)\b/i.test(text)) {
    return "timing";
  }
  if (/\b(no s[eé] cu[aá]l|recomienda|recomiendas|cu[aá]l elijo|too many|recommend)\b/i.test(text)) {
    return "choice_overload";
  }
  if (/\b(fresco|calidad|seguro|confianza|real|fresh|quality|trust)\b/i.test(text)) {
    return "trust";
  }
  return "none";
}

export function shouldHandoff(context: SalesContext): HandoffDecision {
  const intent = context.intent ?? "";
  const highRiskReason = HIGH_RISK_INTENT_REASONS[intent];
  if (highRiskReason) return { handoff: true, reason: highRiskReason };

  if (CUSTOM_REQUEST_PATTERN.test(context.latestMessage)) {
    return { handoff: true, reason: "custom_feasibility" };
  }
  if (context.customerRequestedHuman || HUMAN_REQUEST_PATTERN.test(context.latestMessage)) {
    return { handoff: true, reason: "customer_requested_human" };
  }
  if ((context.repeatedMisunderstandingCount ?? 0) >= 2) {
    return { handoff: true, reason: "repeated_misunderstanding" };
  }
  if (context.conflictingData) {
    return { handoff: true, reason: "conflicting_data" };
  }
  if (typeof context.confidence === "number" && context.confidence < 0.78) {
    return { handoff: true, reason: "low_confidence" };
  }

  return { handoff: false, reason: null };
}

function stageFromOperationalStatus(status: string | null | undefined): SalesStage | null {
  switch (status) {
    case "payment_confirmed":
      return "confirmed";
    case "in_production":
      return "production";
    case "ready_for_delivery":
      return "delivery";
    case "delivered":
      return "completed";
    case "cancelled":
      return "lost";
    default:
      return null;
  }
}

export function classifySalesStage(context: SalesContext): SalesStage {
  const handoff = shouldHandoff(context);
  if (handoff.handoff) return "human_review";

  const operationalStage = stageFromOperationalStatus(context.order.status);
  if (operationalStage) return operationalStage;

  if (context.payment?.status === "confirmed") return "confirmed";
  if (context.payment?.status === "evidence_received") return "payment_evidence_received";
  if (context.quote?.sent) return "payment_pending";

  const missing = getMissingOrderFields(context.order);
  const hasItems = !missing.includes("items");
  if (hasItems && missing.length === 0) return "quote_ready";
  if (hasItems) return "details_collection";
  if (context.order.units || cleanText(context.order.packSlug)) return "order_configuration";

  if (["menu", "flavors", "price", "product_photo", "how_to_order"].includes(context.intent ?? "")) {
    return "menu_discovery";
  }
  if (/\b(recomienda|recomiendas|recommend|dulce|salado|sweet|savory)\b/i.test(context.latestMessage)) {
    return "recommendation";
  }

  return context.currentStage ?? "new_inquiry";
}

function actionForStage(stage: SalesStage, context: SalesContext): NextSalesAction {
  switch (stage) {
    case "menu_discovery":
      return ["menu", "flavors", "price", "product_photo"].includes(context.intent ?? "")
        ? "send_menu"
        : "ask_quantity_flavors";
    case "recommendation":
      return "recommend_pack";
    case "order_configuration":
      return "ask_quantity_flavors";
    case "details_collection":
      return "ask_contact_delivery";
    case "quote_ready":
      return context.quote?.verified ? "quote_order" : "wait";
    case "payment_pending":
      return "request_payment";
    case "payment_evidence_received":
      return "acknowledge_payment_evidence";
    case "confirmed":
    case "production":
    case "delivery":
      return "confirm_fulfillment";
    case "completed":
    case "lost":
      return "wait";
    case "human_review":
      return "handoff";
    case "new_inquiry":
    default:
      return "answer_question";
  }
}

export function planNextSalesAction(context: SalesContext): SalesActionPlan {
  const handoff = shouldHandoff(context);
  if (handoff.handoff) {
    return {
      stage: "human_review",
      action: "handoff",
      missingFields: getMissingOrderFields(context.order),
      objectionType: classifyObjection(context.latestMessage),
      resumeAction: null,
      handoffReason: handoff.reason,
      requiresHumanVerification: true,
      maximumQuestions: 1,
    };
  }

  const objectionType = classifyObjection(context.latestMessage);
  if (objectionType !== "none") {
    const guidance = BAGELITO_SALES_PLAYBOOK.objectionGuidance[objectionType];
    return {
      stage: classifySalesStage(context),
      action: "handle_objection",
      missingFields: getMissingOrderFields(context.order),
      objectionType,
      resumeAction: guidance.resumeAction as NextSalesAction,
      handoffReason: null,
      requiresHumanVerification: false,
      maximumQuestions: 1,
    };
  }

  const stage = classifySalesStage(context);
  return {
    stage,
    action: actionForStage(stage, context),
    missingFields: getMissingOrderFields(context.order),
    objectionType: "none",
    resumeAction: null,
    handoffReason: null,
    requiresHumanVerification: stage === "payment_evidence_received",
    maximumQuestions: 1,
  };
}
