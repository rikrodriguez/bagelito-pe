// Pure policy for responses obtained by the server directly from Culqi. The
// caller owns authentication and persisted bindings; this module performs no I/O.
export type CulqiChargeResultBinding = Readonly<{
  chargeId: string;
  sourceId: string;
  orderCode: string;
  amountMinor: number;
  currencyCode: "PEN";
  mode: "test" | "live";
}>;

export type CulqiNormalizedChargeEvidence = Readonly<{
  chargeId: string;
  sourceId: string;
  amountMinor: number;
  currencyCode: "PEN";
  capture: true;
  currentAmountMinor: number;
  amountRefundedMinor: 0;
  dispute: false;
  captureDatePresent: boolean;
}>;

type CulqiChargeEvidenceReason = "invalid_binding" | "malformed_charge" | "identity_mismatch"
  | "authentication_required"
  | "amount_mismatch" | "currency_mismatch" | "order_mismatch" | "source_mismatch"
  | "capture_not_confirmed" | "financial_fields_invalid" | "refund_observed"
  | "current_amount_mismatch" | "dispute_observed" | "evidence_incomplete";

export type CulqiChargeResultEvidenceResult = Readonly<{
  verified: false;
  reason: CulqiChargeEvidenceReason;
  needsLookup: boolean;
}> | Readonly<{
  verified: true;
  reason: "captured";
  needsLookup: false;
  evidence: CulqiNormalizedChargeEvidence;
}>;

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function field(value: Record<string, unknown>, name: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor) return { present: false, value: undefined };
  // JSON responses have data properties. Never execute an accessor to establish
  // financial evidence or let a changing getter defeat the binding snapshot.
  if (!Object.hasOwn(descriptor, "value")) throw new Error("Unusable charge evidence.");
  return { present: true, value: descriptor.value as unknown };
}

function bindingSnapshot(value: unknown): CulqiChargeResultBinding | null {
  if (!record(value)) return null;
  const chargeId = field(value, "chargeId").value;
  const sourceId = field(value, "sourceId").value;
  const orderCode = field(value, "orderCode").value;
  const amountMinor = field(value, "amountMinor").value;
  const currencyCode = field(value, "currencyCode").value;
  const mode = field(value, "mode").value;
  if ((mode !== "test" && mode !== "live")
    || typeof chargeId !== "string" || !new RegExp(`^chr_${mode}_[A-Za-z0-9_-]{8,100}$`).test(chargeId)
    || typeof sourceId !== "string" || !new RegExp(`^(?:tkn|ype)_${mode}_[A-Za-z0-9_-]{8,100}$`).test(sourceId)
    || typeof orderCode !== "string" || !/^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode)
    || typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0
    || currencyCode !== "PEN") return null;
  return { chargeId, sourceId, orderCode, amountMinor, currencyCode, mode };
}

export function validateCulqiChargeResult(
  charge: unknown,
  expected: CulqiChargeResultBinding,
): CulqiChargeResultEvidenceResult {
  const reject = (reason: CulqiChargeEvidenceReason, needsLookup = false): CulqiChargeResultEvidenceResult =>
    Object.freeze({ verified: false, reason, needsLookup });
  let binding: CulqiChargeResultBinding | null;
  try { binding = bindingSnapshot(expected); } catch { return reject("invalid_binding"); }
  if (!binding) return reject("invalid_binding");
  try {
    if (!record(charge)) return reject("malformed_charge");
    const actionCode = field(charge, "action_code");
    // Missing evidence is considered only after every explicit contradiction.
    // A partial response may justify GET of the same bound ID, never payment.
    let missing = false;
    const object = field(charge, "object");
    if (!object.present) missing = true;
    else if (object.value !== "charge") return reject("identity_mismatch");
    const id = field(charge, "id");
    if (!id.present) missing = true;
    else if (id.value !== binding.chargeId) return reject("identity_mismatch");
    const amount = field(charge, "amount");
    if (!amount.present) missing = true;
    else if (typeof amount.value !== "number" || !Number.isSafeInteger(amount.value)
      || amount.value !== binding.amountMinor) return reject("amount_mismatch");

    const currencyCode = field(charge, "currency_code");
    const currencyAlias = field(charge, "currency");
    if (!currencyCode.present && !currencyAlias.present) missing = true;
    if ((currencyCode.present && currencyCode.value !== binding.currencyCode)
      || (currencyAlias.present && currencyAlias.value !== binding.currencyCode)) return reject("currency_mismatch");

    const metadata = field(charge, "metadata");
    if (!metadata.present) missing = true;
    else {
      if (!record(metadata.value)) return reject("order_mismatch");
      const orderCode = field(metadata.value, "bagelito_order_code");
      if (!orderCode.present) missing = true;
      else if (orderCode.value !== binding.orderCode) return reject("order_mismatch");
    }
    const source = field(charge, "source");
    if (!source.present) missing = true;
    else {
      if (!record(source.value)) return reject("source_mismatch");
      const sourceId = field(source.value, "id");
      if (!sourceId.present) missing = true;
      else if (sourceId.value !== binding.sourceId) return reject("source_mismatch");
    }

    const capture = field(charge, "capture");
    if (!capture.present) missing = true;
    else if (capture.value !== true) return reject("capture_not_confirmed");
    const currentAmount = field(charge, "current_amount");
    if (!currentAmount.present) missing = true;
    else {
      if (typeof currentAmount.value !== "number" || !Number.isSafeInteger(currentAmount.value)
        || currentAmount.value < 0) return reject("financial_fields_invalid");
      if (currentAmount.value !== binding.amountMinor) return reject("current_amount_mismatch");
    }
    const amountRefunded = field(charge, "amount_refunded");
    if (!amountRefunded.present) missing = true;
    else {
      if (typeof amountRefunded.value !== "number" || !Number.isSafeInteger(amountRefunded.value)
        || amountRefunded.value < 0) return reject("financial_fields_invalid");
      if (amountRefunded.value !== 0) return reject("refund_observed");
    }
    const dispute = field(charge, "dispute");
    if (!dispute.present) missing = true;
    else {
      if (typeof dispute.value !== "boolean") return reject("financial_fields_invalid");
      if (dispute.value !== false) return reject("dispute_observed");
    }
    const captureDate = field(charge, "capture_date");
    // Retain adverse financial reasons above for durable reconciliation. REVIEW
    // still contradicts capture and cannot authorize payment, GET or another POST.
    if (actionCode.value === "REVIEW") return reject("authentication_required");
    if (missing) return reject("evidence_incomplete", true);

    // Neither paid nor outcome is a payment criterion. The capture date remains
    // opaque; its units and value are not converted into an application date.
    return Object.freeze({
      verified: true, reason: "captured", needsLookup: false,
      evidence: Object.freeze({
        chargeId: binding.chargeId, sourceId: binding.sourceId,
        amountMinor: binding.amountMinor, currencyCode: "PEN", capture: true,
        currentAmountMinor: binding.amountMinor, amountRefundedMinor: 0, dispute: false,
        captureDatePresent: captureDate.present && captureDate.value !== undefined && captureDate.value !== null,
      }),
    });
  } catch { return reject("malformed_charge"); }
}
