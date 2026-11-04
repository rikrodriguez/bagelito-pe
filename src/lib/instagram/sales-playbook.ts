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
  version: "bagelito-sales-2026-11-04-v2",
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
      clarify: "If the blocker is already explicit, answer directly. Clarify only when you genuinely cannot tell whether the concern is total budget, pack size or value.",
      allowed: [
        "State the relevant live price clearly.",
        "Compare approved live pack sizes or single-flavor versus mixed.",
        "Recommend the smallest approved option that fits the customer's stated need.",
      ],
      forbidden: [
        "Invent a discount.",
        "Pressure the customer.",
        "Argue about affordability.",
        "Ask another question when the price question can be answered directly from live facts.",
      ],
      resumeAction: "recommend_pack",
    },
    minimum_order: {
      clarify: "Confirm quantity only if it is not already stated.",
      allowed: ["State the live minimum order.", "Offer only approved live alternatives if they exist."],
      forbidden: ["Promise a smaller custom quantity or exception without approval."],
      resumeAction: "recommend_pack",
    },
    availability: {
      clarify: "Ask which product and date matter.",
      allowed: ["Use current batch and inventory facts."],
      forbidden: ["Promise stock or a delivery date that is not confirmed."],
      resumeAction: "ask_quantity_flavors",
    },
    delivery: {
      clarify: "If district is missing, ask for it. If district is known, answer the fee/coverage directly without another diagnostic question.",
      allowed: ["Use the live delivery calculator or approved fee.", "Then move to the next unresolved order decision."],
      forbidden: ["Guess a fee or promise an exception.", "Ask for a district the customer already supplied."],
      resumeAction: "ask_contact_delivery",
    },
    timing: {
      clarify: "Ask for a date/deadline only when it is not already explicit. Otherwise answer feasibility from current batch/schedule facts first.",
      allowed: ["Use the current batch delivery window.", "Offer only approved current alternatives."],
      forbidden: ["Promise rush production without approval.", "Copy historical one-off timing exceptions into current policy."],
      resumeAction: "ask_quantity_flavors",
    },
    choice_overload: {
      clarify: "If preference is unknown, ask one preference such as sweet, savory or mix.",
      allowed: ["Recommend 2–3 live options matched to the stated preference."],
      forbidden: ["Repeat the full catalog when a focused recommendation is enough.", "Ask multiple preference questions in the same turn."],
      resumeAction: "ask_quantity_flavors",
    },
    trust: {
      clarify: "Identify whether the concern is freshness, quality, delivery or payment.",
      allowed: ["Explain only verified Bagelito process facts."],
      forbidden: ["Invent reviews, guarantees or claims."],
      resumeAction: "ask_quantity_flavors",
    },
    custom_request: {
      clarify: "Capture only the minimum context needed for Dawn to assess feasibility; do not turn it into a full order before approval.",
      allowed: ["Acknowledge the request and route for feasibility review.", "Resume the normal flow only after explicit human resolution."],
      forbidden: ["Promise that Bagelito can produce it.", "Quote an unapproved custom price."],
      resumeAction: "handoff",
    },
    other: {
      clarify: "Ask one short question to identify the actual blocker.",
      allowed: ["Answer from live facts after the blocker is clear."],
      forbidden: ["Launch into a generic sales pitch."],
      resumeAction: "answer_question",
    },
  },
  historicalExceptionRule: "Historical discounts, 50/50 payment arrangements, rush production, free extras and special delivery exceptions are examples of Dawn's human flexibility, not reusable policy. They always require current live approval.",
  objectionEvidence: {
    source: "Bagelito Instagram historical corpus; heuristic and non-causal",
    frictionEventsAnalyzed: 606,
    paymentAdvancePct: 41.5,
    priceAdvancePct: 36.4,
    deliveryAdvancePct: 22.9,
    timingAdvancePct: 23.8,
    choiceAdvancePct: 25.0,
    customAdvancePct: 22.6,
    changeAdvancePct: 28.6,
    note: "Directly resolving a known blocker often worked better than adding clarification questions; samples vary greatly by category and are not causal benchmarks.",
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
