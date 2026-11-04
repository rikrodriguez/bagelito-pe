export type BagelitoSalesStage =
  | "new_inquiry" | "menu_discovery" | "recommendation" | "order_configuration"
  | "details_collection" | "quote_ready" | "payment_pending"
  | "payment_evidence_received" | "confirmed" | "production" | "delivery"
  | "completed" | "lost" | "human_review";

export type BagelitoSalesAction =
  | "answer_question" | "send_menu" | "recommend_pack" | "ask_quantity_flavors"
  | "ask_contact_delivery" | "summarize_order" | "quote_order" | "request_payment"
  | "acknowledge_payment_evidence" | "handle_objection" | "handoff" | "wait"
  | "confirm_fulfillment";

export type BagelitoPaymentStatus =
  | "none" | "pending" | "evidence_received" | "confirmed" | "failed" | "refunded";

export type SalesTurnIssueCode =
  | "empty_reply" | "too_many_questions" | "latest_question_not_answered"
  | "missing_next_step" | "live_facts_insufficient"
  | "payment_before_verified_quote" | "payment_confirmation_requires_verification"
  | "human_handoff_required" | "overselling_after_close";

export type SalesTurnContext = {
  messages: string[];
  stage: BagelitoSalesStage;
  action: BagelitoSalesAction;
  latestQuestionAnswered: boolean;
  liveFactsSufficient: boolean;
  quoteVerified: boolean;
  paymentStatus: BagelitoPaymentStatus;
  handoffReason: string | null;
};

const NEXT_STEP_PATTERN = /\b(me avisas|te aviso|solo necesito|te confirmo|m[aá]ndame|env[ií]ame|dime|cu[eé]ntame|puedes mandarme|let me know|send me|tell me|which do you prefer|what do you prefer|how many|qu[eé] prefieres|cu[aá]ntos|cu[aá]ntas|cu[aá]l prefieres|cu[aá]les prefieres)\b/i;
const AUTO_HOLD_STAGES = new Set<BagelitoSalesStage>(["human_review","payment_evidence_received"]);
const NO_NEXT_STEP_REQUIRED = new Set<BagelitoSalesStage>(["confirmed","production","delivery","completed","lost","human_review","payment_evidence_received"]);

export const BAGELITO_CHAT_SALES_SKILL = {
  version: "bagelito-chat-sales-2026-11-04-v2",
  channelScope: ["instagram", "whatsapp"] as const,
  goal: "Sell through helpful conversation: answer what the customer just asked, reduce uncertainty, and move exactly one decision forward without sounding scripted.",
  maximumQuestionsPerTurn: 1,
  principles: [
    "latest_question_first",
    "one_clear_next_decision",
    "progressive_disclosure",
    "diagnose_before_persuade",
    "live_facts_only",
    "crm_is_operational_memory",
    "human_handoff_for_consequential_exceptions",
    "no_pressure_after_natural_close",
  ] as const,
  evidence: {
    historicalConversationsAnalyzed: 521,
    clearNextStepHeuristicConversionWith: 38.1,
    clearNextStepHeuristicConversionWithout: 16.7,
    questionHeuristicConversionWith: 32.2,
    questionHeuristicConversionWithout: 20.6,
    oneTextBurstHeuristicConversion: 24.9,
    twoTextBurstHeuristicConversion: 20.5,
    responseAfterTwelveHoursHeuristicConversion: 3.8,
    microConversion: {
      askFlavorsAdvancePct: 50.0,
      askQuantityAdvancePct: 39.5,
      askContactDetailsAdvancePct: 53.8,
      oneQuestionAdvancePct: 30.7,
      twoQuestionAdvancePct: 21.4,
      noQuestionAdvancePct: 17.6,
    },
    caveat: "Historical associations are heuristic and non-causal; use them to shape experiments, not as guaranteed uplift.",
  },
  objectionProtocol: ["acknowledge","clarify_if_needed","answer_from_live_facts","confirm_resolution","resume_smallest_next_step"] as const,
  hardHandoff: [
    "complaint","refund","missing_or_damaged_order","food_safety","allergy",
    "payment_dispute","fraud","custom_feasibility","discount_exception",
    "delivery_exception","customer_requested_human","repeated_misunderstanding",
    "low_confidence","conflicting_data",
  ] as const,
} as const;

export function getStageConversationPolicy(stage: BagelitoSalesStage) {
  const active = !NO_NEXT_STEP_REQUIRED.has(stage);
  return {
    goal:
      stage === "menu_discovery" ? "Reduce choice uncertainty and move toward a pack/flavor decision."
      : stage === "recommendation" ? "Recommend a small relevant set and ask the customer to choose."
      : stage === "order_configuration" ? "Preserve known selections and complete one missing product decision."
      : stage === "details_collection" ? "Collect the next missing operational detail without repeating known fields."
      : stage === "quote_ready" ? "Present a verified scan-friendly summary and make the next action obvious."
      : stage === "payment_pending" ? "Make payment simple without inventing confirmation."
      : stage === "payment_evidence_received" ? "Acknowledge receipt and pause for verification."
      : stage === "human_review" ? "Acknowledge safely and transfer context to a human."
      : stage === "completed" ? "Close naturally and leave the relationship warm."
      : "Answer the latest question and advance only one decision.",
    maximumQuestions: 1 as const,
    askFor: active ? "smallest_next_decision" as const : "nothing" as const,
    recommendedClose:
      stage === "quote_ready" ? "summary" as const
      : stage === "payment_pending" ? "payment" as const
      : ["confirmed","production","delivery","payment_evidence_received"].includes(stage) ? "operational" as const
      : active ? "question" as const : "none" as const,
  };
}

function countQuestions(messages: string[]) {
  return messages.reduce((count, message) => count + (message.match(/\?/g)?.length ?? 0), 0);
}
function hasClearNextStep(messages: string[]) {
  const text = messages.join("\n");
  return NEXT_STEP_PATTERN.test(text) || countQuestions(messages) > 0;
}

export function scoreSalesTurn(context: SalesTurnContext) {
  const messages = context.messages.map((message) => message.trim()).filter(Boolean);
  const issues: Array<{code: SalesTurnIssueCode; severity: "hold" | "review"; message: string}> = [];
  const add = (code: SalesTurnIssueCode, severity: "hold" | "review", message: string) => issues.push({code,severity,message});
  const questions = countQuestions(messages);
  const policy = getStageConversationPolicy(context.stage);

  if (!messages.length) add("empty_reply","hold","A sales turn cannot be empty.");
  if (questions > BAGELITO_CHAT_SALES_SKILL.maximumQuestionsPerTurn) add("too_many_questions","hold","Ask only one decision-moving question per turn.");
  if (!context.latestQuestionAnswered) add("latest_question_not_answered","hold","Answer the customer's newest question before resuming the script.");
  if (!context.liveFactsSufficient && !context.handoffReason) add("live_facts_insufficient","review","Do not sell from stale or invented operational facts.");
  if (!NO_NEXT_STEP_REQUIRED.has(context.stage) && policy.askFor === "smallest_next_decision" && !hasClearNextStep(messages)) add("missing_next_step","hold","End with one clear next decision or action.");
  if (context.action === "request_payment" && !context.quoteVerified) add("payment_before_verified_quote","hold","Payment cannot be requested before the quote is verified.");
  if (context.paymentStatus === "evidence_received" && context.stage === "confirmed") add("payment_confirmation_requires_verification","hold","Payment evidence must be verified before confirmation.");
  if (context.handoffReason || context.stage === "human_review" || context.action === "handoff") add("human_handoff_required","review","A human must own this turn before any consequential commitment.");
  if (["completed","lost"].includes(context.stage) && context.action !== "wait" && questions > 0) add("overselling_after_close","review","Do not reopen a naturally closed conversation unless the customer reopens it.");

  const holdIssues = issues.filter((issue) => issue.severity === "hold");
  return {
    pass: holdIssues.length === 0,
    autoEligible: holdIssues.length === 0 && !AUTO_HOLD_STAGES.has(context.stage) && !context.handoffReason,
    score: Math.max(0,100-issues.reduce((sum,issue)=>sum+(issue.severity==="hold"?30:15),0)),
    issues,
    metrics: {messages:messages.length,questions,characters:messages.join("\n\n").length,hasClearNextStep:hasClearNextStep(messages)},
  };
}

export function buildBagelitoSalesSkillInstructions() {
  return [
    "BAGELITO SALES SKILL V2",
    "Goal: help the customer make one clear next decision while sounding like Dawn, not like a scripted support bot.",
    "Always answer the latest customer question before resuming an earlier order step.",
    "Use one clear next decision per turn and ask at most one question.",
    "Use progressive disclosure: do not ask for every order field while the customer is still deciding what to buy.",
    "One decision per turn is different from operational data collection. Once the order itself is configured, details_collection may use one compact operational field bundle for name, phone, district and address instead of dragging those non-decision fields across four turns.",
    "Diagnose before persuading. For objections: acknowledge, clarify if needed, answer from current facts, check resolution, then resume the smallest next step.",
    "Prefer focused recommendations and small choices over repeating the full catalog.",
    "Supabase is the operational source of truth for order state, prices, delivery, payment and fulfillment. Never override it with historical chat content.",
    "Do not request payment until there is a verified quote including delivery and total.",
    "Payment evidence is not payment confirmation. A human or verified system event must confirm it.",
    "Use handoff for complaints, refunds, food safety/allergies, disputes, fraud, custom feasibility, exceptions, conflicting data, repeated misunderstanding, explicit human requests or low confidence.",
    "After confirmation or fulfillment, be concise and operational. Do not force an upsell or reopen a natural close.",
    "Historical evidence: clear next-step language and decision-moving questions are associated with higher conversion signals, while longer initial message bursts are not. Treat this as directional evidence, not causal proof.",
  ].join("\n");
}
