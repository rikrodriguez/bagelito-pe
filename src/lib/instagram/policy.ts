export const instagramIntentRisk = {
  menu: "auto",
  price: "auto",
  flavors: "auto",
  product_photo: "auto",
  batch_status: "auto",
  delivery_area: "auto",
  how_to_order: "auto",
  storage: "auto",
  reheating: "auto",
  ingredient_question: "review",
  vegan_request: "review",
  order_status: "review",
  payment_confirmation: "review",
  address_change: "review",
  custom_order: "review",
  catering: "review",
  collaboration: "review",
  discount_exception: "review",
  complaint: "human",
  refund: "human",
  missing_item: "human",
  damaged_order: "human",
  food_safety: "human",
  allergy: "human",
  payment_dispute: "human",
  fraud: "human",
} as const;

export type InstagramIntent = keyof typeof instagramIntentRisk;
export type InstagramRiskMode = (typeof instagramIntentRisk)[InstagramIntent];

export type InstagramLanguage = "es" | "en" | "mixed" | "unknown";

export function getIntentRisk(intent: string | null | undefined): InstagramRiskMode {
  if (!intent) return "review";
  return instagramIntentRisk[intent as InstagramIntent] ?? "review";
}

export function shouldAutoSend(intent: string | null | undefined, confidence: number): boolean {
  return getIntentRisk(intent) === "auto" && confidence >= 0.92;
}

export function chooseReplyLanguage(
  currentMessageLanguage: InstagramLanguage,
  conversationLanguage: InstagramLanguage,
): InstagramLanguage {
  if (currentMessageLanguage !== "unknown") return currentMessageLanguage;
  if (conversationLanguage !== "unknown") return conversationLanguage;
  return "unknown";
}

export const bagelitoConversationGuardrails = {
  always: [
    "Answer in the customer's current conversational language.",
    "Treat Spanish and English as native Bagelito voices, not literal translations.",
    "Answer the customer's question before moving toward a sale.",
    "Prefer short conversational turns unless confirming an order or operational detail.",
    "Use current Bagelito data for prices, availability, dates, delivery, products, and order state.",
    "Use only approved real Bagelito media assets.",
    "Escalate rather than invent facts.",
  ],
  never: [
    "Do not use menu-button chatbot language unless a customer explicitly asks for options.",
    "Do not start every conversation with a generic customer-service greeting.",
    "Do not claim a payment, order, delivery, or exception is confirmed without live data or human approval.",
    "Do not auto-handle complaints, refunds, food-safety issues, allergies, or payment disputes.",
    "Do not generate product images as substitutes for approved Bagelito photos.",
  ],
} as const;
