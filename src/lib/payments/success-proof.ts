/**
 * Browser-only, per-tab proof of checkout ownership for the confirmation view.
 * This is NOT proof of payment; only the authenticated server status endpoint
 * can confirm a paid order. No card/token/3DS data is stored.
 */
export const SUCCESS_PROOF_KEY = "bagelito.culqi.success-session.v1";
const MAX_AGE = 30 * 60 * 1000;
const orderPattern = /^BAG-[A-Z0-9_-]{1,80}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type SuccessProof = Readonly<{
  v: 1;
  orderCode: string;
  checkoutSessionId: string;
  createdAt: number;
}>;

export function saveSuccessProof(storage: StorageLike, orderCode: string, checkoutSessionId: string, now = Date.now()) {
  if (!orderPattern.test(orderCode) || !uuidPattern.test(checkoutSessionId)
    || !Number.isSafeInteger(now) || now < 0) return false;
  const data: SuccessProof = { v: 1, orderCode, checkoutSessionId, createdAt: now };
  storage.setItem(SUCCESS_PROOF_KEY, JSON.stringify(data));
  return true;
}

export function readSuccessProof(storage: StorageLike, orderCode: string, now = Date.now()): SuccessProof | null {
  if (!orderPattern.test(orderCode) || !Number.isSafeInteger(now)) return null;
  const raw = storage.getItem(SUCCESS_PROOF_KEY);
  if (!raw || raw.length > 500) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || v.v !== 1 || v.orderCode !== orderCode
    || typeof v.checkoutSessionId !== "string" || !uuidPattern.test(v.checkoutSessionId)
    || typeof v.createdAt !== "number" || !Number.isSafeInteger(v.createdAt)
    || v.createdAt > now || now - v.createdAt > MAX_AGE) return null;
  return value as SuccessProof;
}

export type ConfirmationStatus = "paid" | "review" | "unverified";

export function checkServerPaymentStatus(payload: unknown): ConfirmationStatus {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "unverified";
  const p = payload as Record<string, unknown>;
  if (p.ok !== true || p.reconciliationRequired !== false) {
    return p.ok === true && p.reconciliationRequired === true ? "review" : "unverified";
  }
  if (p.paymentStatus !== "paid") return "unverified";
  if (["payment_confirmed", "in_production", "ready_for_delivery", "delivered"].includes(String(p.orderStatus))) return "paid";
  return "review"; // A paid but cancelled/released order is NOT a valid delivery confirmation.
}
