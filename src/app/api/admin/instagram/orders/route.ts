import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, getAdminCookieName } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const expected = createAdminToken();
  const actual = request.cookies.get(getAdminCookieName())?.value ?? "";
  return Boolean(expected) && actual === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized", ok: false }, { status: 401 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 100));
  const supabase = createSupabaseAdminClient();

  const [{ data: orders, error: ordersError }, { data: production, error: productionError }, { data: syncHealth, error: syncError }] = await Promise.all([
    supabase
      .from("instagram_sales_pipeline")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("instagram_production_requirements")
      .select("*")
      .order("item_kind", { ascending: true })
      .order("item_name", { ascending: true }),
    supabase
      .from("instagram_crm_sync_health")
      .select("*")
      .order("status", { ascending: true }),
  ]);

  const error = ordersError ?? productionError ?? syncError;
  if (error) {
    return NextResponse.json(
      { error: "instagram_orders_lookup_failed", ok: false },
      { status: error.code === "42P01" ? 503 : 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      orders: orders ?? [],
      production: production ?? [],
      crmSyncHealth: syncHealth ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
