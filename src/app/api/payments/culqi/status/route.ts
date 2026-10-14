import { NextResponse } from "next/server";
import { isCulqiRequestAllowed } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isCulqiRequestAllowed(request)) {
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
      .select("id, order_code, payment_status, payment_expires_at, payment_order_id, payment_reconciliation_required, status")
      .eq("order_code", orderCode)
      .eq("checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });

    const expiresAt = data.payment_expires_at ? String(data.payment_expires_at) : null;
    // The database re-reads under the same batch/order locks as payment events.
    // Never cancel from a stale snapshot or infer a charge outcome from time.
    const { data: payment, error: expiryError } = await supabase.rpc("expire_culqi_token_session", {
      p_order_id: data.id,
      p_checkout_session_id: checkoutSessionId,
    });
    if (expiryError || !payment || typeof payment !== "object" || Array.isArray(payment)
      || typeof payment.paymentStatus !== "string" || typeof payment.orderStatus !== "string"
      || typeof payment.reconciliationRequired !== "boolean") {
      throw new Error("Could not verify payment state.");
    }

    return NextResponse.json(
      {
        expiresAt,
        ok: true,
        orderCode: data.order_code,
        orderStatus: payment.orderStatus,
        paymentStatus: payment.paymentStatus,
        reconciliationRequired: payment.reconciliationRequired,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not read payment status.",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500,
      },
    );
  }
}
