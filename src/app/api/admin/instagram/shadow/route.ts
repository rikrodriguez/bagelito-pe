import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, getAdminCookieName } from "@/lib/admin/auth";
import { getInstagramLiveContext } from "@/lib/instagram/live-context";
import { generateInstagramShadowSuggestion } from "@/lib/instagram/shadow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const expected = createAdminToken();
  const actual = request.cookies.get(getAdminCookieName())?.value ?? "";
  return Boolean(expected) && actual === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized", ok: false }, { status: 401 });
  }

  let body: {
    conversationId?: string;
    district?: string | null;
    orderCode?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json", ok: false }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id_required", ok: false }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("instagram_conversations")
    .select("id,detected_language,contact_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    return NextResponse.json(
      { error: "conversation_lookup_failed", ok: false },
      { status: conversationError.code === "42P01" ? 503 : 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found", ok: false }, { status: 404 });
  }

  const [{ data: contact }, { data: messages, error: messagesError }] = await Promise.all([
    supabase
      .from("instagram_contacts")
      .select("display_name,username")
      .eq("id", conversation.contact_id)
      .maybeSingle(),
    supabase
      .from("instagram_messages")
      .select("id,direction,text_content,attachments,sent_at")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(16),
  ]);

  if (messagesError) {
    return NextResponse.json({ error: "message_lookup_failed", ok: false }, { status: 500 });
  }

  const recentMessages = [...(messages ?? [])]
    .reverse()
    .map((message) => ({
      direction: message.direction as "inbound" | "outbound",
      text: message.text_content,
      sentAt: message.sent_at,
      hasAttachments: Array.isArray(message.attachments) && message.attachments.length > 0,
    }));

  const triggeringMessage = [...(messages ?? [])].find((message) => message.direction === "inbound") ?? null;

  if (!triggeringMessage) {
    return NextResponse.json({ error: "no_inbound_message", ok: false }, { status: 409 });
  }

  try {
    const liveContext = await getInstagramLiveContext({
      district: body.district ?? null,
      orderCode: body.orderCode ?? null,
    });

    const suggestion = await generateInstagramShadowSuggestion({
      customerName: contact?.display_name ?? contact?.username ?? null,
      conversationLanguage: conversation.detected_language ?? "unknown",
      recentMessages,
      liveContext,
    });

    const { data: aiRun, error: aiRunError } = await supabase
      .from("instagram_ai_runs")
      .insert({
        conversation_id: conversationId,
        triggering_message_id: triggeringMessage.id,
        execution_mode: "shadow",
        intent: suggestion.intent,
        language: suggestion.language,
        confidence: suggestion.confidence,
        proposed_reply: suggestion.proposedReply,
        proposed_media: suggestion.proposedMediaTags,
        facts_used: liveContext,
        model: suggestion.model,
        status: suggestion.risk === "human" ? "escalated" : "proposed",
      })
      .select("id,created_at")
      .single();

    if (aiRunError) {
      throw new Error(`instagram_ai_run_store_failed:${aiRunError.message}`);
    }

    await supabase
      .from("instagram_conversations")
      .update({
        detected_language: suggestion.language,
        mode: suggestion.risk === "auto" ? "ai_active" : "review_required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return NextResponse.json(
      {
        ok: true,
        shadowMode: true,
        aiRun,
        suggestion,
        liveContextWarnings: liveContext.warnings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "instagram_ai_not_configured" ? 503 : 500;

    return NextResponse.json(
      { error: message.split(":")[0], ok: false, shadowMode: true },
      { status },
    );
  }
}
