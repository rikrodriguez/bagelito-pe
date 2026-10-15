import { NextResponse } from "next/server";
import { fetchCulqiEvent, isCulqiRequestAllowed } from "@/lib/payments";
import { parseCulqiEventResource, verifyCulqiEventIdentity } from "@/lib/payments/verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const eventTypes = new Set([
  "order.status.changed", "charge.creation.succeeded", "charge.creation.failed", "charge.expired",
]);

type DiagnosticStage = "scope" | "request" | "event_lookup" | "event_identity"
  | "resource" | "database_client" | "transaction";
type DiagnosticReason = "scope_rejected" | "invalid_event_id" | "malformed_request"
  | "upstream_unauthorized" | "upstream_not_found" | "upstream_rate_limited" | "upstream_failure"
  | "event_identity_mismatch" | "refund_requires_review" | "event_ignored" | "missing_resource"
  | "database_client_failure" | "rpc_missing" | "rpc_permission_denied"
  | "amount_currency_mismatch" | "order_missing" | "source_mismatch"
  | "payment_attempt_missing" | "legacy_requires_review" | "rpc_failure"
  | "invalid_rpc_result" | "applied" | "duplicate" | "unexpected_failure";
type UpstreamFailureDiagnostic = {
  upstreamHttpStatus: number | null;
  upstreamFailureClass: "none" | "http" | "timeout" | "transport_or_unknown";
};

function eventLookupFailureDiagnostic(error: unknown): UpstreamFailureDiagnostic {
  let status: unknown;
  let name: unknown;
  if (error && typeof error === "object") {
    // Read only the two needed fields; hostile accessors must not interrupt
    // the bounded response. Never inspect messages, payloads or nested causes.
    try { status = (error as { status?: unknown }).status; } catch { /* Unknown transport failure. */ }
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return { upstreamHttpStatus: status, upstreamFailureClass: "http" };
    }
    try { name = (error as { name?: unknown }).name; } catch { /* Unknown transport failure. */ }
  }
  return {
    upstreamHttpStatus: null,
    // AbortError can describe cancellation; it does not prove a timeout.
    upstreamFailureClass: name === "TimeoutError" ? "timeout" : "transport_or_unknown",
  };
}

function rpcFailureReason(error: unknown): DiagnosticReason {
  if (!error || typeof error !== "object") return "rpc_failure";
  const value = error as { code?: unknown; message?: unknown };
  if (value.code === "42883" || value.code === "PGRST202") return "rpc_missing";
  if (value.code === "42501") return "rpc_permission_denied";
  // Exact known database messages become fixed labels; no provider text is logged.
  switch (value.message) {
    case "Payment amount or currency mismatch": return "amount_currency_mismatch";
    case "Payment order not found": return "order_missing";
    case "Charge source does not match the claimed attempt": return "source_mismatch";
    case "Payment attempt not found": return "payment_attempt_missing";
    case "Legacy payment requires manual reconciliation":
    case "Alternative payment orders require manual reconciliation": return "legacy_requires_review";
    default: return "rpc_failure";
  }
}

function exceptionReason(stage: DiagnosticStage, error: unknown, upstreamHttpStatus: number | null): DiagnosticReason {
  if (stage === "request") return "malformed_request";
  if (stage === "event_identity") return "event_identity_mismatch";
  if (stage === "database_client") return "database_client_failure";
  if (stage === "transaction") return rpcFailureReason(error);
  if (stage === "event_lookup") {
    if (upstreamHttpStatus === 401 || upstreamHttpStatus === 403) return "upstream_unauthorized";
    if (upstreamHttpStatus === 404) return "upstream_not_found";
    if (upstreamHttpStatus === 429) return "upstream_rate_limited";
    return "upstream_failure";
  }
  return "unexpected_failure";
}

export async function POST(request: Request) {
  let stage: DiagnosticStage = "scope";
  let eventVerified = false;
  let transactionAttempted = false;
  let upstreamFailure: UpstreamFailureDiagnostic = { upstreamHttpStatus: null, upstreamFailureClass: "none" };
  const respond = (httpStatus: number, payload: Record<string, unknown>, reason: DiagnosticReason) => {
    const allowedStates = new Set(["paid", "pending", "failed", "expired"]);
    // The RPC reports this event's outcome, which can differ from the order's
    // persisted state (for example, a late failed event after a paid event).
    const eventPaymentState = !eventVerified ? "none"
      : typeof payload.status === "string" && allowedStates.has(payload.status) ? payload.status : "unknown";
    // Private runtime logs contain only fixed labels, numbers and booleans.
    // Avoid the monitoring helper: it can notify an external webhook and write DB rows.
    console.info("culqi_webhook_diagnostic", {
      stage, reason, httpStatus, eventVerified, transactionAttempted,
      eventPaymentState, duplicate: payload.duplicate === true,
      upstreamHttpStatus: upstreamFailure.upstreamHttpStatus,
      upstreamFailureClass: upstreamFailure.upstreamFailureClass,
    });
    return NextResponse.json(payload, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
  };
  try {
    if (!isCulqiRequestAllowed(request)) {
      return respond(503, { ok: false, error: "Culqi payments are not enabled yet." }, "scope_rejected");
    }
    stage = "request";
    const received = await request.json() as { id?: unknown };
    const eventId = String(received.id ?? "").trim();
    if (!/^evt_(test|live)_[A-Za-z0-9_-]{8,40}$/.test(eventId)) {
      return respond(400, { ok: false, error: "A valid Culqi webhook event ID is required." }, "invalid_event_id");
    }
    stage = "event_lookup";
    const verified = await fetchCulqiEvent(eventId);
    stage = "event_identity";
    const eventType = verifyCulqiEventIdentity(eventId, verified);
    eventVerified = true;
    stage = "resource";
    const resource = parseCulqiEventResource(verified.data);
    if (eventType.startsWith("refund.") || resource?.object === "refund") {
      return respond(501, { ok: false, error: "Refund reconciliation is not implemented." }, "refund_requires_review");
    }
    if (!eventTypes.has(eventType)) return respond(200, { ok: true, ignored: true }, "event_ignored");
    if (!resource || typeof resource.id !== "string" || !resource.id) {
      return respond(400, { ok: false, error: "Webhook payment data is missing." }, "missing_resource");
    }
    // The service-role RPC validates amount, currency and order identity, locks
    // event and order, and commits payment/history/event-marker as ONE transaction.
    // No nontransactional fallback: a missing migration must fail closed.
    stage = "database_client";
    const database = createSupabaseAdminClient();
    stage = "transaction";
    transactionAttempted = true;
    const { data, error } = await database.rpc("apply_culqi_payment_event", {
      p_event_id: eventId, p_event_type: eventType,
      p_resource: resource, p_verified_payload: verified,
    });
    if (error) return respond(500, { ok: false, error: "Could not process Culqi webhook." }, rpcFailureReason(error));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return respond(500, { ok: false, error: "Could not process Culqi webhook." }, "invalid_rpc_result");
    }
    return respond(200, { ok: true, ...data }, data.duplicate === true ? "duplicate" : "applied");
  } catch (error) {
    // Retriable failure; do not acknowledge an event whose transaction failed.
    if (stage === "event_lookup") upstreamFailure = eventLookupFailureDiagnostic(error);
    return respond(500, { ok: false, error: "Could not process Culqi webhook." }, exceptionReason(stage, error, upstreamFailure.upstreamHttpStatus));
  }
}
