// Pure server-side policy for an existing sandbox charge. Callers must first
// authorize the request and derive every binding from their persisted order.
// This module neither fetches, reads configuration, logs nor writes anything.
export type CulqiCaptureBinding = Readonly<{
  chargeId: string;
  sourceId: string;
  orderCode: string;
  amountMinor: number;
  currencyCode: "PEN";
}>;

// A normalized observation from a trusted server source, associated with this
// charge. No checkout needs an exhaustive merchant-wide refund scan. Absence
// here means no such observation was supplied, not a guarantee about future
// refunds. The adapter must never take this observation from a browser body.
export type CulqiKnownRefund = Readonly<{
  chargeId: string;
  state: "pending" | "completed" | "rejected" | "unknown";
}>;

type RejectionReason = "invalid_binding" | "malformed_charge" | "identity_mismatch"
  | "amount_mismatch" | "currency_mismatch" | "order_mismatch" | "source_mismatch"
  | "capture_not_confirmed" | "financial_fields_missing" | "financial_fields_invalid"
  | "refund_observed" | "current_amount_mismatch" | "dispute_observed"
  | "known_refund_invalid" | "known_refund_pending" | "known_refund_completed" | "known_refund_unknown";

export type CulqiCaptureEvidenceResult = Readonly<{
  verified: false;
  reason: RejectionReason;
}> | Readonly<{
  verified: true;
  reason: "captured";
  evidence: Readonly<{
    amountMinor: number;
    currencyCode: "PEN";
    capture: true;
    currentAmountMinor: number;
    amountRefundedMinor: 0;
    dispute: false;
    captureDatePresent: boolean;
  }>;
}>;

const CHARGE_ID = /^chr_test_[A-Za-z0-9_-]{8,100}$/;
const SOURCE_ID = /^(?:tkn|ype)_test_[A-Za-z0-9_-]{8,100}$/;
const ORDER_CODE = /^BAG-[A-Z0-9_-]{1,80}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validateCulqiCapturedCharge(
  charge: unknown,
  expected: CulqiCaptureBinding,
  knownRefund?: CulqiKnownRefund | null,
): CulqiCaptureEvidenceResult {
  const reject = (reason: RejectionReason): CulqiCaptureEvidenceResult => Object.freeze({ verified: false, reason });
  try {
    if (!record(expected) || typeof expected.chargeId !== "string" || !CHARGE_ID.test(expected.chargeId)
      || typeof expected.sourceId !== "string" || !SOURCE_ID.test(expected.sourceId)
      || typeof expected.orderCode !== "string" || !ORDER_CODE.test(expected.orderCode)
      || !Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0
      || expected.currencyCode !== "PEN") return reject("invalid_binding");
    if (!record(charge)) return reject("malformed_charge");
    if (!Object.hasOwn(charge, "object") || charge.object !== "charge"
      || !Object.hasOwn(charge, "id") || charge.id !== expected.chargeId) return reject("identity_mismatch");
    if (!Object.hasOwn(charge, "amount") || !Number.isSafeInteger(charge.amount)
      || charge.amount !== expected.amountMinor) return reject("amount_mismatch");
    const hasCode = Object.hasOwn(charge, "currency_code");
    const hasAlias = Object.hasOwn(charge, "currency");
    if ((!hasCode && !hasAlias) || (hasCode && charge.currency_code !== expected.currencyCode)
      || (hasAlias && charge.currency !== expected.currencyCode)) return reject("currency_mismatch");
    if (!record(charge.metadata) || !Object.hasOwn(charge.metadata, "bagelito_order_code")
      || charge.metadata.bagelito_order_code !== expected.orderCode) return reject("order_mismatch");
    if (!record(charge.source) || !Object.hasOwn(charge.source, "id")
      || charge.source.id !== expected.sourceId) return reject("source_mismatch");
    if (!Object.hasOwn(charge, "capture") || charge.capture !== true) return reject("capture_not_confirmed");
    for (const field of ["current_amount", "amount_refunded", "dispute"] as const) {
      if (!Object.hasOwn(charge, field) || charge[field] === null || charge[field] === undefined) {
        return reject("financial_fields_missing");
      }
    }
    if (!Number.isSafeInteger(charge.current_amount) || (charge.current_amount as number) < 0
      || !Number.isSafeInteger(charge.amount_refunded) || (charge.amount_refunded as number) < 0
      || typeof charge.dispute !== "boolean") return reject("financial_fields_invalid");
    if (charge.amount_refunded !== 0) return reject("refund_observed");
    if (charge.current_amount !== expected.amountMinor) return reject("current_amount_mismatch");
    if (charge.dispute !== false) return reject("dispute_observed");

    if (knownRefund !== undefined && knownRefund !== null) {
      if (!record(knownRefund) || knownRefund.chargeId !== expected.chargeId
        || !["pending", "completed", "rejected", "unknown"].includes(knownRefund.state)) {
        return reject("known_refund_invalid");
      }
      if (knownRefund.state === "pending") return reject("known_refund_pending");
      if (knownRefund.state === "completed") return reject("known_refund_completed");
      if (knownRefund.state === "unknown") return reject("known_refund_unknown");
      // Rejected is not returned money. Any contradictory charge fields above
      // still block this case; a rejected observation never overrides them.
    }

    // The documented capture flag establishes original capture. The net/refund
    // observations only gate recovery of a currently pending order. Neither
    // paid, operations shape/emptiness nor future reversal absence is required.
    // capture_date is observational; its response unit is not assumed.
    return Object.freeze({
      verified: true, reason: "captured",
      evidence: Object.freeze({
        amountMinor: expected.amountMinor, currencyCode: "PEN", capture: true,
        currentAmountMinor: expected.amountMinor, amountRefundedMinor: 0, dispute: false,
        captureDatePresent: Object.hasOwn(charge, "capture_date")
          && charge.capture_date !== null && charge.capture_date !== undefined,
      }),
    });
  } catch {
    return reject("malformed_charge");
  }
}
