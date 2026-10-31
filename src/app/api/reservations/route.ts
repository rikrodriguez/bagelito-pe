import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { trackBagelitoServerEvent } from "@/lib/server-analytics";
import { createReservation } from "@/lib/reservations/service";
import { ManualReservationError } from "@/lib/reservations/manual-errors";
import { observeManual } from "@/lib/reservations/manual-observation";
import { recoverManualReservationForReview } from "@/lib/reservations/manual-review-recovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId: string | undefined;
  observeManual(() => {
    const value = getRequestId(request);
    if (typeof value === "string") requestId = value;
    return value;
  });
  function observedDuration() {
    let duration: number | undefined;
    observeManual(() => {
      const value = getDurationMs(startedAt);
      if (typeof value === "number") duration = value;
      return value;
    });
    return duration;
  }

  observeManual(() => logInfo("reservation_api_start", {
    method: "POST",
    requestId,
    route: "/api/reservations",
  }));

  try {
    const formData = await request.formData();
    await enforcePublicApiSecurity({
      email: String(formData.get("email") ?? ""),
      request,
      scope: "reservations",
      trapValue: String(formData.get("website") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      observe: observeManual,
    });
    // Review closes intake while preserving private, read-only recovery of
    // operations already bound by the full v1 request and proof identity.
    const { amount, operationId, orderCode, packSlug, replayed } = process.env.BAGELITO_MERCHANT_REVIEW_ONLY === "true"
      ? await recoverManualReservationForReview(formData)
      : await createReservation(formData);
    if (!replayed) observeManual(() => trackBagelitoServerEvent("Reservation Created", { pack: packSlug, amount }, request));
    observeManual(() => logInfo("reservation_api_success", {
      amount,
      durationMs: observedDuration(),
      orderCode,
      operationId,
      packSlug,
      replayed,
      requestId,
      route: "/api/reservations",
      status: 200,
    }));
    return NextResponse.json({ ok: true, operationId, orderCode }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof PublicApiError || error instanceof ManualReservationError ? error.status : 400;
    const errorType = error instanceof ZodError
      ? "validation"
      : error instanceof PublicApiError || error instanceof ManualReservationError
        ? error.code
        : "server";

    observeManual(() => trackBagelitoServerEvent("Reservation API Error", {
      status,
      type: errorType,
    }, request));
    observeManual(() => {
      const context = {
        durationMs: observedDuration(),
        requestId,
        route: "/api/reservations",
        status,
        type: errorType,
        ...(error instanceof ManualReservationError ? { operationId: error.operationId, state: error.state } : {}),
      };

      if (error instanceof ManualReservationError && error.state === "pending") {
        return logWarn("reservation_api_pending", context);
      } else if (error instanceof PublicApiError) {
        return logWarn("reservation_api_public_blocked", {
          ...context,
          retryAfterSeconds: error.retryAfterSeconds ?? undefined,
        });
      } else if (errorType === "validation") {
        return logWarn("reservation_api_validation_failed", context);
      }
      return logError("reservation_api_failed", error, context);
    });

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not submit reservation.";

    return NextResponse.json(
      { ok: false, error: message,
        ...(error instanceof ManualReservationError ? {
          code: error.code, operationId: error.operationId,
          ...(error.state ? { state: error.state } : {}),
        } : {}),
      },
      {
        headers: { "Cache-Control": "no-store",
          ...(error instanceof PublicApiError && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {}),
        },
        status,
      },
    );
  }
}
