/** Pure, non-payment review state machine for Bagelito order intentions. */
export const INTENT_REVIEW_STATUSES = [
  "awaiting_human_review", "reviewing", "approved_for_followup", "rejected", "expired",
] as const;
export type IntentReviewStatus = (typeof INTENT_REVIEW_STATUSES)[number];

const NEXT: Record<IntentReviewStatus, readonly IntentReviewStatus[]> = {
  awaiting_human_review: ["reviewing", "rejected", "expired"],
  reviewing: ["approved_for_followup", "rejected", "expired"],
  approved_for_followup: ["reviewing", "expired"],
  rejected: [],
  expired: [],
};

export function assertReviewTransition(from: unknown, to: unknown): asserts to is IntentReviewStatus {
  if (
    typeof from !== "string" || typeof to !== "string" ||
    !Object.prototype.hasOwnProperty.call(NEXT, from) ||
    !NEXT[from as IntentReviewStatus].includes(to as IntentReviewStatus)
  ) {
    throw new TypeError("Invalid human review state transition");
  }
}

export function normalizeReviewNote(value: unknown): string {
  if (typeof value !== "string" || value.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new TypeError("Invalid review note");
  }
  return value.trim();
}
