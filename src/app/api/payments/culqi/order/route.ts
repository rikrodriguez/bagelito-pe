import { NextResponse } from "next/server";
import { getPaymentConfig } from "@/lib/payments";
import { toPaymentMinorUnits, createCulqiOrder } from "@/lib/payments/culqi";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateOrderPayload = { orderCode?: unknown; email?: unknown };

export async function POST(request: Request) {
  const config = getPaymentConfig();
  if (!config.enabled) {
    return NextResponse.json({ ok: false, error: "Culqi payments are not enabled yet." }, { status: 503 });
  }

  try {
    const payload = await request.json() as CreateOrderPayload;
    const orderCode = String(payload.orderCode ?? "").trim().toUpperCase();
    const email = String(payload.email ?? "").trim().toLowerCase();
    if (!orderCode || !email) return NextResponse.json({ ok: false, error: "Order code and email are required." }, { status: 400 });

    await enforcePublicApiSecurity({
      email,
      request,
      scope: "payments",
      whatsapp: "",
    });

    const supabase = createSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_code, customer_name, email, whatsapp, total_amount, status, payment_provider, payment_status, payment_order_id, payment_expires_at")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!order) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    if (order.email.trim().toLowerCase() !== email) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    if (order.payment_provider !== "culqi") return NextResponse.json({ ok: false, error: "This is not a Culqi reservation." }, { status: 409 });
    if (order.status === "cancelled" || order.status === "delivered") {
      return NextResponse.json({ ok: false, error: "This order cannot accept payment." }, { status: 409 });
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({ ok: false, error: "This order is already paid." }, { status: 409 });
    }
    if (
      order.payment_expires_at
      && new Date(order.payment_expires_at).getTime() <= Date.now()
    ) {
      const { data: expiredOrder, error: expireError } = await supabase
        .from("orders")
        .update({ payment_status: "expired", status: "cancelled" })
        .eq("id", order.id)
        .neq("payment_status", "paid")
        .select("id")
        .maybeSingle();
      if (expireError) throw new Error(expireError.message);

      if (expiredOrder?.id && order.status !== "cancelled") {
        await supabase.from("order_status_history").insert({
          changed_by: "payment expiry",
          new_status: "cancelled",
          old_status: order.status,
          order_id: order.id,
        });
      }

      return NextResponse.json(
        { ok: false, error: "This payment session expired. Refresh the page to start again." },
        { status: 410 },
      );
    }

    if (!order.payment_expires_at) return NextResponse.json({ ok: false, error: "Reservation expiry is missing." }, { status: 409 });

    const existingOrderId = typeof order.payment_order_id === "string" ? order.payment_order_id : "";
    if (existingOrderId && order.payment_provider === "culqi") {
      return NextResponse.json({
        ok: true,
        amount: toPaymentMinorUnits(Number(order.total_amount)),
        currency: config.currency,
        expiresAt: order.payment_expires_at,
        orderId: existingOrderId,
        publicKey: config.publicKey,
      });
    }

    const culqiOrder = await createCulqiOrder({
      amount: Number(order.total_amount),
      expirationDate: new Date(order.payment_expires_at),
      customerEmail: order.email,
      customerName: order.customer_name,
      orderCode: order.order_code,
      phoneNumber: order.whatsapp,
    });

    const { data: attached, error: attachError } = await supabase.rpc("attach_culqi_order", {
      p_order_id: order.id, p_provider_order: culqiOrder,
    });
    if (attachError) throw new Error(attachError.message);
    if (!attached || attached.paid) {
      return NextResponse.json({ ok: false, error: "The order is already paid or could not be attached." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      amount: culqiOrder.amount,
      currency: culqiOrder.currency_code,
      expiresAt: culqiOrder.expiresAt,
      orderId: culqiOrder.id,
      publicKey: config.publicKey,
    });
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : 500;
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not create Culqi order.",
    }, { status });
  }
}

