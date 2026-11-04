export const SALES_STAGES = [
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

export type SalesStage = (typeof SALES_STAGES)[number];

export const NEXT_SALES_ACTIONS = [
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

export type NextSalesAction = (typeof NEXT_SALES_ACTIONS)[number];

export const OBJECTION_TYPES = [
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

export type ObjectionType = (typeof OBJECTION_TYPES)[number];

export const ORDER_FIELDS = [
  "pack",
  "items",
  "customer_name",
  "phone",
  "district",
  "address",
  "delivery_date",
  "payment_evidence",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

export const HANDOFF_REASONS = [
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

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type PaymentPolicy = {
  method: "yape" | "checkout";
  displayName: string;
  destination: string;
  holderName?: string | null;
  proofRequired: boolean;
  confirmationMode: "human_or_system";
  active: boolean;
};

export const BAGELITO_SALES_PLAYBOOK = {
  version: "bagelito-sales-2026-11-03-v1",
  goal: "Help the customer make one clear next decision while preserving Dawn's natural voice.",
  maximumQuestionsPerTurn: 1,
  principles: [
    "Answer the newest customer question before resuming an earlier sales step.",
    "Use progressive disclosure instead of requesting every order field at once.",
    "Ask one manageable question that moves the order forward.",
    "Use live menu, price, batch, delivery and payment facts only.",
    "Never treat payment evidence as confirmed payment.",
    "Never decide custom feasibility, compensation or exceptions automatically.",
  ],
  objectionLoop: [
    "acknowledge",
    "clarify",
    "answer_from_live_facts",
    "check_resolution",
    "resume_smallest_next_step",
  ],
  objectionGuidance: {
    price: {
      clarify: "Find out whether total budget, pack size or perceived value is the real concern.",
      allowed: [
        "Explain the relevant live pack options.",
        "Help compare pack sizes or single-flavor versus mixed.",
        "Recommend the smallest approved option that fits the customer's need.",
      ],
      forbidden: ["Invent a discount.", "Pressure the customer.", "Argue about affordability."],
      resumeAction: "recommend_pack",
    },
    minimum_order: {
      clarify: "Confirm the quantity the customer actually needs.",
      allowed: ["State the live minimum order.", "Offer approved alternatives if they exist."],
      forbidden: ["Promise an exception without approval."],
      resumeAction: "recommend_pack",
    },
    availability: {
      clarify: "Ask which product and date matter.",
      allowed: ["Use current batch and inventory facts."],
      forbidden: ["Promise stock or a delivery date that is not confirmed."],
      resumeAction: "ask_quantity_flavors",
    },
    delivery: {
      clarify: "Ask for the district before quoting delivery.",
      allowed: ["Use the live delivery calculator or approved fee."],
      forbidden: ["Guess a fee or promise an exception."],
      resumeAction: "ask_contact_delivery",
    },
    timing: {
      clarify: "Ask which date or deadline the customer needs.",
      allowed: ["Use the current batch delivery window."],
      forbidden: ["Promise rush production without approval."],
      resumeAction: "ask_quantity_flavors",
    },
    choice_overload: {
      clarify: "Ask whether the customer prefers sweet, savory or a balanced mix.",
      allowed: ["Recommend a small live set of suitable flavors."],
      forbidden: ["Repeat the full catalog when a focused recommendation is enough."],
      resumeAction: "ask_quantity_flavors",
    },
    trust: {
      clarify: "Identify whether the concern is freshness, quality, delivery or payment.",
      allowed: ["Explain only verified Bagelito process facts."],
      forbidden: ["Invent reviews, guarantees or claims."],
      resumeAction: "ask_quantity_flavors",
    },
    custom_request: {
      clarify: "Capture the requested design, quantity and needed date.",
      allowed: ["Acknowledge and route for feasibility review."],
      forbidden: ["Promise that Bagelito can produce it."],
      resumeAction: "handoff",
    },
    other: {
      clarify: "Ask one short question to identify the actual blocker.",
      allowed: ["Answer from live facts after the blocker is clear."],
      forbidden: ["Launch into a generic sales pitch."],
      resumeAction: "answer_question",
    },
  },
  payment: {
    requestCopy: "Te confirmo el total y te paso el método de pago vigente. Cuando puedas, me mandas la captura 😊",
    evidenceCopy: "Perfecto, recibí la captura 😊 La voy a verificar antes de confirmar tu pedido.",
    rule: "Payment evidence moves the order to verification, never directly to confirmed.",
  },
} as const;

export function formatManualPaymentRequest(policy: PaymentPolicy, totalPEN: number) {
  if (!policy.active) {
    throw new Error("bagelito_payment_policy_inactive");
  }
  if (!Number.isFinite(totalPEN) || totalPEN <= 0) {
    throw new Error("bagelito_payment_total_invalid");
  }

  const holder = policy.holderName ? `, a nombre de ${policy.holderName}` : "";
  return [
    `Total: S/. ${totalPEN.toFixed(2).replace(/\.00$/, "")}`,
    `Puedes pagar por ${policy.displayName} al ${policy.destination}${holder}.`,
    policy.proofRequired
      ? "Cuando puedas, mándame la captura para verificar y confirmar tu pedido 😊"
      : "Te confirmo apenas el pago figure como aprobado 😊",
  ].join("\n\n");
}
