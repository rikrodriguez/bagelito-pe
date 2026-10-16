import { NextResponse } from "next/server";
import {
  createCulqiCharge,
  isCulqiRequestAllowed,
  type CulqiAuthentication3DS,
} from "@/lib/payments";
import { coordinateCulqiCharge } from "@/lib/payments/charge-coordinator";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ChargePayload = {
  authentication3DS?: unknown;
  checkoutSessionId?: unknown;
  deviceId?: unknown;
  email?: unknown;
  orderCode?: unknown;
  sourceId?: unknown;
};

type ChargeOrder = {
  checkout_session_id: string | null;
  customer_name: string;
  delivery_address: string;
  district: string;
  email: string;
  id: string;
  order_code: string;
  payment_order_id: string | null;
  payment_lane: string;
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
  if (!isCulqiRequestAllowed(request)) {
    return NextResponse.json(
      { ok: false, error: "Culqi payments are not enabled yet." },
      { status: 503 },
    );
  }

  let order: ChargeOrder | null = null;

  try {
    const payload = await request.json() as ChargePayload;
    const checkoutSessionId = typeof payload.checkoutSessionId === "string" ? payload.checkoutSessionId.trim().toLowerCase() : "";
    const orderCode = String(payload.orderCode ?? "").trim().toUpperCase();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const sourceId = String(payload.sourceId ?? "").trim();
    const deviceId = String(payload.deviceId ?? "").trim();
    if (sourceId.startsWith("ype_") && payload.authentication3DS != null) {
      return NextResponse.json({ ok: false, error: "Card 3DS is not supported for Yape." }, { status: 400 });
    }
    const authentication3DS = parseAuthentication3DS(payload.authentication3DS);

    if (
      !orderCode
      || !email
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutSessionId)
      || !isCulqiSourceId(sourceId)
      || (sourceId.startsWith("tkn_") && !isDeviceId(deviceId))
      || (sourceId.startsWith("ype_") && payload.authentication3DS != null)
    ) {
      return NextResponse.json(
        { ok: false, error: "Valid order, checkout session, email, Culqi token, and card security fingerprint are required." },
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
      .select("id, order_code, checkout_session_id, customer_name, email, whatsapp, delivery_address, district, total_amount, status, payment_status, payment_lane, payment_order_id, payment_expires_at")
      .eq("order_code", orderCode)
      .eq("checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    order = data as ChargeOrder | null;

    if (!order || order.order_code !== orderCode
      || typeof order.checkout_session_id !== "string" || order.checkout_session_id.toLowerCase() !== checkoutSessionId
      || order.email.trim().toLowerCase() !== email) {
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
    if (order.payment_order_id || order.payment_lane !== "token") {
      return NextResponse.json(
        { ok: false, error: "This reservation cannot accept token charges." },
        { status: 409 },
      );
    }

    if (sourceId.startsWith("ype_") && Number(order.total_amount) > 2000) {
      return NextResponse.json({ ok: false, error: "Yape supports a maximum of S/ 2000 per payment." }, { status: 400 });
    }

    const chargeOrder = order;
    const result = await coordinateCulqiCharge({
      db: supabase, orderId: order.id, orderCode: order.order_code, sourceId, deviceId,
      has3DS: Boolean(authentication3DS),
      createCharge: () => createCulqiCharge({

      amount: Number(chargeOrder.total_amount),
      authentication3DS,
      customerEmail: chargeOrder.email,
      customerName: chargeOrder.customer_name,
      deliveryAddress: chargeOrder.delivery_address,
      deviceFingerprintId: deviceId || undefined,
      district: chargeOrder.district,
      orderCode: chargeOrder.order_code,
      phoneNumber: chargeOrder.whatsapp,
      sourceId,
      }),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : 500;
    const message = error instanceof PublicApiError ? error.message : "Could not process Culqi payment.";

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
