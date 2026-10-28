import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

const HUMAN_MEDIA_BUCKET = "instagram-human-media";

function imageExtension(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "jpg";
}

async function ensureHumanMediaBucket(db: any) {
  const { data: bucket } = await db.storage.getBucket(HUMAN_MEDIA_BUCKET);
  if (bucket) return;

  const { error } = await db.storage.createBucket(HUMAN_MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
  });

  if (error && !String(error.message ?? "").toLowerCase().includes("already")) {
    throw new Error(`human_media_bucket_create_failed:${error.message}`);
  }
}

async function archiveHumanUsedMedia(db: any) {
  await ensureHumanMediaBucket(db);

  const { data: messages, error: readError } = await db
    .from("instagram_messages")
    .select("id,provider_message_id,attachments,sent_at")
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (readError) throw new Error(`human_media_read_failed:${readError.message}`);

  let archived = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of messages ?? []) {
    if (message.provider_message_id) {
      const { data: aiSend } = await db
        .from("instagram_outbound_sends")
        .select("id")
        .eq("provider_message_id", message.provider_message_id)
        .maybeSingle();

      if (aiSend?.id) continue;
    }

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index] as any;
      if (attachment?.type !== "image") continue;

      const sourceUrl = attachment?.payload?.url;
      if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://")) continue;

      const assetKey = `human-used:${message.id}:${index}`;
      const { data: existing } = await db
        .from("instagram_media_assets")
        .select("id,storage_path")
        .eq("asset_key", assetKey)
        .maybeSingle();

      if (existing?.storage_path) {
        skipped += 1;
        continue;
      }

      try {
        const imageResponse = await fetch(sourceUrl);
        if (!imageResponse.ok) {
          failed += 1;
          continue;
        }

        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
        if (!contentType.toLowerCase().startsWith("image/")) {
          failed += 1;
          continue;
        }

        const bytes = await imageResponse.arrayBuffer();
        if (bytes.byteLength <= 0 || bytes.byteLength > 8 * 1024 * 1024) {
          failed += 1;
          continue;
        }

        const ext = imageExtension(contentType);
        const path = `human-used/${message.id}/${index}.${ext}`;

        const { error: uploadError } = await db.storage
          .from(HUMAN_MEDIA_BUCKET)
          .upload(path, bytes, {
            contentType,
            cacheControl: "31536000",
            upsert: true
          });

        if (uploadError) throw uploadError;

        const sendable = ["image/jpeg", "image/jpg", "image/png"].includes(
          contentType.toLowerCase().split(";")[0].trim()
        );

        const { error: assetError } = await db
          .from("instagram_media_assets")
          .upsert({
            asset_key: assetKey,
            storage_path: path,
            public_url: null,
            category: "human_reference",
            product_slug: null,
            locale: "both",
            tags: ["human-used", "instagram", "bagelito", "human-reference"],
            approved: true,
            sendable,
            notes: `Archived from human outbound Instagram message ${message.provider_message_id ?? message.id} at ${message.sent_at}.`,
            updated_at: new Date().toISOString()
          }, { onConflict: "asset_key" });

        if (assetError) throw assetError;
        archived += 1;
      } catch (error) {
        console.error("human_media_archive_failed", assetKey, error);
        failed += 1;
      }
    }
  }

  return { archived, skipped, failed };
}


const INTENTS = [
  "menu","price","flavors","product_photo","batch_status","delivery_area","how_to_order","storage","reheating",
  "ingredient_question","vegan_request","order_status","payment_confirmation","address_change","custom_order","catering","collaboration","discount_exception",
  "complaint","refund","missing_item","damaged_order","food_safety","allergy","payment_dispute","fraud","other"
] as const;

const RISK: Record<string,"auto"|"review"|"human"> = {
  menu:"auto", price:"auto", flavors:"auto", product_photo:"auto", batch_status:"auto", delivery_area:"auto",
  how_to_order:"auto", storage:"auto", reheating:"auto",
  ingredient_question:"review", vegan_request:"review", order_status:"review", payment_confirmation:"review",
  address_change:"review", custom_order:"review", catering:"review", collaboration:"review", discount_exception:"review",
  complaint:"human", refund:"human", missing_item:"human", damaged_order:"human", food_safety:"human",
  allergy:"human", payment_dispute:"human", fraud:"human", other:"review"
};

function respond(data: unknown, status = 200, contentType = "application/json; charset=utf-8") {
  return new Response(contentType.startsWith("application/json") ? JSON.stringify(data) : String(data), {
    status,
    headers: { "content-type": contentType },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(new Uint8Array(sig));
}

async function sha256(body: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(body));
  return bytesToHex(new Uint8Array(digest));
}


async function postInstagramMessage(args: {
  accountId: string;
  recipientId: string;
  accessToken: string;
  message: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://graph.instagram.com/v26.0/${args.accountId}/messages`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${args.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        recipient: { id: args.recipientId },
        message: args.message
      })
    }
  );

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }

  if (!response.ok) {
    throw new Error(`instagram_send_failed:${response.status}:${raw.slice(0,500)}`);
  }

  return payload;
}

async function resolveInstagramMediaUrl(db: any, asset: any) {
  if (asset?.public_url) return asset.public_url;
  if (!asset?.storage_path) return null;

  const { data, error } = await db.storage
    .from(HUMAN_MEDIA_BUCKET)
    .createSignedUrl(asset.storage_path, 60 * 60);

  if (error) {
    throw new Error(`instagram_media_sign_failed:${error.message}`);
  }

  return data?.signedUrl ?? null;
}


function extractOutputText(payload: any) {
  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function generateShadowDraft(args: {
  db: any;
  conversationId: string;
  triggeringMessageId: string;
  customerId: string;
  openaiKey: string;
  model: string;
}) {
  const { db, conversationId, triggeringMessageId, customerId, openaiKey, model } = args;

  const [{ data: messages }, { data: facts }, { data: batch }, { data: mediaAssets }] = await Promise.all([
    db.from("instagram_messages")
      .select("direction,text_content,message_type,sent_at")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(14),
    db.from("instagram_agent_facts")
      .select("fact_key,fact_value,source,updated_at"),
    db.from("batches")
      .select("id,name,status,orders_open_at,orders_close_at,delivery_date,capacity_packs,capacity_bagels,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("instagram_media_assets")
      .select("asset_key,storage_path,public_url,category,product_slug,locale,tags,approved,sendable")
      .eq("approved", true)
      .order("asset_key", { ascending: true })
  ]);

  const recentMessages = [...(messages ?? [])].reverse();
  const factMap = Object.fromEntries((facts ?? []).map((f: any) => [f.fact_key, f.fact_value]));

  const instructions = [
    "You are Bagelito's Instagram Shadow Mode assistant. Your draft is internal and must NEVER be sent automatically.",
    "Write in the customer's language and natural style. Spanish and English should sound native, not translated.",
    "Bagelito voice learned from historical DMs: warm, personal, concise, lightly enthusiastic, sometimes playful elongation like 'Holaaa', and natural emojis.",
    "A simple operational question gets a simple answer, EXCEPT flavors/menu/how-to-order intents: live Bagelito handling treats these as high-intent sales moments and usually gives a compact full sales answer.",
    "For flavors/menu/how-to-order, when LIVE_FACTS supports it, structure the answer as: warm greeting -> active promo if explicitly current -> regular flavors/products -> relevant packs/prices -> schmears/add-ons -> current production/delivery timing -> exact information needed to order -> approved human-used photos.",
    "This commercial exception should reduce back-and-forth without sounding pushy. Never invent or reuse stale promo, price, date, delivery, availability, inventory, or payment facts.",
    "Operational facts MUST come only from LIVE_FACTS below. Never invent price, stock, availability, batch date, delivery fee, payment state, address, product, exception, refund, compensation, or custom promise.",
    "A seasonal=true flavor is NOT proof that it is currently available. Mention it only as seasonal/depending on batch unless explicit availability exists.",
    "For complaints, refunds, missing/damaged orders, allergies/celiac/food safety, payment disputes, or fraud: classify the matching high-risk intent and draft a cautious acknowledgement without making promises.",
    "For media, use ONLY exact asset_key values provided in LIVE_FACTS.media_assets. Never invent an asset key or URL.",
    "Historical Bagelito behavior is media-forward: when customers ask for flavors, menu/carta, options, or how to order, Bagelito commonly sends product photos proactively even when the customer did not explicitly ask for a photo.",
    "For flavors, menu/carta, or how_to_order intents, prioritize approved media with category=human_reference and tag=human-used. These are the exact images Bagelito's human operator has actually used in real DMs.",
    "For flavors or menu/carta intents, propose the human-used reference set first (normally up to 7 images) alongside the concise text answer. Do not replace this set with generic storefront photos unless human-used references are unavailable.",
    "For how_to_order, also prioritize the same human-used reference set because historical Bagelito behavior sends the actual sales/catalog images after explaining the process.",
    "For a specific flavor or pack question, prefer the exact matching approved asset. For other intents, suggest media only when it genuinely helps.",
    "A media asset with sendable=false may still be suggested in Shadow Mode, but must not be sent until validated.",
    "Return JSON only matching the schema."
  ].join("\n");

  const input = {
    CUSTOMER: { instagram_user_id: customerId },
    RECENT_MESSAGES: recentMessages,
    LIVE_FACTS: {
      menu: factMap,
      current_batch: batch ?? null,
      media_assets: mediaAssets ?? [],
      truth_policy: "Configured regular menu items may be described as menu offerings. Seasonal items are not confirmed live stock unless explicit availability exists."
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${openaiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "bagelito_instagram_shadow",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", enum: INTENTS },
              language: { type: "string", enum: ["es","en","mixed","unknown"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              proposed_reply: { type: "string" },
              proposed_media_tags: {
                type: "array",
                maxItems: 8,
                items: { type: "string" }
              }
            },
            required: ["intent","language","confidence","proposed_reply","proposed_media_tags"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const err = (await response.text()).slice(0, 800);
    await db.from("instagram_ai_runs").insert({
      conversation_id: conversationId,
      triggering_message_id: triggeringMessageId,
      execution_mode: "shadow",
      language: "unknown",
      proposed_media: [],
      facts_used: {
        fact_keys: (facts ?? []).map((f: any) => f.fact_key),
        current_batch_id: batch?.id ?? null
      },
      model,
      status: "error",
      error_message: `openai_${response.status}:${err}`
    });
    return { generated: false, error: `openai_${response.status}` };
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);

  if (!outputText) {
    await db.from("instagram_ai_runs").insert({
      conversation_id: conversationId,
      triggering_message_id: triggeringMessageId,
      execution_mode: "shadow",
      language: "unknown",
      proposed_media: [],
      facts_used: {
        fact_keys: (facts ?? []).map((f: any) => f.fact_key),
        current_batch_id: batch?.id ?? null
      },
      model,
      status: "error",
      error_message: "empty_openai_output"
    });
    return { generated: false, error: "empty_openai_output" };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    await db.from("instagram_ai_runs").insert({
      conversation_id: conversationId,
      triggering_message_id: triggeringMessageId,
      execution_mode: "shadow",
      language: "unknown",
      proposed_media: [],
      facts_used: {
        fact_keys: (facts ?? []).map((f: any) => f.fact_key),
        current_batch_id: batch?.id ?? null
      },
      model,
      status: "error",
      error_message: `openai_json_parse_failed:${parseError.slice(0,500)}`
    });
    return { generated: false, error: "openai_json_parse_failed" };
  }
  const intent = INTENTS.includes(parsed.intent) ? parsed.intent : "other";
  const language = ["es","en","mixed","unknown"].includes(parsed.language) ? parsed.language : "unknown";
  const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : null;
  const proposedReply = typeof parsed.proposed_reply === "string" ? parsed.proposed_reply.trim() : "";
  let requestedMediaKeys = Array.isArray(parsed.proposed_media_tags) ? parsed.proposed_media_tags.slice(0,8) : [];
  const approvedMediaByKey = new Map((mediaAssets ?? []).map((asset: any) => [asset.asset_key, asset]));

  // Historical audit: Bagelito proactively sends multiple product photos for
  // flavors/menu questions. Enforce that behavior even if the model returns
  // too few media suggestions.
  const humanUsedKeys = (mediaAssets ?? [])
    .filter((asset: any) =>
      asset.category === "human_reference" &&
      Array.isArray(asset.tags) &&
      asset.tags.includes("human-used")
    )
    .map((asset: any) => asset.asset_key)
    .slice(0, 7);

  if (intent === "flavors" || intent === "menu" || intent === "how_to_order") {
    if (humanUsedKeys.length > 0) {
      requestedMediaKeys = humanUsedKeys;
    } else if (intent === "flavors" || intent === "menu") {
      const regularFlavorKeys = (mediaAssets ?? [])
        .filter((asset: any) =>
          asset.category === "bagel_flavor" &&
          !((asset.tags ?? []).includes("seasonal"))
        )
        .map((asset: any) => asset.asset_key)
        .slice(0, 7);
      requestedMediaKeys = regularFlavorKeys;
    } else {
      requestedMediaKeys = (mediaAssets ?? [])
        .filter((asset: any) => asset.category === "pack")
        .map((asset: any) => asset.asset_key)
        .slice(0, 4);
    }
  }

  const proposedMedia = requestedMediaKeys
    .map((key: string) => approvedMediaByKey.get(key))
    .filter(Boolean)
    .map((asset: any) => ({
      asset_key: asset.asset_key,
      storage_path: asset.storage_path,
      public_url: asset.public_url,
      category: asset.category,
      product_slug: asset.product_slug,
      sendable: asset.sendable
    }));

  const { data: aiRun, error: aiRunError } = await db
    .from("instagram_ai_runs")
    .insert({
      conversation_id: conversationId,
      triggering_message_id: triggeringMessageId,
      execution_mode: "shadow",
      intent,
      language,
      confidence,
      proposed_reply: proposedReply,
      proposed_media: proposedMedia,
      facts_used: {
        fact_keys: (facts ?? []).map((f: any) => f.fact_key),
        current_batch: batch ?? null,
        risk: RISK[intent] ?? "review"
      },
      model,
      status: "proposed"
    })
    .select("id")
    .single();

  if (aiRunError) throw new Error(`instagram_ai_run_insert_failed:${aiRunError.message}`);

  if ((RISK[intent] ?? "review") === "human") {
    await db.from("instagram_conversations")
      .update({ mode: "human_active", updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  return {
    generated: true,
    aiRunId: aiRun?.id ?? null,
    intent,
    language,
    confidence,
    risk: RISK[intent] ?? "review",
    proposedReply,
    proposedMedia
  };
}

type MetaEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: unknown[];
    is_echo?: boolean;
  };
};

type MetaPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaEvent[];
  }>;
};

Deno.serve(async (req: Request) => {
  const verifyToken = Deno.env.get("INSTAGRAM_WEBHOOK_VERIFY_TOKEN") ?? "";
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";
  const accountId = Deno.env.get("INSTAGRAM_ACCOUNT_ID") ?? "";
  const username = Deno.env.get("INSTAGRAM_USERNAME") ?? "bagelito.pe";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const instagramAccessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") ?? "";
  const aiModel = Deno.env.get("INSTAGRAM_AI_MODEL") ?? "gpt-6-luna";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("health") === "1") {
      return respond({
        ok: true,
        function: "instagram-webhook",
        shadowMode: true,
        hasVerifyToken: verifyToken.length > 0,
        verifyTokenLength: verifyToken.length,
        hasAppSecret: appSecret.length > 0,
        hasAccountId: accountId.length > 0,
        persistenceReady: Boolean(supabaseUrl && serviceRoleKey),
        aiReady: openaiKey.length > 0,
        sendReady: instagramAccessToken.length > 0,
        aiModel
      });
    }

    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && challenge && token && verifyToken && safeEqual(token, verifyToken)) {
      return respond(challenge, 200, "text/plain; charset=utf-8");
    }
    return respond({ ok: false, error: "verification_failed" }, 403);
  }

  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  if (!appSecret) return respond({ ok: false, error: "app_secret_missing" }, 503);
  if (!supabaseUrl || !serviceRoleKey) return respond({ ok: false, error: "persistence_not_ready" }, 503);

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return respond({ ok: false, error: "missing_signature" }, 401);

  const expected = await hmacSha256(appSecret, rawBody);
  if (!safeEqual(signature.slice(7), expected)) return respond({ ok: false, error: "invalid_signature" }, 401);

  const payload = JSON.parse(rawBody) as MetaPayload;
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: runtimeSettings } = await db
    .from("instagram_runtime_settings")
    .select("enabled,mode,test_recipient_igsid,test_recipient_igsids,min_confidence,auto_intents,media_enabled,max_media")
    .eq("id", "default")
    .maybeSingle();

  const webhookEventKey = await sha256(rawBody);
  const { error: webhookInsertError } = await db
    .from("instagram_webhook_events")
    .insert({ event_key: webhookEventKey, payload });

  if (webhookInsertError?.code === "23505") {
    return respond({ ok: true, duplicate: true, shadowMode: true });
  }
  if (webhookInsertError) return respond({ ok: false, error: "webhook_insert_failed" }, 500);

  let eventsSeen = 0;
  let messagesStored = 0;
  let shadowGenerated = 0;

  try {
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        eventsSeen += 1;
        if (!event.message) continue;

        const igAccountId = entry.id || accountId || event.recipient?.id || "";
        if (!igAccountId) continue;

        const now = new Date().toISOString();
        const { data: account, error: accountError } = await db
          .from("instagram_accounts")
          .upsert(
            { instagram_user_id: igAccountId, username, active: true, updated_at: now },
            { onConflict: "instagram_user_id" }
          )
          .select("id,instagram_user_id")
          .single();
        if (accountError) throw accountError;

        const senderId = event.sender?.id ?? "";
        const recipientId = event.recipient?.id ?? "";
        const inbound = !event.message.is_echo && senderId !== igAccountId;
        let knownAiSend = false;

        if (!inbound && event.message.mid) {
          const { data: aiSend } = await db
            .from("instagram_outbound_sends")
            .select("id")
            .eq("provider_message_id", event.message.mid)
            .maybeSingle();
          knownAiSend = Boolean(aiSend?.id);
        }

        const contactInstagramId = inbound ? senderId : recipientId;
        if (!contactInstagramId || contactInstagramId === igAccountId) continue;

        const { data: contact, error: contactError } = await db
          .from("instagram_contacts")
          .upsert(
            { account_id: account.id, instagram_user_id: contactInstagramId, last_seen_at: now, updated_at: now },
            { onConflict: "account_id,instagram_user_id" }
          )
          .select("id")
          .single();
        if (contactError) throw contactError;

        const { data: conversation, error: conversationError } = await db
          .from("instagram_conversations")
          .upsert(
            { account_id: account.id, contact_id: contact.id, status: "open", updated_at: now },
            { onConflict: "account_id,contact_id" }
          )
          .select("id,unread_count,mode,last_outbound_at")
          .single();
        if (conversationError) throw conversationError;

        const sentAt = new Date(event.timestamp ?? Date.now()).toISOString();
        const attachments = Array.isArray(event.message.attachments) ? event.message.attachments : [];
        const providerEventKey = event.message.mid ?? `${igAccountId}:${event.timestamp ?? Date.now()}:${senderId}:${recipientId}`;

        const { data: insertedMessage, error: messageError } = await db
          .from("instagram_messages")
          .insert({
            conversation_id: conversation.id,
            provider_message_id: event.message.mid ?? null,
            provider_event_key: providerEventKey,
            direction: inbound ? "inbound" : "outbound",
            message_type: attachments.length ? (event.message.text ? "text_with_attachment" : "attachment") : "text",
            text_content: event.message.text ?? null,
            attachments,
            raw_payload: event,
            sent_at: sentAt
          })
          .select("id")
          .maybeSingle();

        const duplicateMessage = messageError?.code === "23505";
        if (messageError && !duplicateMessage) throw messageError;
        if (!duplicateMessage) messagesStored += 1;

        const update: Record<string, unknown> = { last_message_at: sentAt, updated_at: now };
        if (inbound) {
          update.last_inbound_at = sentAt;
          update.unread_count = Number(conversation.unread_count ?? 0) + (duplicateMessage ? 0 : 1);
        } else {
          update.last_outbound_at = sentAt;

          if (!knownAiSend) {
            update.mode = "human_active";
          }

          if (!duplicateMessage && !knownAiSend) {
            const { data: latestRun } = await db
              .from("instagram_ai_runs")
              .select("id,proposed_reply,status")
              .eq("conversation_id", conversation.id)
              .eq("execution_mode", "shadow")
              .in("status", ["proposed","approved","edited"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestRun?.id) {
              const humanReply = event.message.text ?? null;
              const humanAttachments = Array.isArray(event.message.attachments) ? event.message.attachments : [];
              const normalizedDraft = (latestRun.proposed_reply ?? "").trim();
              const normalizedHuman = (humanReply ?? "").trim();

              const { data: runSnapshot } = await db
                .from("instagram_ai_runs")
                .select("human_final_reply,human_final_media")
                .eq("id", latestRun.id)
                .single();

              const currentHumanReply = (runSnapshot?.human_final_reply ?? "").trim();
              const nextHumanReply = normalizedHuman || currentHumanReply || null;
              const currentMedia = Array.isArray(runSnapshot?.human_final_media)
                ? runSnapshot.human_final_media
                : [];
              const nextMedia = humanAttachments.length
                ? [...currentMedia, ...humanAttachments]
                : currentMedia;

              const comparisonStatus =
                nextHumanReply && normalizedDraft && nextHumanReply === normalizedDraft && nextMedia.length === 0
                  ? "approved"
                  : "edited";

              await db
                .from("instagram_ai_runs")
                .update({
                  human_final_reply: nextHumanReply,
                  human_final_media: nextMedia,
                  status: comparisonStatus,
                  updated_at: now
                })
                .eq("id", latestRun.id);
            }
          }
        }
        const { error: updateError } = await db.from("instagram_conversations").update(update).eq("id", conversation.id);
        if (updateError) throw updateError;

        if (inbound && !duplicateMessage && insertedMessage?.id && openaiKey) {
          const shadow = await generateShadowDraft({
            db,
            conversationId: conversation.id,
            triggeringMessageId: insertedMessage.id,
            customerId: contactInstagramId,
            openaiKey,
            model: aiModel
          });
          if (shadow.generated) {
            shadowGenerated += 1;

            const autoIntents = Array.isArray(runtimeSettings?.auto_intents)
              ? runtimeSettings.auto_intents
              : [];
            const minConfidence = Number(runtimeSettings?.min_confidence ?? 0.92);
            const configuredTestRecipients = Array.isArray(runtimeSettings?.test_recipient_igsids)
              ? runtimeSettings.test_recipient_igsids
              : [runtimeSettings?.test_recipient_igsid].filter(Boolean);
            const testOnly =
              runtimeSettings?.mode === "test_auto" &&
              configuredTestRecipients.includes(contactInstagramId);
            const fullAuto = runtimeSettings?.mode === "auto";
            const safeForAuto =
              Boolean(runtimeSettings?.enabled) &&
              Boolean(instagramAccessToken) &&
              conversation.mode !== "human_active" &&
              (testOnly || fullAuto) &&
              autoIntents.includes(shadow.intent) &&
              typeof shadow.confidence === "number" &&
              shadow.confidence >= minConfidence &&
              shadow.risk === "auto" &&
              typeof shadow.proposedReply === "string" &&
              shadow.proposedReply.trim().length > 0;

            if (safeForAuto) {
              try {
                const textSend = await postInstagramMessage({
                  accountId: igAccountId,
                  recipientId: contactInstagramId,
                  accessToken: instagramAccessToken,
                  message: { text: shadow.proposedReply.trim() }
                });

                if (textSend?.message_id) {
                  await db.from("instagram_outbound_sends").insert({
                    conversation_id: conversation.id,
                    ai_run_id: shadow.aiRunId,
                    provider_message_id: textSend.message_id,
                    recipient_igsid: contactInstagramId,
                    kind: "text",
                    source: "ai"
                  });
                }

                const sentMedia: any[] = [];
                if (runtimeSettings?.media_enabled) {
                  const maxMedia = Math.max(0, Math.min(7, Number(runtimeSettings?.max_media ?? 0)));

                  for (const asset of (shadow.proposedMedia ?? []).slice(0, maxMedia)) {
                    if (!asset?.sendable) continue;
                    const mediaUrl = await resolveInstagramMediaUrl(db, asset);
                    if (!mediaUrl) continue;

                    const mediaSend = await postInstagramMessage({
                      accountId: igAccountId,
                      recipientId: contactInstagramId,
                      accessToken: instagramAccessToken,
                      message: {
                        attachment: {
                          type: "image",
                          payload: { url: mediaUrl }
                        }
                      }
                    });

                    if (mediaSend?.message_id) {
                      await db.from("instagram_outbound_sends").insert({
                        conversation_id: conversation.id,
                        ai_run_id: shadow.aiRunId,
                        provider_message_id: mediaSend.message_id,
                        recipient_igsid: contactInstagramId,
                        kind: "image",
                        asset_key: asset.asset_key ?? null,
                        source: "ai"
                      });
                    }

                    sentMedia.push({
                      asset_key: asset.asset_key ?? null,
                      provider_message_id: mediaSend?.message_id ?? null
                    });
                  }
                }

                if (shadow.aiRunId) {
                  await db.from("instagram_ai_runs")
                    .update({
                      execution_mode: "auto",
                      status: "sent",
                      updated_at: new Date().toISOString()
                    })
                    .eq("id", shadow.aiRunId);
                }

                await db.from("instagram_conversation_events").insert({
                  conversation_id: conversation.id,
                  event_type: testOnly ? "test_auto_send" : "auto_send",
                  from_mode: conversation.mode,
                  to_mode: "ai_active",
                  reason: testOnly ? "controlled_test" : "safe_auto",
                  actor: "ai",
                  metadata: {
                    triggering_message_id: insertedMessage.id,
                    ai_run_id: shadow.aiRunId,
                    intent: shadow.intent,
                    confidence: shadow.confidence,
                    provider_message_id: textSend?.message_id ?? null,
                    sent_media: sentMedia
                  }
                });

                await db.from("instagram_conversations")
                  .update({ mode: "ai_active", updated_at: new Date().toISOString() })
                  .eq("id", conversation.id);
              } catch (sendError) {
                const sendErrorText = sendError instanceof Error ? sendError.message : String(sendError);

                await db.from("instagram_conversation_events").insert({
                  conversation_id: conversation.id,
                  event_type: "auto_send_error",
                  from_mode: conversation.mode,
                  to_mode: conversation.mode,
                  reason: "provider_send_failed",
                  actor: "ai",
                  metadata: {
                    triggering_message_id: insertedMessage.id,
                    ai_run_id: shadow.aiRunId,
                    intent: shadow.intent,
                    confidence: shadow.confidence,
                    error: sendErrorText.slice(0, 1000)
                  }
                });

                console.error("instagram_auto_send_failed", sendErrorText);
              }
            }
          }
        }
      }
    }

    const humanMediaArchive = await archiveHumanUsedMedia(db);

    await db.from("instagram_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("event_key", webhookEventKey);

    return respond({
      ok: true,
      shadowMode: true,
      eventsSeen,
      messagesStored,
      shadowGenerated,
      humanMediaArchive,
      aiReady: Boolean(openaiKey)
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    console.error("instagram_webhook_processing_failed", errorText);
    await db.from("instagram_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: errorText.slice(0,1000) })
      .eq("event_key", webhookEventKey);
    return respond({ ok: false, error: "processing_failed" }, 500);
  }
});
