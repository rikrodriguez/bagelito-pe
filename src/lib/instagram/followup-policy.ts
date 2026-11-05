export type FollowupStage =
  | "new_inquiry" | "menu_discovery" | "recommendation" | "order_configuration"
  | "details_collection" | "quote_ready" | "payment_pending"
  | "payment_evidence_received" | "confirmed" | "production" | "delivery"
  | "completed" | "lost" | "human_review";

export type FollowupContext = {
  now: Date;
  lastCustomerAt: Date | null;
  lastOutboundAt: Date | null;
  stage: FollowupStage;
  mode: string | null;
  handoffReason: string | null;
  followupsSent: number;
};

export const BAGELITO_FOLLOWUP_POLICY = {
  version: "bagelito-instagram-followup-2026-11-04-v1",
  shadowEnabled: true,
  autoSendEnabled: false,
  standardWindowHours: 24,
  safetyBufferMinutes: 60,
  minimumSilenceMinutes: 240,
  maxFollowupsPerCustomerWindow: 1,
  eligibleStages: [
    "menu_discovery",
    "recommendation",
    "order_configuration",
    "details_collection",
    "quote_ready",
    "payment_pending",
  ] as const,
  neverStages: [
    "payment_evidence_received",
    "confirmed",
    "production",
    "delivery",
    "completed",
    "lost",
    "human_review",
  ] as const,
  rationale: "Historical Bagelito data does not provide a clean enough silent-followup sample to justify live automated timing. Start shadow-only, measure, then promote.",
} as const;

function minutesBetween(later: Date, earlier: Date) {
  return (later.getTime() - earlier.getTime()) / 60000;
}

export function getFollowupObjective(stage: FollowupStage, missingFields: string[]) {
  if (stage === "payment_pending") return "gentle_payment_reminder";
  if (stage === "details_collection" && missingFields.length) return "collect_missing_details";
  if (stage === "order_configuration") return "resume_order_choice";
  if (stage === "recommendation") return "resume_recommendation";
  return "reopen_choice";
}

export function evaluateFollowupEligibility(context: FollowupContext) {
  if (!BAGELITO_FOLLOWUP_POLICY.shadowEnabled) {
    return { eligible: false, autoSend: false, reason: "followup_disabled" as const };
  }
  if (!context.lastCustomerAt || !context.lastOutboundAt) {
    return { eligible: false, autoSend: false, reason: "missing_conversation_timestamps" as const };
  }
  if (context.mode === "human_active" || context.handoffReason) {
    return { eligible: false, autoSend: false, reason: "human_owned_thread" as const };
  }
  if ((BAGELITO_FOLLOWUP_POLICY.neverStages as readonly string[]).includes(context.stage)) {
    return { eligible: false, autoSend: false, reason: "stage_not_followup_eligible" as const };
  }
  if (!(BAGELITO_FOLLOWUP_POLICY.eligibleStages as readonly string[]).includes(context.stage)) {
    return { eligible: false, autoSend: false, reason: "stage_not_followup_eligible" as const };
  }
  if (context.followupsSent >= BAGELITO_FOLLOWUP_POLICY.maxFollowupsPerCustomerWindow) {
    return { eligible: false, autoSend: false, reason: "followup_limit_reached" as const };
  }
  if (context.lastOutboundAt <= context.lastCustomerAt) {
    return { eligible: false, autoSend: false, reason: "customer_has_not_been_answered" as const };
  }

  const silenceSinceOutbound = minutesBetween(context.now, context.lastOutboundAt);
  if (silenceSinceOutbound < BAGELITO_FOLLOWUP_POLICY.minimumSilenceMinutes) {
    return { eligible: false, autoSend: false, reason: "minimum_silence_not_reached" as const };
  }

  const elapsedSinceCustomer = minutesBetween(context.now, context.lastCustomerAt);
  const cutoff =
    BAGELITO_FOLLOWUP_POLICY.standardWindowHours * 60 -
    BAGELITO_FOLLOWUP_POLICY.safetyBufferMinutes;
  if (elapsedSinceCustomer > cutoff) {
    return { eligible: false, autoSend: false, reason: "messaging_window_safety_cutoff" as const };
  }

  return {
    eligible: true,
    autoSend: BAGELITO_FOLLOWUP_POLICY.autoSendEnabled,
    reason: "shadow_candidate" as const,
    objective: getFollowupObjective(context.stage, []),
    remainingWindowMinutes: Math.max(0, cutoff - elapsedSinceCustomer),
  };
}
