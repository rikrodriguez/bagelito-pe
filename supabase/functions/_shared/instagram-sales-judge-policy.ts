export const SALES_JUDGE_KNOWN_ISSUES = [
  "latest_question_unanswered",
  "too_many_decisions",
  "reasks_known_data",
  "weak_or_missing_next_step",
  "contradicts_order_state",
  "factual_or_operational_claim_unverified",
  "payment_risk",
  "should_handoff",
  "pressuring_customer",
  "bot_tone_or_format",
  "irrelevant_or_repeated_media"
] as const;

export const SALES_JUDGE_CRITICAL_ISSUES = new Set<string>([
  "latest_question_unanswered",
  "too_many_decisions",
  "reasks_known_data",
  "contradicts_order_state",
  "factual_or_operational_claim_unverified",
  "payment_risk",
  "should_handoff",
  "pressuring_customer"
]);

type JudgeAssessment = {
  latest_question_score?: unknown;
  sales_progression_score?: unknown;
  factual_safety_score?: unknown;
  handoff_score?: unknown;
  dawn_voice_score?: unknown;
  pressure_safety_score?: unknown;
  issues?: unknown;
  recommended_action?: unknown;
  rationale?: unknown;
};

function score(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return 0;
  return Math.round(value);
}

export function adjudicateSalesJudge(input: JudgeAssessment, minScore = 85) {
  const latestQuestionScore = score(input.latest_question_score);
  const salesProgressionScore = score(input.sales_progression_score);
  const factualSafetyScore = score(input.factual_safety_score);
  const handoffScore = score(input.handoff_score);
  const dawnVoiceScore = score(input.dawn_voice_score);
  const pressureSafetyScore = score(input.pressure_safety_score);

  const validIssues = Array.isArray(input.issues) &&
    input.issues.every((item) =>
      typeof item === "string" &&
      (item === "none" || SALES_JUDGE_KNOWN_ISSUES.includes(item as (typeof SALES_JUDGE_KNOWN_ISSUES)[number]))
    );
  const issues = validIssues
    ? (input.issues as string[]).filter((issue) => issue !== "none")
    : ["invalid_issues"];
  const criticalIssues = issues.filter((issue) =>
    SALES_JUDGE_CRITICAL_ISSUES.has(issue) || issue === "invalid_issues"
  );

  const recommendedAction = ["send","hold","human_review","regenerate"].includes(
    input.recommended_action as string
  )
    ? input.recommended_action as string
    : "hold";

  const scores = [
    latestQuestionScore, salesProgressionScore, factualSafetyScore,
    handoffScore, dawnVoiceScore, pressureSafetyScore
  ];
  const overallScore = Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length);
  const effectiveThreshold = typeof minScore === "number" && Number.isFinite(minScore)
    ? Math.max(0, Math.min(100, minScore))
    : 85;

  // Fail closed on ALL reported issues. The critical subset remains explicit for triage.
  const pass = Boolean(
    recommendedAction === "send" &&
    issues.length === 0 &&
    overallScore >= effectiveThreshold &&
    latestQuestionScore >= 85 &&
    salesProgressionScore >= 80 &&
    factualSafetyScore >= 95 &&
    handoffScore >= 95 &&
    dawnVoiceScore >= 75 &&
    pressureSafetyScore >= 90
  );

  return {
    pass,
    overallScore,
    latestQuestionScore,
    salesProgressionScore,
    factualSafetyScore,
    handoffScore,
    dawnVoiceScore,
    pressureSafetyScore,
    issues,
    criticalIssues,
    recommendedAction,
    rationale: typeof input.rationale === "string" ? input.rationale.slice(0,1000) : ""
  };
}
