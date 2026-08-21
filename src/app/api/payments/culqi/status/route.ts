import { NextResponse } from "next/server";
import { getPaymentConfig } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!getPaymentConfig().enabled) {
    return NextResponse.json(
      { ok: false, error: "Culqi payments are not enabled yet." },
      { status: 503 },
    );
  }

  try {
    const payload = await request.json() as {
      checkoutSessionId?: unknown;
      orderCode?: unknown;
    };
    const checkoutSessionId = String(payload.checkoutSessionId ?? "").trim();
    const orderCode = String(payload.orderCode ?? "").trim().toUpperCase();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutSessionId) || !orderCode) {
      return NextResponse.json({ ok: false, error: "Invalid payment status request." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_code, payment_status, payment_expires_at, payment_order_id, status")
      .eq("order_code", orderCode)
      .eq("checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });

    let paymentStatus = String(data.payment_status ?? "pending");
    let orderStatus = String(data.status);
    const expiresAt = data.payment_expires_at ? String(data.payment_expires_at) : null;

    if (
      paymentStatus === "pending"
      && !data.payment_order_id
      && expiresAt
      && new Date(expiresAt).getTime() <= Date.now()
    ) {
      const { data: expiredOrder, error: expireError } = await supabase
        .from("orders")
        .update({
          payment_status: "expired",
          status: "cancelled",
        })
        .eq("id", data.id)
        .eq("payment_status", "pending")
        .select("id")
        .maybeSingle();

      if (!expireError && expiredOrder?.id) {
        await supabase.from("order_status_history").insert({
          changed_by: "payment expiry",
          new_status: "cancelled",
          old_status: orderStatus,
          order_id: data.id,
        });
        paymentStatus = "expired";
        orderStatus = "cancelled";
      }
    }

    return NextResponse.json(
      {
        expiresAt,
        ok: true,
        orderCode: data.order_code,
        orderStatus,
        paymentStatus,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read payment status.",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500,
      },
    );
  }
}
