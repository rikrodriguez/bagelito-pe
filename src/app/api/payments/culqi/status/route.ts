import { NextResponse } from "next/server";
import { isCulqiRequestAllowed } from "@/lib/payments";
import { getCulqiReadonlyDiagnosticScope } from "@/lib/payments/culqi-readonly-diagnostic";
import { createCulqiStatusRecovery, type CulqiStatusRecoverySnapshot } from "@/lib/payments/culqi-status-recovery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const recoveryEnvKeys = ["CULQI_STATUS_RECOVERY_APPROVED", "VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV",
  "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG",
  "VERCEL_BRANCH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "PAYMENT_PROVIDER",
  "CULQI_MODE", "CULQI_ENABLED", "CULQI_LIVE_APPROVED", "NEXT_PUBLIC_CULQI_PUBLIC_KEY", "CULQI_SECRET_KEY"] as const;
const headers = { "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers });
}

function recoveryRequestAllowed(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN || url.username || url.password || request.headers.get("origin") !== ORIGIN
      || request.headers.get("host") !== HOST) return false;
    const forwardedHost = request.headers.get("x-forwarded-host");
    const protocol = request.headers.get("x-forwarded-proto");
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((forwardedHost !== null && forwardedHost !== HOST) || (protocol !== null && protocol !== "https")
      || (fetchSite !== null && fetchSite !== "same-origin")) return false;
    const referer = request.headers.get("referer");
    if (referer !== null) {
      const ref = new URL(referer);
      if (ref.origin !== ORIGIN || ref.username || ref.password) return false;
    }
    return true;
  } catch { return false; }
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("invalid_request");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 2048)) throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const signal = AbortSignal.timeout(2000);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new Error("invalid_request"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        reader.read().then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
          () => { signal.removeEventListener("abort", abort); reject(new Error("invalid_request")); });
      });
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048 || chunks.length >= 2048) throw new Error("invalid_request");
      chunks.push(chunk.value);
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => key !== "orderCode" && key !== "checkoutSessionId")) throw new Error("invalid_request");
    return value as Record<string, unknown>;
  } finally {
    void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* No raw errors. */ }
  }
}

function validPayment(value: unknown): value is { paymentStatus: string; orderStatus: string; reconciliationRequired: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payment = value as Record<string, unknown>;
  return typeof payment.paymentStatus === "string" && ["pending", "paid", "failed", "expired", "refunded"].includes(payment.paymentStatus)
    && typeof payment.orderStatus === "string" && ["payment_pending_review", "payment_confirmed", "needs_correction",
      "in_production", "ready_for_delivery", "delivered", "cancelled"].includes(payment.orderStatus)
    && typeof payment.reconciliationRequired === "boolean";
}

export async function POST(request: Request) {
  // This non-secret server flag is false/missing by default. Enabling recovery
  // requires separate operational approval and the QA-only DB policy. Neither
  // body fields nor CULQI_ENABLED alone authorize the new financial transition.
  const recoveryApproved = process.env.CULQI_STATUS_RECOVERY_APPROVED === "true";
  if (recoveryApproved && !Object.values(getCulqiReadonlyDiagnosticScope(process.env)).every(Boolean)) {
    return reply({ ok: false, error: "Payment recovery is unavailable." }, 503);
  }
  if (recoveryApproved && !recoveryRequestAllowed(request)) {
    return reply({ ok: false, error: "Invalid payment status request." }, 403);
  }
  if (!isCulqiRequestAllowed(request)) {
    return reply({ ok: false, error: "Culqi payments are not enabled yet." }, 503);
  }

  try {
    let payload: Record<string, unknown>;
    try { payload = await readPayload(request); }
    catch { return reply({ ok: false, error: "Invalid payment status request." }, 400); }
    const checkoutSessionId = typeof payload.checkoutSessionId === "string" ? payload.checkoutSessionId.trim() : "";
    const orderCode = typeof payload.orderCode === "string" ? payload.orderCode.trim().toUpperCase() : "";

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutSessionId)
      || !/^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode)) {
      return reply({ ok: false, error: "Invalid payment status request." }, 400);
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_code, payment_status, payment_expires_at, payment_order_id, payment_reconciliation_required, status")
      .eq("order_code", orderCode)
      .eq("checkout_session_id", checkoutSessionId)
      .abortSignal(AbortSignal.timeout(2000))
      .maybeSingle();

    if (error) throw new Error("state_unavailable");
    if (!data) return reply({ ok: false, error: "Payment not found." }, 404);

    const expiresAt = data.payment_expires_at ? String(data.payment_expires_at) : null;
    // The database re-reads under the same batch/order locks as payment events.
    // Never cancel from a stale snapshot or infer a charge outcome from time.
    const readState = async () => {
      const result = await supabase.rpc("expire_culqi_token_session", {
        p_order_id: data.id, p_checkout_session_id: checkoutSessionId,
      }).abortSignal(AbortSignal.timeout(2000));
      if (result.error || !validPayment(result.data)) throw new Error("state_unavailable");
      return result.data;
    };
    let payment = await readState();
    let recovery: { state: string; retryAfterSeconds?: number } | null = null;
    if (recoveryApproved) {
      const recover = createCulqiStatusRecovery({
        // Project only this feature's configuration into an ordinary record.
        // process.env has a special prototype and is not a JSON-like snapshot.
        readConfig: () => Object.fromEntries(recoveryEnvKeys.map((key) => [key, process.env[key]])),
        readPersistedOrder: async (code, session, signal) => {
          const row = await supabase.from("orders")
            .select("id, checkout_session_id, order_code, payment_provider, payment_lane, payment_order_id, payment_charge_id, payment_charge_attempt_id, payment_charge_source_id, payment_amount_minor, payment_currency, payment_charge_state, payment_status, payment_reconciliation_required, payment_reconciliation_reason, status")
            .eq("order_code", code).eq("checkout_session_id", session).abortSignal(signal).maybeSingle();
          if (row.error) throw new Error("state_unavailable");
          if (!row.data) return null;
          let attempt: CulqiStatusRecoverySnapshot["attempt"] = null;
          if (row.data.payment_status !== "paid") {
            const attempts = await supabase.from("payment_attempts")
              .select("id, order_id, provider, provider_order_id, provider_charge_id, amount_minor, currency_code, status")
              .eq("order_id", row.data.id).eq("provider", "culqi").is("provider_order_id", null)
              .limit(2).abortSignal(signal);
            if (attempts.error || !Array.isArray(attempts.data) || attempts.data.length > 1) throw new Error("state_unavailable");
            attempt = attempts.data[0] ?? null;
          }
          const reason = row.data.payment_reconciliation_reason;
          const refundState = reason === "known_pending_refund" ? "pending"
            : reason === "known_completed_refund" ? "completed"
              : reason === "known_refund_unknown" ? "unknown" : null;
          return { order: row.data, attempt,
            ...(refundState && row.data.payment_charge_id ? { knownRefund: { chargeId: row.data.payment_charge_id, state: refundState } } : {}) };
        },
        consumeRateLimit: async (args, signal) => {
          const result = await supabase.rpc("consume_api_rate_limit", args).abortSignal(signal);
          if (result.error) throw new Error("rate_unavailable");
          return result.data;
        },
        fetch: (url, init) => fetch(url, init),
        confirmCharge: async (args, signal) => {
          const result = await supabase.rpc("confirm_culqi_status_charge_get", args).abortSignal(signal);
          if (result.error) throw new Error("confirmation_unavailable");
          return result.data;
        },
      });
      recovery = await recover({ orderCode, checkoutSessionId });
      // A webhook can commit during GET. Always respond with the latest locked
      // DB state, never with a payment status inferred from a transport result.
      payment = await readState();
    }

    return reply(
      {
        expiresAt,
        ok: true,
        orderCode: data.order_code,
        orderStatus: payment.orderStatus,
        paymentStatus: payment.paymentStatus,
        reconciliationRequired: payment.reconciliationRequired,
        ...(recovery ? { recoveryState: recovery.state,
          ...(recovery.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: recovery.retryAfterSeconds }) } : {}),
      },
    );
  } catch {
    return reply(
      {
        ok: false,
        error: "Could not read payment status.",
      },
      500,
    );
  }
}
