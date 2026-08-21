import { NextResponse } from "next/server";
import { fetchCulqiEvent, getPaymentConfig } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CulqiResource = {
  amount?: number;
  currency?: string;
  currency_code?: string;
  id?: string;
  metadata?: Record<string, unknown> | null;
  outcome?: {
    code?: string;
    decline_code?: string;
    merchant_message?: string;
    user_message?: string;
  } | null;
  paid?: boolean;
  state?: string;
};

type CulqiEvent = {
  data?: CulqiResource;
  id?: string;
  type?: string;
};

type PaymentState = "expired" | "failed" | "paid" | "pending";

const chargeEventTypes = new Set([
  "charge.creation.succeeded",
  "charge.creation.failed",
  "charge.expired",
]);

function isCulqiResource(value: unknown): value is CulqiResource {
  return Boolean(value && typeof value === "object");
}

function paymentStateForEvent(eventType: string, resource: CulqiResource): PaymentState {
  if (eventType === "charge.creation.succeeded") return "paid";
  if (eventType === "charge.creation.failed") return "failed";
  if (eventType === "charge.expired") return "expired";

  const state = String(resource.state ?? "").toLowerCase();
  if (state === "paid") return "paid";
  if (state === "expired") return "expired";
  if (state === "pending" || state === "created") return "pending";
  return "failed";
}

function nextOrderStatus(currentStatus: string, paymentStatus: PaymentState) {
  if (paymentStatus === "paid") return "payment_confirmed";
  if (paymentStatus === "expired") return "cancelled";
  if (paymentStatus === "failed") return "needs_correction";
  return currentStatus;
}

export async function POST(request: Request) {
  if (!getPaymentConfig().enabled) {
    return NextResponse.json(
      { ok: false, error: "Culqi payments are not enabled yet." },
      { status: 503 },
    );
  }

  try {
    const received = await request.json() as CulqiEvent;
    const eventId = String(received.id ?? "").trim();
    if (!/^evt_(test|live)_[A-Za-z0-9_-]{8,40}$/.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: "A valid Culqi webhook event ID is required." },
        { status: 400 },
      );
    }

    // Verify the event server-to-server. Browser payloads and raw webhook
    // fields are never trusted as proof of payment.
    const verified = await fetchCulqiEvent(eventId);
    const eventType = String(verified.type || received.type || "");
    const resource = isCulqiResource(verified.data) ? verified.data : null;

    if (eventType !== "order.status.changed" && !chargeEventTypes.has(eventType)) {
      return NextResponse.json({ ok: true, ignored: true, type: eventType });
    }
    if (!resource?.id) {
      return NextResponse.json(
        { ok: false, error: "Webhook payment data is missing." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: insertedEvent, error: insertError } = await supabase
      .from("payment_webhook_events")
      .insert({
        event_type: eventType,
        payload: verified,
        processed_at: null,
        provider: "culqi",
        provider_event_id: eventId,
        provider_order_id: resource.id,
      })
      .select("id, processed_at")
      .maybeSingle();

    let eventRow = insertedEvent as { id: string; processed_at: string | null } | null;
    if (insertError?.code === "23505") {
      const { data: existingEvent, error: existingEventError } = await supabase
        .from("payment_webhook_events")
        .select("id, processed_at")
        .eq("provider", "culqi")
        .eq("provider_event_id", eventId)
        .maybeSingle();

      if (existingEventError || !existingEvent) {
        throw new Error(existingEventError?.message ?? "Could not read duplicate webhook event.");
      }
      if (existingEvent.processed_at) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      eventRow = existingEvent as { id: string; processed_at: string | null };
    } else if (insertError) {
      throw new Error(insertError.message);
    }

    if (!eventRow?.id) throw new Error("Could not record webhook event.");

    const isOrderEvent = eventType === "order.status.changed";
    let orderQuery = supabase
      .from("orders")
      .select("id, order_code, status, total_amount, payment_amount_minor, payment_status, payment_order_id");

    if (isOrderEvent) {
      orderQuery = orderQuery.eq("payment_order_id", resource.id);
    } else {
      orderQuery = orderQuery.eq("payment_charge_id", resource.id);
    }

    let { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (!order && !isOrderEvent) {
      const orderCode = typeof resource.metadata?.bagelito_order_code === "string"
        ? resource.metadata.bagelito_order_code.trim().toUpperCase()
        : "";
      if (orderCode) {
        const fallback = await supabase
          .from("orders")
          .select("id, order_code, status, total_amount, payment_amount_minor, payment_status, payment_order_id")
          .eq("order_code", orderCode)
          .maybeSingle();
        order = fallback.data;
        orderError = fallback.error;
      }
    }

    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Culqi webhook could not be matched to a Bagelito order.");

    const expectedAmount = Number(order.payment_amount_minor ?? Math.round(Number(order.total_amount) * 100));
    const currency = resource.currency_code ?? resource.currency;
    if (currency && currency !== "PEN") throw new Error("Unexpected payment currency.");
    if (typeof resource.amount === "number" && resource.amount !== expectedAmount) {
      throw new Error("Webhook amount does not match the Bagelito order.");
    }

    const paymentStatus = paymentStateForEvent(eventType, resource);
    if (order.payment_status === "paid" && paymentStatus !== "paid") {
      await supabase
        .from("payment_webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventRow.id);
      return NextResponse.json({ ok: true, ignored: true, reason: "already_paid" });
    }

    const orderStatus = nextOrderStatus(order.status, paymentStatus);
    const failureCode = paymentStatus === "failed"
      ? resource.outcome?.decline_code ?? resource.outcome?.code ?? null
      : null;
    const failureMessage = paymentStatus === "failed"
      ? resource.outcome?.user_message ?? resource.outcome?.merchant_message ?? null
      : null;

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        ...(!isOrderEvent ? { payment_charge_id: resource.id } : {}),
        payment_failure_code: failureCode,
        payment_failure_message: failureMessage,
        payment_paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
        payment_status: paymentStatus,
        status: orderStatus,
      })
      .eq("id", order.id);
    if (updateOrderError) throw new Error(updateOrderError.message);

    if (order.payment_order_id) {
      const { error: attemptError } = await supabase
        .from("payment_attempts")
        .update({
          failure_code: failureCode,
          failure_message: failureMessage,
          paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
          ...(!isOrderEvent ? { provider_charge_id: resource.id } : {}),
          provider_payload: verified,
          status: paymentStatus,
        })
        .eq("provider", "culqi")
        .eq("provider_order_id", order.payment_order_id);
      if (attemptError) throw new Error(attemptError.message);
    }

    if (orderStatus !== order.status) {
      const { error: historyError } = await supabase.from("order_status_history").insert({
        changed_by: "culqi webhook",
        new_status: orderStatus,
        old_status: order.status,
        order_id: order.id,
      });
      if (historyError) throw new Error(historyError.message);
    }

    const { error: processedError } = await supabase
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);
    if (processedError) throw new Error(processedError.message);

    return NextResponse.json({
      ok: true,
      orderCode: order.order_code,
      status: paymentStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not process Culqi webhook.",
      },
      { status: 500 },
    );
  }
}
