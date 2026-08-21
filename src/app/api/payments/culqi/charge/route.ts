import { NextResponse } from "next/server";
import {
  CulqiApiError,
  createCulqiCharge,
  getPaymentConfig,
  type CulqiAuthentication3DS,
} from "@/lib/payments";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ChargePayload = {
  authentication3DS?: unknown;
  deviceId?: unknown;
  email?: unknown;
  orderCode?: unknown;
  sourceId?: unknown;
};

type StoredAttemptPayload = {
  device_finger_print_id?: unknown;
  source_id?: unknown;
};

type ChargeOrder = {
  customer_name: string;
  delivery_address: string;
  district: string;
  email: string;
  id: string;
  order_code: string;
  payment_order_id: string | null;
  payment_expires_at: string | null;
  payment_status: string | null;
  status: string;
  total_amount: number;
  whatsapp: string;
};

function isCulqiSourceId(value: string) {
  return /^(tkn|ype)_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(value);
}

function isDeviceId(value: string) {
  return /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function parseAuthentication3DS(value: unknown): CulqiAuthentication3DS | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid 3DS authentication response.");
  }

  const payload = value as Record<string, unknown>;
  const readRequired = (key: string) => {
    const field = String(payload[key] ?? "").trim();
    if (!field || field.length > 512) throw new Error("Invalid 3DS authentication response.");
    return field;
  };
  const directoryServerTransactionId = String(payload.directoryServerTransactionId ?? "").trim();
  if (directoryServerTransactionId.length > 512) {
    throw new Error("Invalid 3DS authentication response.");
  }

  return {
    cavv: readRequired("cavv"),
    ...(directoryServerTransactionId ? { directoryServerTransactionId } : {}),
    eci: readRequired("eci"),
    protocolVersion: readRequired("protocolVersion"),
    xid: readRequired("xid"),
  };
}

export async function POST(request: Request) {
  if (!getPaymentConfig().enabled) {
    return NextResponse.json(
      { ok: false, error: "Culqi payments are not enabled yet." },
      { status: 503 },
    );
  }

  let order: ChargeOrder | null = null;
  let createdChargeId: string | null = null;

  try {
    const payload = await request.json() as ChargePayload;
    const orderCode = String(payload.orderCode ?? "").trim().toUpperCase();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const sourceId = String(payload.sourceId ?? "").trim();
    const deviceId = String(payload.deviceId ?? "").trim();
    const authentication3DS = parseAuthentication3DS(payload.authentication3DS);

    if (
      !orderCode
      || !email
      || !isCulqiSourceId(sourceId)
      || (sourceId.startsWith("tkn_") && !isDeviceId(deviceId))
    ) {
      return NextResponse.json(
        { ok: false, error: "Valid order, email, Culqi token, and card security fingerprint are required." },
        { status: 400 },
      );
    }

    await enforcePublicApiSecurity({
      email,
      request,
      scope: "payments",
      whatsapp: "",
    });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_code, customer_name, email, whatsapp, delivery_address, district, total_amount, status, payment_status, payment_order_id, payment_expires_at")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (error) throw new Error(error.message);
    order = data as ChargeOrder | null;

    if (!order || order.email.trim().toLowerCase() !== email) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    if (order.status === "cancelled" || order.status === "delivered") {
      return NextResponse.json({ ok: false, error: "This order cannot accept payment." }, { status: 409 });
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({
        ok: true,
        orderCode: order.order_code,
        paymentStatus: "paid",
      });
    }
    if (
      order.payment_expires_at
      && new Date(order.payment_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { ok: false, error: "This payment session expired. Refresh the page to start again." },
        { status: 410 },
      );
    }
    if (!order.payment_order_id) {
      return NextResponse.json(
        { ok: false, error: "Culqi checkout order has not been prepared." },
        { status: 409 },
      );
    }

    const { data: attempt, error: attemptReadError } = await supabase
      .from("payment_attempts")
      .select("provider_payload")
      .eq("provider", "culqi")
      .eq("provider_order_id", order.payment_order_id)
      .maybeSingle();
    if (attemptReadError) throw new Error(attemptReadError.message);

    if (authentication3DS) {
      const stored = attempt?.provider_payload as StoredAttemptPayload | null;
      if (
        stored?.source_id !== sourceId
        || stored?.device_finger_print_id !== deviceId
      ) {
        return NextResponse.json(
          { ok: false, error: "The 3DS authentication does not match this payment attempt." },
          { status: 409 },
        );
      }
    }

    const chargeResult = await createCulqiCharge({
      amount: Number(order.total_amount),
      authentication3DS,
      customerEmail: order.email,
      customerName: order.customer_name,
      deliveryAddress: order.delivery_address,
      deviceFingerprintId: deviceId || undefined,
      district: order.district,
      orderCode: order.order_code,
      phoneNumber: order.whatsapp,
      sourceId,
    });
    if (chargeResult.requires3DS) {
      const { error: reviewUpdateError } = await supabase
        .from("payment_attempts")
        .update({
          payment_method: "card",
          provider_payload: {
            action: chargeResult.response,
            device_finger_print_id: deviceId,
            source_id: sourceId,
            stage: "requires_3ds",
          },
        })
        .eq("provider", "culqi")
        .eq("provider_order_id", order.payment_order_id);
      if (reviewUpdateError) throw new Error(reviewUpdateError.message);

      return NextResponse.json({
        ok: true,
        orderCode: order.order_code,
        paymentStatus: "requires_3ds",
        requires3DS: true,
      });
    }

    const charge = chargeResult.charge;
    createdChargeId = charge.id;
    const sourceType = sourceId.startsWith("ype_") ? "yape" : "card";

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_charge_id: charge.id,
        payment_failure_code: null,
        payment_failure_message: null,
        payment_metadata: charge,
        payment_method: "Culqi",
      })
      .eq("id", order.id);
    if (updateError) throw new Error(updateError.message);

    const { error: attemptError } = await supabase
      .from("payment_attempts")
      .update({
        payment_method: sourceType,
        provider_charge_id: charge.id,
        provider_payload: charge,
      })
      .eq("provider", "culqi")
      .eq("provider_order_id", order.payment_order_id);
    if (attemptError) throw new Error(attemptError.message);

    // A successful browser token or charge response is never used to mark the
    // reservation paid. The verified Culqi webhook is the source of truth.
    return NextResponse.json({
      ok: true,
      orderCode: order.order_code,
      paymentStatus: "awaiting_webhook",
    });
  } catch (error) {
    if (createdChargeId && order) {
      // The bank-facing charge already exists. Avoid inviting a duplicate retry
      // if a later local persistence step failed; the webhook can still match by
      // the Bagelito order code stored in Culqi metadata.
      return NextResponse.json({
        ok: true,
        orderCode: order.order_code,
        paymentStatus: "awaiting_webhook",
      }, { status: 202 });
    }

    if (order?.id && error instanceof CulqiApiError) {
      const supabase = createSupabaseAdminClient();
      const failureCode = error.code;
      const failureMessage = error.userMessage;

      await supabase
        .from("orders")
        .update({
          payment_charge_id: error.chargeId,
          payment_failure_code: failureCode,
          payment_failure_message: failureMessage,
          payment_status: "failed",
          status: "needs_correction",
        })
        .eq("id", order.id)
        .neq("payment_status", "paid");

      if (order.payment_order_id) {
        await supabase
          .from("payment_attempts")
          .update({
            failure_code: failureCode,
            failure_message: failureMessage,
            provider_charge_id: error.chargeId,
            status: "failed",
          })
          .eq("provider", "culqi")
          .eq("provider_order_id", order.payment_order_id);
      }

      if (order.status !== "needs_correction") {
        await supabase.from("order_status_history").insert({
          changed_by: "culqi charge",
          new_status: "needs_correction",
          old_status: order.status,
          order_id: order.id,
        });
      }
    }

    const status = error instanceof PublicApiError
      ? error.status
      : error instanceof CulqiApiError
        ? 402
        : 500;
    const message = error instanceof CulqiApiError
      ? error.userMessage
      : error instanceof Error
        ? error.message
        : "Could not process Culqi payment.";

    return NextResponse.json(
      { ok: false, error: message },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof PublicApiError && error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : {}),
        },
        status,
      },
    );
  }
}
