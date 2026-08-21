import { NextResponse } from "next/server";
import { getMissingReservationEnv, getSiteUrl } from "@/lib/env";
import { logError } from "@/lib/monitoring";
import { getPaymentConfig, getMissingCulqiEnv } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const missing = getMissingReservationEnv();
  const alertsConfigured = Boolean(process.env.MONITORING_ALERT_WEBHOOK_URL?.trim());
  const payment = getPaymentConfig();

  if (missing.length) {
    return NextResponse.json(
      {
        alertsConfigured,
        checkedAt: new Date().toISOString(),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
        missing,
        ok: false,
        payment: {
          enabled: payment.enabled,
          missingCulqiEnv: payment.provider === "culqi" ? getMissingCulqiEnv() : [],
          provider: payment.provider,
        },
        siteUrl: getSiteUrl(),
        supabase: "not_configured",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("batches")
      .select("id, status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        alertsConfigured,
        batch: data
          ? {
            id: data.id,
            status: data.status,
          }
          : null,
        checkedAt: new Date().toISOString(),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
        ok: true,
        payment: {
          enabled: payment.enabled,
          missingCulqiEnv: payment.provider === "culqi" ? getMissingCulqiEnv() : [],
          provider: payment.provider,
        },
        siteUrl: getSiteUrl(),
        supabase: "ok",
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    logError("healthcheck_failed", error, {
      route: "/api/health",
    });

    return NextResponse.json(
      {
        alertsConfigured,
        checkedAt: new Date().toISOString(),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
        ok: false,
        payment: {
          enabled: payment.enabled,
          missingCulqiEnv: payment.provider === "culqi" ? getMissingCulqiEnv() : [],
          provider: payment.provider,
        },
        siteUrl: getSiteUrl(),
        supabase: "error",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
}
