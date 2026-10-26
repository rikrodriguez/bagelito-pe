import { NextResponse } from "next/server";
import { getPaymentConfig, isCulqiRequestAllowed } from "@/lib/payments";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type CreateOrderPayload = { checkoutSessionId?: unknown; orderCode?: unknown; email?: unknown };

// Compatibility URL: prepares a LOCAL token session, never a provider order.
export async function POST(request: Request) {
  const config = getPaymentConfig();
  if (!isCulqiRequestAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Culqi payments are not enabled yet." }, { status: 503 });
  }
  try {
    const payload = await request.json() as CreateOrderPayload;
    const checkoutSessionId = typeof payload.checkoutSessionId === "string" ? payload.checkoutSessionId.trim().toLowerCase() : "";
    const orderCode = String(payload.orderCode ?? "").trim().toUpperCase();
    const email = String(payload.email ?? "").trim().toLowerCase();
    if (!orderCode || !email
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutSessionId)) {
      return NextResponse.json({ ok: false, error: "Order code, checkout session and email are required." }, { status: 400 });
    }
    await enforcePublicApiSecurity({ email, request, scope: "payments", whatsapp: "" });
    const supabase = createSupabaseAdminClient();
    const { data: order, error } = await supabase.from("orders")
      .select("id, order_code, checkout_session_id, email, payment_provider, payment_lane, payment_order_id")
      .eq("order_code", orderCode).eq("checkout_session_id", checkoutSessionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.order_code !== orderCode
      || typeof order.checkout_session_id !== "string" || order.checkout_session_id.toLowerCase() !== checkoutSessionId
      || order.email.trim().toLowerCase() !== email) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    if (order.payment_provider !== "culqi" || order.payment_lane !== "token" || order.payment_order_id) {
      return NextResponse.json({ ok: false, error: "This reservation cannot enter token checkout." }, { status: 409 });
    }
    const { data: session, error: sessionError } = await supabase.rpc("prepare_culqi_token_session", { p_order_id: order.id });
    if (sessionError || !session?.sessionId) {
      return NextResponse.json({ ok: false, error: "Payment is in progress, expired or requires review. Do not pay again." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, sessionId: session.sessionId, amount: session.amount,
      expiresAt: session.expiresAt, currency: config.currency, publicKey: config.publicKey });
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof PublicApiError ? error.message : "Could not prepare token checkout." }, { status });
  }
}
