import type { CulqiChargeResult } from "./culqi";
import { validateCulqiChargeResult } from "./culqi-charge-evidence";

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
  db, orderId, orderCode, checkoutSessionId, amountMinor, mode, sourceId, deviceId, has3DS, createCharge, fetchCharge,
}: {
  db: PaymentRpcClient;
  orderId: string;
  orderCode: string;
  checkoutSessionId: string;
  amountMinor: number;
  mode: "test" | "live";
  sourceId: string;
  deviceId: string;
  has3DS: boolean;
  createCharge: () => Promise<CulqiChargeResult>;
  fetchCharge?: (chargeId: string) => Promise<unknown>;
}) {
  // These values come from the authorized persisted order and server config,
  // never a browser amount/mode or a provider-supplied metadata shortcut.
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
    || !["test", "live"].includes(mode)
    || !new RegExp(`^(?:tkn|ype)_${mode}_[A-Za-z0-9_-]{8,100}$`).test(sourceId)) {
    throw new Error("Invalid charge confirmation context.");
  }
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
  let knownChargeId: string | null = null;
  let uncertaintyPayload: { stage: string; reason?: string } = { stage: "reconciliation_required" };
  const review = () => ({ ok: false, orderCode, paymentStatus: "reconciliation_required",
    error: "We could not confirm the payment result. Please check the order status; do not pay again yet." });
  try {
    const result = await createCharge();
    if (result.requires3DS) {
      const stored = await finish("requires_3ds", null, { stage: "requires_3ds", action_code: "REVIEW" });
      if (stored.error) throw new Error(stored.error.message);
      return { ok: true, orderCode, paymentStatus: "requires_3ds", requires3DS: true };
    }
    if (typeof result.charge.id === "string"
      && new RegExp(`^chr_${mode}_[A-Za-z0-9_-]{8,100}$`).test(result.charge.id)) {
      knownChargeId = result.charge.id;
    }
    if (!knownChargeId) throw new Error("Unbound charge identity.");
    const expected = { chargeId: knownChargeId, sourceId, orderCode, amountMinor, currencyCode: "PEN" as const, mode };
    let observation = validateCulqiChargeResult(result.charge, expected);
    let observedAt = new Date().toISOString();
    let provenance = "culqi_charge_post";
    if (!observation.verified && observation.needsLookup && fetchCharge) {
      // One bounded read of the charge just returned by our authenticated POST.
      // Missing evidence may be supplemented; contradictory evidence cannot.
      const charge = await fetchCharge(knownChargeId);
      observedAt = new Date().toISOString();
      observation = validateCulqiChargeResult(charge, expected);
      provenance = "culqi_charge_get";
    }
    if (!observation.verified) {
      uncertaintyPayload = { stage: "reconciliation_required", reason: observation.reason };
      const stored = await finish("uncertain", knownChargeId, uncertaintyPayload);
      if (stored.error) throw new Error(stored.error.message);
      return review();
    }
    const stored = await finish("submitted", knownChargeId, { stage: "submitted", provenance });
    if (stored.error) throw new Error(stored.error.message);
    const confirmed = await db.rpc("confirm_culqi_charge_result", {
      p_order_id: orderId, p_checkout_session_id: checkoutSessionId,
      p_charge_attempt_id: claim.attempt_id, p_observed_at: observedAt,
      p_provenance: provenance, p_mode: mode, p_observation: observation.evidence,
    });
    if (confirmed.error) throw new Error(confirmed.error.message);
    const state = confirmed.data as { paymentState?: unknown; orderState?: unknown; requiresReview?: unknown } | null;
    if (state?.paymentState === "paid" && state.requiresReview === false
      && ["payment_confirmed", "in_production", "ready_for_delivery", "delivered"].includes(String(state.orderState))) {
      return { ok: true, orderCode, paymentStatus: "paid" };
    }
    return review();
  } catch {
    // Includes timeout, provider rejection and persistence errors. Do not infer
    // that no money moved from an HTTP error or retry with a fresh token.
    try { await finish("uncertain", knownChargeId, uncertaintyPayload); } catch { /* claim remains closed */ }
    return review();
  }
}
