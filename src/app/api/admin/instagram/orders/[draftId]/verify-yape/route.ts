import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, getAdminCookieName } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAuthorized(request: NextRequest) {
  const expected = createAdminToken();
  const actual = request.cookies.get(getAdminCookieName())?.value ?? "";
  return Boolean(expected) && actual === expected;
}

async function requestGhlSync() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) return { invoked: false, reason: "supabase_env_missing" };

  const response = await fetch(`${url}/functions/v1/instagram-ghl-sync`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ limit: 10 }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({}));
  return { invoked: true, ok: response.ok, status: response.status, body };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized", ok: false }, { status: 401 });
  }

  const { draftId } = await context.params;
  if (!uuidPattern.test(draftId)) {
    return NextResponse.json({ error: "invalid_draft_id", ok: false }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const verifiedBy = typeof body?.verifiedBy === "string" && body.verifiedBy.trim()
    ? body.verifiedBy.trim().slice(0, 120)
    : "Bagelito admin";

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("verify_instagram_yape_order", {
    p_draft_id: draftId,
    p_verified_by: verifiedBy,
  });

  if (error) {
    const knownConflict = [
      "payment_evidence_required",
      "quote_not_verified",
      "human_review_must_be_resolved",
      "final_order_not_found",
    ].some((code) => error.message.includes(code));

    return NextResponse.json(
      { error: error.message.split(":")[0], ok: false },
      { status: knownConflict ? 409 : 500 },
    );
  }

  const result = Array.isArray(data) ? data[0] ?? null : data;
  const ghlSync = await requestGhlSync();

  return NextResponse.json(
    { ok: true, order: result, ghlSync },
    { headers: { "Cache-Control": "no-store" } },
  );
}
