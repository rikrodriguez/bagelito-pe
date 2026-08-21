import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { trackBagelitoServerEvent } from "@/lib/server-analytics";
import { findTrackedOrder, TrackLookupError } from "@/lib/tracking/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);

  logInfo("track_api_start", {
    method: "POST",
    requestId,
    route: "/api/track",
  });

  try {
    const payload = await request.json() as { contact?: unknown; orderCode?: unknown; website?: unknown };
    const contact = String(payload.contact ?? "");

    await enforcePublicApiSecurity({
      email: contact.includes("@") ? contact : "",
      request,
      scope: "track",
      trapValue: String(payload.website ?? ""),
      whatsapp: contact.includes("@") ? "" : contact,
    });

    const order = await findTrackedOrder(payload);

    await trackBagelitoServerEvent("Track Lookup Success", {
      orderCode: order.orderCode,
      status: order.status,
    }, request);

    logInfo("track_api_success", {
      durationMs: getDurationMs(startedAt),
      orderCode: order.orderCode,
      requestId,
      route: "/api/track",
      status: 200,
    });

    return NextResponse.json(
      { ok: true, order },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const status = error instanceof PublicApiError
      ? error.status
      : error instanceof TrackLookupError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    const errorType = error instanceof ZodError
      ? "validation"
      : error instanceof PublicApiError
        ? error.code
        : error instanceof TrackLookupError
          ? "lookup"
          : "server";
    const context = {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/track",
      status,
      type: errorType,
    };

    await trackBagelitoServerEvent("Track API Error", context, request);

    if (error instanceof PublicApiError) {
      logWarn("track_api_public_blocked", {
        ...context,
        retryAfterSeconds: error.retryAfterSeconds ?? undefined,
      });
    } else if (error instanceof ZodError) {
      logWarn("track_api_validation_failed", context);
    } else if (error instanceof TrackLookupError && error.status < 500) {
      logWarn("track_api_lookup_failed", context);
    } else {
      logError("track_api_failed", error, context);
    }

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not check this reservation.";

    return NextResponse.json(
      { ok: false, error: message },
      {
        headers: {
          ...(error instanceof PublicApiError && error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : {}),
          "Cache-Control": "no-store",
        },
        status,
      },
    );
  }
}
