import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getPaymentConfig } from "@/lib/payments";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";
import { createCulqiReservation } from "@/lib/reservations/service";

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
      email?: unknown;
      website?: unknown;
      whatsapp?: unknown;
    };

    await enforcePublicApiSecurity({
      email: String(payload.email ?? ""),
      request,
      scope: "reservations",
      trapValue: String(payload.website ?? ""),
      whatsapp: String(payload.whatsapp ?? ""),
    });

    const reservation = await createCulqiReservation(payload);
    return NextResponse.json(
      { ok: true, ...reservation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof PublicApiError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not start Culqi checkout.";

    return NextResponse.json(
      { ok: false, error: message },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof PublicApiError && error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : {}),
        },
        status,
      },
    );
  }
}
