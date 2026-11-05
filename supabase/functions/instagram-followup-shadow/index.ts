import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ACTIVE_QUEUE_STATUSES = ["candidate"] as const;
const MAX_BATCH = 10;

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractOutputText(payload: any) {
  const pieces: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

function countQuestions(messages: string[]) {
  return messages.reduce((sum, message) => sum + (message.match(/\?/g)?.length ?? 0), 0);
}

function compactAndSafe(messages: string[]) {
  if (!messages.length || messages.length > 1) return false;
  const message = messages[0].trim();
  if (!message || [...message].length > 300) return false;
  if (countQuestions(messages) > 1) return false;
  if (message.includes("|")) return false;
  return true;
}

function withinCandidateWindow(candidate: any, conversation: any) {
  if (!candidate || !conversation) return false;
  if (conversation.mode === "human_active") return false;
  if (!conversation.last_inbound_at) return false;
  if (conversation.last_inbound_at !== candidate.source_last_inbound_at) return false;
  const now = Date.now();
  const eligible = new Date(candidate.eligible_at).getTime();
  const expires = new Date(candidate.expires_at).getTime();
  return Number.isFinite(eligible) && Number.isFinite(expires) && now >= eligible && now < expires;
}

async function generateFollowup(args: {
  apiKey: string;
  model: string;
  candidate: any;
  conversation: any;
  messages: any[];
  draft: any;
  items: any[];
  facts: Record<string, any>;
}) {
  const objective = text(args.candidate.objective);
  const salesSkill = args.facts.sales_skill_v2 ?? null;
  const paymentPolicy = args.facts.payment_policy ?? null;

  const instructions = [
    "You write ONE compact follow-up message for Bagelito Instagram.",
    "This is SHADOW ONLY. Never claim the message was sent and never claim an external action happened.",
    "Sound like Dawn @ Bagelito: warm, personal, concise, first-person singular, natural Spanish/English/mixed matching the customer.",
    "Write one compact follow-up bubble only. Maximum one question.",
    "Do not restart the whole sales pitch. Continue from the current stage and the last unresolved decision.",
    "Use MISSING_FIELDS to ask only for the exact unresolved operational data. Never ask again for fields that are not listed as missing.",
    "Do not repeat a catalog, full menu, greeting, address, or details the customer already supplied.",
    "A follow-up should reduce friction, not create pressure. Avoid guilt, scarcity, fake urgency, or repeated chasing.",
    "Use CURRENT_ORDER and LIVE_FACTS as operational truth. Historical conversation text is context only.",
    "Follow LIVE_FACTS.sales_skill_v2. Answer/continue the smallest unresolved next decision.",
    "If objective is gentle_payment_reminder, mention payment only when CURRENT_ORDER.quote_verified is true and the active payment policy supports it.",
    "Never treat payment evidence as confirmed payment.",
    "Never offer a discount, custom feasibility, delivery exception, refund, compensation, or special promise.",
    "If the thread is human-owned, has a handoff reason, is outside the candidate window, or lacks sufficient live truth, return eligible=false.",
    "No markdown tables, no pipe-separated options, no long paragraph.",
    "Return JSON only matching the schema.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      store: false,
      instructions,
      input: JSON.stringify({
        FOLLOWUP_OBJECTIVE: objective,
        MISSING_FIELDS: Array.isArray(args.candidate.metadata?.missing_fields)
          ? args.candidate.metadata.missing_fields
          : [],
        QUEUE_STAGE: args.candidate.stage,
        RECENT_MESSAGES: args.messages,
        CURRENT_ORDER: args.draft ? { ...args.draft, items: args.items } : null,
        LIVE_FACTS: {
          sales_skill_v2: salesSkill,
          payment_policy: paymentPolicy,
          sales_schedule: args.facts.sales_schedule ?? null,
          current_batch: args.facts.current_batch ?? null,
          packs: args.facts.packs ?? [],
          bagel_flavors: args.facts.bagel_flavors ?? [],
          schmears: args.facts.schmears ?? [],
        },
      }),
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "bagelito_followup_shadow",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              eligible: { type: "boolean" },
              reason: { type: ["string", "null"] },
              proposed_messages: {
                type: "array",
                minItems: 0,
                maxItems: 1,
                items: { type: "string" },
              },
            },
            required: ["eligible", "reason", "proposed_messages"],
          },
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`openai_${response.status}:${raw.slice(0, 500)}`);
  }
  const payload = JSON.parse(raw);
  const output = extractOutputText(payload);
  if (!output) throw new Error("empty_followup_output");
  return JSON.parse(output);
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return respond({
      ok: true,
      function: "instagram-followup-shadow",
      shadowOnly: true,
      sendsMessages: false,
    });
  }
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
  const model = Deno.env.get("INSTAGRAM_AI_MODEL")?.trim() || "gpt-6-luna";
  if (!supabaseUrl || !serviceRole || !apiKey) {
    return respond({ ok: false, error: "configuration_missing" }, 503);
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(MAX_BATCH, Number(body?.limit ?? 5)));

  const { data: refreshed, error: refreshError } = await db.rpc("refresh_instagram_followup_candidates");
  if (refreshError) return respond({ ok: false, error: "followup_refresh_failed" }, 500);

  const now = new Date().toISOString();
  const { data: candidates, error: candidateError } = await db
    .from("instagram_followup_queue")
    .select("*")
    .in("status", ACTIVE_QUEUE_STATUSES as unknown as string[])
    .lte("eligible_at", now)
    .gt("expires_at", now)
    .order("eligible_at", { ascending: true })
    .limit(limit);

  if (candidateError) return respond({ ok: false, error: "followup_lookup_failed" }, 500);

  const results: any[] = [];
  for (const candidate of candidates ?? []) {
    try {
      const { data: conversation, error: conversationError } = await db
        .from("instagram_conversations")
        .select("id,mode,last_inbound_at,last_outbound_at,contact_id")
        .eq("id", candidate.conversation_id)
        .single();
      if (conversationError) throw new Error("conversation_lookup_failed");

      if (!withinCandidateWindow(candidate, conversation)) {
        await db.from("instagram_followup_queue")
          .update({ status: "expired", reason: "candidate_window_changed" })
          .eq("id", candidate.id);
        results.push({ id: candidate.id, status: "expired" });
        continue;
      }

      const [{ data: messages, error: messagesError }, { data: facts, error: factsError }] = await Promise.all([
        db.from("instagram_messages")
          .select("direction,text_content,message_type,sent_at")
          .eq("conversation_id", candidate.conversation_id)
          .order("sent_at", { ascending: false })
          .limit(16),
        db.from("instagram_agent_facts")
          .select("fact_key,fact_value")
      ]);
      if (messagesError || factsError) throw new Error("followup_context_lookup_failed");

      const factMap = Object.fromEntries((facts ?? []).map((fact: any) => [fact.fact_key, fact.fact_value]));
      let draft: any = null;
      let items: any[] = [];

      if (candidate.draft_id) {
        const { data: draftData, error: draftError } = await db
          .from("instagram_order_drafts")
          .select("*")
          .eq("id", candidate.draft_id)
          .maybeSingle();
        if (draftError) throw new Error("followup_draft_lookup_failed");
        draft = draftData;

        if (draft?.handoff_reason || draft?.status === "human_review") {
          await db.from("instagram_followup_queue")
            .update({ status: "skipped", reason: "human_review_required" })
            .eq("id", candidate.id);
          results.push({ id: candidate.id, status: "skipped" });
          continue;
        }

        const { data: itemData, error: itemError } = await db
          .from("instagram_order_draft_items")
          .select("item_kind,item_key,item_name,quantity,unit_price")
          .eq("draft_id", candidate.draft_id)
          .order("created_at", { ascending: true });
        if (itemError) throw new Error("followup_items_lookup_failed");
        items = itemData ?? [];
      }

      const suggestion = await generateFollowup({
        apiKey,
        model,
        candidate,
        conversation,
        messages: [...(messages ?? [])].reverse(),
        draft,
        items,
        facts: factMap,
      });

      const proposed = Array.isArray(suggestion.proposed_messages)
        ? suggestion.proposed_messages.map((m: unknown) => text(m)).filter(Boolean)
        : [];

      if (!suggestion.eligible || !compactAndSafe(proposed)) {
        await db.from("instagram_followup_queue")
          .update({
            status: "skipped",
            reason: text(suggestion.reason) || "followup_quality_gate_failed",
            proposed_messages: proposed,
            model,
            generated_at: new Date().toISOString(),
            metadata: {
              ...(candidate.metadata ?? {}),
              question_count: countQuestions(proposed),
              shadow_only: true,
            },
          })
          .eq("id", candidate.id);
        results.push({ id: candidate.id, status: "skipped" });
        continue;
      }

      await db.from("instagram_followup_queue")
        .update({
          status: "shadow_generated",
          proposed_messages: proposed,
          model,
          reason: text(suggestion.reason) || null,
          generated_at: new Date().toISOString(),
          metadata: {
            ...(candidate.metadata ?? {}),
            question_count: countQuestions(proposed),
            shadow_only: true,
          },
        })
        .eq("id", candidate.id);

      results.push({ id: candidate.id, status: "shadow_generated" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.from("instagram_followup_queue")
        .update({ status: "error", reason: message.slice(0, 500) })
        .eq("id", candidate.id);
      results.push({ id: candidate.id, status: "error" });
    }
  }

  return respond({
    ok: results.every((result) => result.status !== "error"),
    shadowOnly: true,
    refreshedCandidates: Number(refreshed ?? 0),
    processed: results.length,
    results,
  });
});
