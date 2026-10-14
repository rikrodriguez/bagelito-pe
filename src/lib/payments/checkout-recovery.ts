// Browser-only recovery metadata. Never persist customer details, SDK tokens,
// card fields, fingerprints or 3DS authentication parameters here.
export const CHECKOUT_RECOVERY_STORAGE_KEY = "bagelito.culqi.pending.v1";

export type CheckoutRecovery = {
  version: 1;
  checkoutSessionId: string;
  orderCode: string;
  state: "pending" | "review";
};

export type CheckoutRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class CheckoutReviewError extends Error {
  constructor() {
    super("This payment needs a status check before another payment can start.");
    this.name = "CheckoutReviewError";
  }
}

function isRecovery(value: unknown): value is CheckoutRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4 && record.version === 1
    && typeof record.checkoutSessionId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.checkoutSessionId)
    && typeof record.orderCode === "string" && /^BAG-[A-Z0-9_-]{1,80}$/.test(record.orderCode)
    && (record.state === "pending" || record.state === "review");
}

export function readCheckoutRecovery(storage: CheckoutRecoveryStorage): CheckoutRecovery | null {
  const raw = storage.getItem(CHECKOUT_RECOVERY_STORAGE_KEY);
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new CheckoutReviewError(); }
  if (!isRecovery(value)) throw new CheckoutReviewError();
  return value;
}

function sameReference(a: CheckoutRecovery, b: CheckoutRecovery): boolean {
  return a.checkoutSessionId === b.checkoutSessionId && a.orderCode === b.orderCode;
}

export function beginCheckoutPayment(storage: CheckoutRecoveryStorage, reference: CheckoutRecovery): void {
  if (!isRecovery(reference) || reference.state !== "pending" || readCheckoutRecovery(storage)) {
    throw new CheckoutReviewError();
  }
  // Complete the durable write before the caller sends a charge request.
  storage.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify(reference));
}

export function markCheckoutPaymentReview(storage: CheckoutRecoveryStorage, reference: CheckoutRecovery): void {
  const current = readCheckoutRecovery(storage);
  if (!isRecovery(reference) || (current && !sameReference(current, reference))) throw new CheckoutReviewError();
  storage.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify({ ...reference, state: "review" }));
}

export function clearCheckoutRecovery(storage: CheckoutRecoveryStorage, reference: CheckoutRecovery): void {
  const current = readCheckoutRecovery(storage);
  if (current && !sameReference(current, reference)) throw new CheckoutReviewError();
  storage.removeItem(CHECKOUT_RECOVERY_STORAGE_KEY);
}

export function checkoutRecoveryOutcome(result: {
  ok?: boolean;
  paymentStatus?: string;
  reconciliationRequired?: boolean;
}): "paid" | "released" | "pending" | "review" {
  if (result.ok !== true) return "pending";
  // A paid-but-cancelled reservation requiring review stays locked too.
  if (result.reconciliationRequired === true) return "review";
  if (result.reconciliationRequired !== false) return "pending";
  if (result.paymentStatus === "paid") return "paid";
  if (result.paymentStatus === "failed" || result.paymentStatus === "expired") return "released";
  return "pending";
}
