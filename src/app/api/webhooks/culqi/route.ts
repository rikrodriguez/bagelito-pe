import { NextResponse } from "next/server";
import { fetchCulqiEvent, isCulqiRequestAllowed } from "@/lib/payments";
import { parseCulqiEventResource, verifyCulqiEventIdentity } from "@/lib/payments/verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const eventTypes = new Set([
  "order.status.changed", "charge.creation.succeeded", "charge.creation.failed", "charge.expired",
]);

export async function POST(request: Request) {
  if (!isCulqiRequestAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Culqi payments are not enabled yet." }, { status: 503 });
  }
  try {
    const received = await request.json() as { id?: unknown };
    const eventId = String(received.id ?? "").trim();
    if (!/^evt_(test|live)_[A-Za-z0-9_-]{8,40}$/.test(eventId)) {
      return NextResponse.json({ ok: false, error: "A valid Culqi webhook event ID is required." }, { status: 400 });
    }
    const verified = await fetchCulqiEvent(eventId);
    const eventType = verifyCulqiEventIdentity(eventId, verified);
    const resource = parseCulqiEventResource(verified.data);
    if (eventType.startsWith("refund.") || resource?.object === "refund") {
      return NextResponse.json({ ok: false, error: "Refund reconciliation is not implemented." }, { status: 501 });
    }
    if (!eventTypes.has(eventType)) return NextResponse.json({ ok: true, ignored: true });
    if (!resource || typeof resource.id !== "string" || !resource.id) {
      return NextResponse.json({ ok: false, error: "Webhook payment data is missing." }, { status: 400 });
    }
    // The service-role RPC validates amount, currency and order identity, locks
    // event and order, and commits payment/history/event-marker as ONE transaction.
    // No nontransactional fallback: a missing migration must fail closed.
    const { data, error } = await createSupabaseAdminClient().rpc("apply_culqi_payment_event", {
      p_event_id: eventId, p_event_type: eventType,
      p_resource: resource, p_verified_payload: verified,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Payment transaction did not return a result.");
    }
    return NextResponse.json({ ok: true, ...data });
  } catch {
    // Retriable failure; do not acknowledge an event whose transaction failed.
    return NextResponse.json({ ok: false, error: "Could not process Culqi webhook." }, { status: 500 });
  }
}
