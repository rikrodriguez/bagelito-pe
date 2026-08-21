import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createComplaint } from "@/lib/complaints/service";
import { getDurationMs, getRequestId, logError, logInfo, logWarn } from "@/lib/monitoring";
import { PublicApiError, enforcePublicApiSecurity } from "@/lib/public-api-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);

  logInfo("complaint_api_start", { method: "POST", requestId, route: "/api/complaints" });

  try {
    const payload = await request.json() as { email?: unknown; phone?: unknown; website?: unknown };
    await enforcePublicApiSecurity({
      email: String(payload.email ?? ""),
      request,
      scope: "complaints",
      trapValue: String(payload.website ?? ""),
      whatsapp: String(payload.phone ?? ""),
    });

    const complaint = await createComplaint(payload);
    logInfo("complaint_api_success", {
      complaintCode: complaint.complaint_code,
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/complaints",
      status: 201,
    });

    return NextResponse.json(
      {
        complaint: {
          code: complaint.complaint_code,
          createdAt: complaint.created_at,
        },
        ok: true,
      },
      { headers: { "Cache-Control": "no-store" }, status: 201 },
    );
  } catch (error) {
    const status = error instanceof PublicApiError ? error.status : error instanceof ZodError ? 400 : 500;
    const context = {
      durationMs: getDurationMs(startedAt),
      requestId,
      route: "/api/complaints",
      status,
    };

    if (error instanceof PublicApiError || error instanceof ZodError) {
      logWarn("complaint_api_rejected", context);
    } else {
      logError("complaint_api_failed", error, context);
    }

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof PublicApiError
        ? error.code === "rate_limited"
          ? "Has realizado varios intentos. Espera unos minutos y vuelve a intentarlo."
          : "No pudimos procesar el envío. Actualiza la página e inténtalo otra vez."
        : error instanceof Error && error.message.includes("aún no está configurado")
          ? "El Libro de Reclamaciones está temporalmente fuera de servicio. Escríbenos a contacto@bagelito.pe para dejar constancia."
          : "No pudimos registrar la hoja en este momento. Inténtalo nuevamente o escribe a contacto@bagelito.pe.";

    return NextResponse.json(
      { error: message, ok: false },
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
