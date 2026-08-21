import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { trackBagelitoServerEvent } from "@/lib/server-analytics";
import { createReservation } from "@/lib/reservations/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);

  logInfo("reservation_api_start", {
    method: "POST",
    requestId,
    route: "/api/reservations",
  });

  try {
    const formData = await request.formData();
    await enforcePublicApiSecurity({
      email: String(formData.get("email") ?? ""),
      request,
      scope: "reservations",
      trapValue: String(formData.get("website") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
    });
    const { amount, orderCode, packSlug } = await createReservation(formData);
    await trackBagelitoServerEvent("Reservation Created", { pack: packSlug, amount }, request);
    logInfo("reservation_api_success", {
      amount,
      durationMs: getDurationMs(startedAt),
      orderCode,
      packSlug,
      requestId,
      route: "/api/reservations",
      status: 200,
    });
    return NextResponse.json({ ok: true, orderCode });
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : 400;
    const errorType = error instanceof ZodError
      ? "validation"
      : error instanceof PublicApiError
        ? error.code
        : "server";

    await trackBagelitoServerEvent("Reservation API Error", {
      status,
      type: errorType,
    }, request);
    const context = {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/reservations",
      status,
      type: errorType,
    };

    if (error instanceof PublicApiError) {
      logWarn("reservation_api_public_blocked", {
        ...context,
        retryAfterSeconds: error.retryAfterSeconds ?? undefined,
      });
    } else if (errorType === "validation") {
      logWarn("reservation_api_validation_failed", context);
    } else {
      logError("reservation_api_failed", error, context);
    }

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not submit reservation.";

    return NextResponse.json(
      { ok: false, error: message },
      {
        headers: error instanceof PublicApiError && error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined,
        status,
      },
    );
  }
}
