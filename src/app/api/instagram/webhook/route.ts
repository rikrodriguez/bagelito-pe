import { NextRequest, NextResponse } from "next/server";
import { persistInstagramWebhook } from "@/lib/instagram/service";
import {
  verifyInstagramWebhookSignature,
  verifyWebhookToken,
} from "@/lib/instagram/webhook";

// Shadow Mode webhook: ingestion only; no Instagram Send API.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    verifyWebhookToken(token, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appSecret) {
    return NextResponse.json(
      { error: "instagram_not_configured", ok: false },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyInstagramWebhookSignature(rawBody, signature, appSecret)) {
    return NextResponse.json(
      { error: "invalid_signature", ok: false },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", ok: false },
      { status: 400 },
    );
  }

  try {
    const result = await persistInstagramWebhook(payload, rawBody);

    return NextResponse.json(
      {
        ok: true,
        shadowMode: true,
        ...result,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("instagram_webhook_processing_failed", error);

    return NextResponse.json(
      { error: "processing_failed", ok: false },
      { status: 500 },
    );
  }
}
