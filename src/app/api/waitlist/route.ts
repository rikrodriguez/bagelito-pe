import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createWaitlistSignup } from "@/lib/waitlist/service";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
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
    const errorType = error instanceof ZodError ? "validation" : "server";
    const context = {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/waitlist",
      status: 400,
      type: errorType,
    };

    await trackBagelitoServerEvent("Waitlist API Error", context, request);

    if (errorType === "validation") {
      logWarn("waitlist_api_validation_failed", context);
    } else {
      logError("waitlist_api_failed", error, context);
    }

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not join waitlist.";

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
