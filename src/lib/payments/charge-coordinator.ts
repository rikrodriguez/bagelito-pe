import type { CulqiChargeResult } from "./culqi";

export type PaymentRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type ChargeClaim = { claimed?: boolean; state?: string; attempt_id?: string };

/**
 * The database claim is committed BEFORE contacting Culqi. Unknown outcomes
 * never expire/release automatically: reconciliation must establish no charge
 * occurred before a fresh token can be attempted.
 */
export async function coordinateCulqiCharge({
  db, orderId, orderCode, sourceId, deviceId, has3DS, createCharge,
}: {
  db: PaymentRpcClient;
  orderId: string;
  orderCode: string;
  sourceId: string;
  deviceId: string;
  has3DS: boolean;
  createCharge: () => Promise<CulqiChargeResult>;
}) {
  const claimResult = await db.rpc("claim_culqi_charge", {
    p_order_id: orderId, p_source_id: sourceId, p_device_id: deviceId,
    p_has_3ds: has3DS,
  });
  if (claimResult.error) throw new Error(claimResult.error.message);
  const claim = claimResult.data as ChargeClaim | null;
  if (!claim?.claimed || !claim.attempt_id) {
    if (claim?.state === "paid") return { ok: true, orderCode, paymentStatus: "paid" };
    if (claim?.state === "submitted" || claim?.state === "submitting") {
      return { ok: true, orderCode, paymentStatus: "awaiting_webhook" };
    }
    return { ok: false, orderCode, paymentStatus: "reconciliation_required",
      error: "This payment cannot be retried automatically. Check its status before trying another payment." };
  }
  const finish = (state: string, chargeId: string | null, payload: unknown) => db.rpc("finish_culqi_charge", {
    p_order_id: orderId, p_attempt_id: claim.attempt_id,
    p_state: state, p_charge_id: chargeId,
    p_method: sourceId.startsWith("ype_") ? "yape" : "card", p_payload: payload,
  });
  try {
    const result = await createCharge();
    if (result.requires3DS) {
      const stored = await finish("requires_3ds", null, { action: result.response, stage: "requires_3ds" });
      if (stored.error) throw new Error(stored.error.message);
      return { ok: true, orderCode, paymentStatus: "requires_3ds", requires3DS: true };
    }
    const stored = await finish("submitted", result.charge.id, result.charge);
    if (stored.error) throw new Error(stored.error.message);
    return { ok: true, orderCode, paymentStatus: "awaiting_webhook" };
  } catch {
    // Includes timeout, provider rejection and persistence errors. Do not infer
    // that no money moved from an HTTP error or retry with a fresh token.
    try { await finish("uncertain", null, { stage: "reconciliation_required" }); } catch { /* claim remains closed */ }
    return { ok: false, orderCode, paymentStatus: "reconciliation_required",
      error: "We could not confirm the payment result. Please check the order status; do not pay again yet." };
  }
}
