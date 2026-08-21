import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createWaitlistSignup } from "@/lib/waitlist/service";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { trackBagelitoServerEvent } from "@/lib/server-analytics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);

  logInfo("waitlist_api_start", {
    method: "POST",
    requestId,
    route: "/api/waitlist",
  });

  try {
    const payload = await request.json();
    await enforcePublicApiSecurity({
      email: String((payload as { email?: unknown })?.email ?? ""),
      request,
      scope: "waitlist",
      trapValue: String((payload as { website?: unknown })?.website ?? ""),
      whatsapp: String((payload as { whatsapp?: unknown })?.whatsapp ?? ""),
    });
    const signup = await createWaitlistSignup(payload);
    await trackBagelitoServerEvent("Waitlist Signup Created", { listDate: signup.list_date }, request);
    logInfo("waitlist_api_success", {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/waitlist",
      signupId: signup.id,
      status: 200,
    });
    return NextResponse.json({ ok: true, signup });
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : 400;
    const errorType = error instanceof ZodError
      ? "validation"
      : error instanceof PublicApiError
        ? error.code
        : "server";
    const context = {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/waitlist",
      status,
      type: errorType,
    };

    await trackBagelitoServerEvent("Waitlist API Error", context, request);

    if (error instanceof PublicApiError) {
      logWarn("waitlist_api_public_blocked", {
        ...context,
        retryAfterSeconds: error.retryAfterSeconds ?? undefined,
      });
    } else if (errorType === "validation") {
      logWarn("waitlist_api_validation_failed", context);
    } else {
      logError("waitlist_api_failed", error, context);
    }

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not join waitlist.";

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
