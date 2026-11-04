import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { projectSalesState } from "../_shared/instagram-sales-core.ts";

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
    `https://graph.facebook.com/v26.0/${args.accountId}/messages`,
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


const DM_FORMAT_VERSION = "dawn-mobile-2026-11-03-v1";

function normalizeInstagramText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\|[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isReadableInstagramText(value: string) {
  const text = value.trim();
  if (!text || [...text].length > 450 || text.includes("|")) return false;
  if (text.split("\n").some((line) => [...line].length > 155)) return false;
  // A newline elsewhere must not excuse one long, dense paragraph.
  return text.split(/\n\s*\n/).every((block) => [...block].length <= 180);
}

const SALES_NEXT_STEP_PATTERN =
  /\b(me avisas|te aviso|solo necesito|te confirmo|m[aá]ndame|env[ií]ame|dime|cu[eé]ntame|prefieres|quieres pack|cu[aá]ntos|cu[aá]ntas|cu[aá]l prefieres|cu[aá]les prefieres|let me know|send me|tell me|what do you prefer|which do you prefer|how many)\b/i;
const SALES_COMMERCIAL_INTENTS = new Set([
  "menu","price","flavors","product_photo","how_to_order"
]);
const PAYMENT_REQUEST_PATTERN =
  /\b(puedes pagar|puedes yapear|yapea|realiza el pago|haz el pago|m[aá]ndame la captura|send me the (receipt|screenshot)|pay by yape)\b/i;
const PAYMENT_CONFIRMED_PATTERN =
  /\b(pago confirmado|payment confirmed|ya est[aá] pagado|pedido confirmado por pago)\b/i;

function countSalesQuestions(messages: string[]) {
  return messages.reduce(
    (total, message) => total + (message.match(/\?/g)?.length ?? 0),
    0
  );
}

function hasClearSalesNextStep(messages: string[]) {
  const combined = messages.join("\n");
  return SALES_NEXT_STEP_PATTERN.test(combined) || countSalesQuestions(messages) === 1;
}

function isSalesReadyInstagramTurn(
  messages: string[],
  intent: string,
  currentOrder: any
) {
  if (!messages.length) return false;
  if (countSalesQuestions(messages) > 1) return false;

  if (
    currentOrder?.sales_stage === "human_review" ||
    currentOrder?.status === "human_review" ||
    Boolean(currentOrder?.handoff_reason)
  ) {
    return false;
  }

  const combined = messages.join("\n");
  if (SALES_COMMERCIAL_INTENTS.has(intent) && !hasClearSalesNextStep(messages)) {
    return false;
  }

  if (PAYMENT_REQUEST_PATTERN.test(combined) && currentOrder?.quote_verified !== true) {
    return false;
  }

  if (
    currentOrder?.payment_status === "evidence_received" &&
    PAYMENT_CONFIRMED_PATTERN.test(combined)
  ) {
    return false;
  }

  return true;
}

function mediaFamilyKey(asset: any) {
  if (!asset) return null;
  const tags = Array.isArray(asset.tags) ? asset.tags : [];
  if (tags.includes("catalog-overview")) return "catalog-overview";
  if (asset.product_slug) return `product:${asset.product_slug}`;
  return asset.asset_key ?? null;
}

function customerFacingBatch(batch: any, schedule: any) {
  if (!batch) return null;
  if (schedule?.merchant_review_only === true) {
    return {
      id: batch.id,
      name: batch.name,
      status: schedule.orders_open === false ? "closed" : batch.status,
      orders_open_at: schedule.customer_facing_open_at ?? null,
      orders_close_at: schedule.customer_facing_close_at ?? null,
      delivery_date: schedule.delivery_date ?? null,
      delivery_date_confirmed: schedule.delivery_date_confirmed === true,
      merchant_review_dates_hidden: true,
    };
  }
  return {
    ...batch,
    delivery_date_confirmed: Boolean(batch.delivery_date),
    merchant_review_dates_hidden: false,
  };
}

function preferredHumanMedia(assets: any[]) {
  return assets
    .filter((asset: any) =>
      asset.category === "human_reference" &&
      Array.isArray(asset.tags) &&
      asset.tags.includes("human-used")
    )
    .sort((a: any, b: any) =>
      Number(b.tags.includes("catalog-overview")) - Number(a.tags.includes("catalog-overview"))
    );
}

type InstagramOutboundStep =
  | { kind: "text"; text: string }
  | { kind: "image"; asset: any };

function buildInstagramOutboundSteps(messages: string[], media: any[], intent: string): InstagramOutboundStep[] {
  const texts: InstagramOutboundStep[] = messages.map((text) => ({ kind: "text", text }));
  const images: InstagramOutboundStep[] = media.map((asset) => ({ kind: "image", asset }));
  const catalogReply = ["flavors", "menu", "how_to_order", "price", "product_photo"].includes(intent);
  if (catalogReply && texts.length > 1 && images.length > 0) {
    return [texts[0], ...images, ...texts.slice(1)];
  }
  return [...texts, ...images];
}


async function extractSalesTurn(args: {
  openaiKey: string;
  model: string;
  latestMessage: string;
  latestHasAttachments: boolean;
  recentMessages: any[];
  currentOrder: any;
  currentOrderItems: any[];
  facts: Record<string, any>;
}) {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
  const itemLine = {
    type: "object",
    additionalProperties: false,
    properties: {
      key: { type: "string" },
      name: { type: "string" },
      quantity: { type: "number", minimum: 0 }
    },
    required: ["key","name","quantity"]
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${args.openaiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: args.model,
      store: false,
      instructions: [
        "You are the state-understanding pass for Bagelito sales. Do NOT write the customer-facing reply.",
        "The latest inbound message has priority. Older messages are context only.",
        "Extract only facts the customer explicitly added, changed, removed or claimed in the latest turn.",
        "Preserve uncertainty: never invent a phone, address, district, delivery date, flavor, quantity, custom feasibility or payment confirmation.",
        "A screenshot/attachment or claim that payment was sent is payment evidence only, never confirmed payment.",
        "Birthday bagels, shapes, logos, special colors or personalization are custom requests requiring feasibility review.",
        "A plain price question is not a price objection. Use objection_type=price only when the customer resists or negotiates price.",
        "Only set bagel_size=mini when the customer explicitly says mini/minis. Use regular for ordinary/full-size bagels when clear from context. If size is genuinely ambiguous, return null rather than guessing.",
        "Return JSON only matching the schema."
      ].join("\\n"),
      input: JSON.stringify({
        LATEST_INBOUND_MESSAGE: {
          text: args.latestMessage,
          has_attachments: args.latestHasAttachments
        },
        RECENT_MESSAGES: args.recentMessages,
        CURRENT_ORDER: args.currentOrder
          ? { ...args.currentOrder, items: args.currentOrderItems }
          : null,
        LIVE_FACTS: {
          packs: args.facts.packs ?? [],
          mini_bagel_packs: args.facts.mini_bagel_packs ?? [],
          order_rules: args.facts.order_rules ?? null,
          bagel_flavors: args.facts.bagel_flavors ?? [],
          schmears: args.facts.schmears ?? [],
          payment_policy: args.facts.payment_policy ?? null,
          delivery_pricing: args.facts.delivery_pricing ?? null,
          sales_schedule: args.facts.sales_schedule ?? null
        }
      }),
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "bagelito_sales_preflight",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", enum: INTENTS },
              language: { type: "string", enum: ["es","en","mixed","unknown"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              buyer_signal: {
                type: "string",
                enum: ["browsing","interested","selection_started","order_complete","payment_ready","payment_sent","urgent","objection","custom_request","support"]
              },
              objection_type: {
                type: "string",
                enum: ["none","price","minimum_order","availability","delivery","timing","choice_overload","trust","custom_request","other"]
              },
              handoff_reason: {
                anyOf: [
                  { type: "string", enum: ["complaint","refund","missing_or_damaged_order","food_safety","allergy","payment_dispute","fraud","custom_feasibility","discount_exception","delivery_exception","customer_requested_human","repeated_misunderstanding","low_confidence","conflicting_data"] },
                  { type: "null" }
                ]
              },
              customer_requested_human: { type: "boolean" },
              conflicting_data: { type: "boolean" },
              payment_evidence_claimed: { type: "boolean" },
              order_patch: {
                type: "object",
                additionalProperties: false,
                properties: {
                  bagel_size: {
                    anyOf: [
                      { type: "string", enum: ["regular","mini"] },
                      { type: "null" }
                    ]
                  },
                  pack_slug: nullableString,
                  pack_name: nullableString,
                  units: nullableNumber,
                  customer_name: nullableString,
                  phone: nullableString,
                  email: nullableString,
                  district: nullableString,
                  address: nullableString,
                  address_reference: nullableString,
                  delivery_notes: nullableString,
                  requested_date: nullableString,
                  custom_request: nullableString,
                  items: { type: "array", maxItems: 24, items: itemLine },
                  schmears: { type: "array", maxItems: 12, items: itemLine }
                },
                required: [
                  "bagel_size","pack_slug","pack_name","units","customer_name","phone","email","district",
                  "address","address_reference","delivery_notes","requested_date","custom_request",
                  "items","schmears"
                ]
              }
            },
            required: [
              "intent","language","confidence","buyer_signal","objection_type","handoff_reason",
              "customer_requested_human","conflicting_data","payment_evidence_claimed","order_patch"
            ]
          }
        }
      }
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`sales_preflight_openai_${response.status}:${raw.slice(0,800)}`);
  }
  const payload = JSON.parse(raw);
  const output = extractOutputText(payload);
  if (!output) throw new Error("sales_preflight_empty_output");
  const parsed = JSON.parse(output);
  const intent = INTENTS.includes(parsed.intent) ? parsed.intent : "other";
  const language = ["es","en","mixed","unknown"].includes(parsed.language)
    ? parsed.language
    : "unknown";
  const confidence = typeof parsed.confidence === "number"
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0;

  return {
    ...parsed,
    intent,
    language,
    confidence,
    model_handoff_reason: parsed.handoff_reason ?? null
  };
}

async function generateShadowDraft(args: {
  db: any;
  conversationId: string;
  triggeringMessageId: string;
  customerId: string;
  openaiKey: string;
  model: string;
  runtimeSettings?: any;
}) {
  const { db, conversationId, triggeringMessageId, customerId, openaiKey, model, runtimeSettings } = args;

  const [{ data: messages }, { data: facts }, { data: batch }, { data: mediaAssets }, { data: currentOrder }] = await Promise.all([
    db.from("instagram_messages")
      .select("direction,text_content,message_type,attachments,sent_at")
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
      .order("asset_key", { ascending: true }),
    db.from("instagram_order_drafts")
      .select("id,sales_stage,status,bagel_size,pack_slug,pack_name,units,customer_name,phone,email,district,delivery_address,address_reference,delivery_notes,requested_delivery_at,custom_request,total_amount,quote_verified,quote_sent_at,payment_method,payment_status,handoff_reason,updated_at")
      .eq("conversation_id", conversationId)
      .in("status", ["active","quoted","payment_pending","payment_verification","confirmed","in_production","ready_for_delivery","human_review"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const recentMessages = [...(messages ?? [])].reverse();
  const factMap = Object.fromEntries((facts ?? []).map((f: any) => [f.fact_key, f.fact_value]));

  let currentOrderItems: any[] = [];
  if (currentOrder?.id) {
    const { data: orderItems } = await db
      .from("instagram_order_draft_items")
      .select("item_kind,item_key,item_name,quantity,unit_price")
      .eq("draft_id", currentOrder.id)
      .order("created_at", { ascending: true });
    currentOrderItems = orderItems ?? [];
  }

  const { data: recentMediaSends } = await db
    .from("instagram_outbound_sends")
    .select("asset_key,created_at")
    .eq("conversation_id", conversationId)
    .eq("kind", "image")
    .not("asset_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);

  const approvedMediaByKeyForHistory = new Map((mediaAssets ?? []).map((asset: any) => [asset.asset_key, asset]));
  const recentMediaFamilies = new Set(
    (recentMediaSends ?? [])
      .map((send: any) => mediaFamilyKey(approvedMediaByKeyForHistory.get(send.asset_key)))
      .filter(Boolean)
  );
  const latestInboundMessage =
    [...recentMessages].reverse().find((message: any) => message.direction === "inbound") ?? null;
  const latestInboundText = latestInboundMessage?.text_content ?? "";
  const salesExtraction = await extractSalesTurn({
    openaiKey,
    model,
    latestMessage: latestInboundText,
    latestHasAttachments:
      Array.isArray(latestInboundMessage?.attachments) &&
      latestInboundMessage.attachments.length > 0,
    recentMessages,
    currentOrder,
    currentOrderItems,
    facts: factMap
  });
  const projectedSales = projectSalesState({
    currentOrder,
    currentItems: currentOrderItems,
    extraction: salesExtraction,
    facts: factMap,
    latestMessage: latestInboundText
  });
  const projectedOrderForWriter = {
    ...projectedSales.projectedOrder,
    items: projectedSales.projectedItems,
    sales_stage: projectedSales.stage,
    next_best_action: projectedSales.action,
    buyer_signal: projectedSales.buyerSignal,
    missing_fields: projectedSales.missingFields,
    handoff_reason: projectedSales.handoffReason,
    quote_verified: projectedSales.quote.verified,
    items_subtotal: projectedSales.quote.itemsSubtotal,
    schmears_subtotal: projectedSales.quote.schmearsSubtotal,
    delivery_fee: projectedSales.quote.deliveryFee,
    total_amount: projectedSales.quote.total,
    payment_status: projectedSales.paymentStatus
  };
  const explicitRepeatMediaRequest =
    /\b(otra vez|de nuevo|again|reenvi|reenv[ií]a|m[aá]ndame otra|send it again)\b/i.test(latestInboundText);
  const catalogAlreadySentRecently = recentMediaFamilies.has("catalog-overview");

  const configuredMediaLimit = runtimeSettings?.media_enabled
    ? Math.max(0, Math.min(7, Number(runtimeSettings?.max_media ?? 0)))
    : 0;
  const catalogAvailableForReply = preferredHumanMedia(mediaAssets ?? [])
    .filter((asset: any) => asset.sendable)
    .slice(0, configuredMediaLimit)
    .some((asset: any) => asset.tags.includes("catalog-overview"));

  const instructions = [
    "You are Bagelito's Instagram sales assistant. Follow the customer's latest request in the context of this conversation.",
    "Dawn's message layout and rhythm are essential: warm, personal, direct, with breathing room. Use natural Spanish or English matching the customer.",
    "Dawn usually speaks in first person singular: me avisas, te cuento, te confirmo, puedo mandarlo. Match that natural voice.",
    "Each line must stay within 155 characters. Put each pack and price on its own line; never compress separate options using a pipe.",
    "When order fields are needed, use Dawn-style wording such as Para hacer tu pedido, solo necesito, put the missing fields on separate lines, and close naturally. Do not re-request fields the customer has already given.",
    "Use proposed_messages as the exact Instagram text bubbles, in order. Return only 1 or 2 bubbles. A simple question normally needs 1 bubble.",
    "Each bubble MUST have at most 450 characters, and each paragraph or list block MUST have at most 180 characters. Separate ideas with a blank line. Do not pad a simple reply to reach these limits.",
    "When a greeting is appropriate, put it on its own line followed by a blank line, for example 'Holaaa! 😊'. Do not greet again in every reply.",
    "Put each pack, price, or requested order detail on its own line. Never place two options on the same line separated by a vertical bar or semicolon.",
    "Use a few natural emojis as Dawn does, normally 1 or 2 per reply. Avoid bureaucratic phrases such as 'te guiamos con los siguientes pasos'.",
    "Answer the latest question first. If the customer asks how to order, explain that they can order here and ask for the next missing order information.",
    "Follow LIVE_FACTS.menu.sales_skill_v2 as the current Bagelito sales policy. The key rule is: answer the newest customer question first, then move exactly one decision forward.",
    "PROJECTED_SALES_STATE is authoritative for this turn. It already includes the latest customer message. Do not choose a different stage, next action, quote or payment state.",
    "When PROJECTED_SALES_STATE.action is ask_contact_delivery, you may request the missing non-decision operational fields as one compact vertical bundle without turning them into multiple interrogative questions.",
    "When PROJECTED_SALES_STATE.action is quote_order, present the verified order/pack, delivery and total. Do not invent any amount outside PROJECTED_SALES_STATE.quote.",
    "When PROJECTED_SALES_STATE.action is quote_order and PROJECTED_SALES_STATE.quote.verified is true, if LIVE_FACTS.menu.payment_policy.active is true, include the active payment instruction in the same closing turn and ask for the required proof. Use only the live destination and method.",
    "Keep the quote/payment close scan-friendly: order lines, delivery, Total, payment instruction, then one clear action. Payment evidence is not payment confirmation.",
    "When PROJECTED_SALES_STATE.stage is human_review, acknowledge the latest question safely and do not continue the automated sales script.",
    "Ask at most ONE decision-moving question per turn. Do not turn a DM into a multi-question intake form.",
    "Use LIVE_FACTS.current_order as operational memory: preserve known selections and customer details and ask only for the smallest missing next decision.",
    "If LIVE_FACTS.current_order is in human_review or has a handoff_reason, do not continue automated selling or make consequential promises.",
    "Never request payment unless LIVE_FACTS.current_order.quote_verified is true. Payment evidence is never payment confirmation.",
    "Read RECENT_MESSAGES: do not repeat the entire menu, the same prices, an earlier greeting, or order details already supplied. If the user asks to see something again, do provide it.",
    "Do not resend a catalog image or equivalent catalog-overview image if LIVE_FACTS.media_delivery.catalog_already_sent_recently is true, unless explicit_repeat_media_request is true.",
    "If the latest customer message asks about a birthday bagel, custom shape, custom color, personalization, or another special request, answer that latest question first and classify it as custom_order for human review instead of auto-sending a generic order summary.",
    "For an initial menu inquiry, a useful order is a brief greeting and relevant prices, the approved catalog image, then one short question. Images are sent AFTER the first bubble and BEFORE the second bubble for catalog replies.",
    "If LIVE_FACTS.media_delivery.catalog_available_for_reply is true, use that catalog to show the flavors; do not also recite every flavor in a paragraph. Answer specific flavor questions in text.",
    "If no sendable catalog is available, provide the requested flavors in a concise vertical list. Never imply that a picture will be sent when media delivery is disabled or no suitable sendable image exists.",
    "For a how_to_order follow-up when the menu was already shared, focus on ordering rather than reselling the full catalog. Ask one manageable next-step question, such as quantity and flavors; request delivery/contact details when needed to continue the order.",
    "Keep delivery context separate from the question. If the delivery date is unknown, say so when asked about delivery or before confirming an order; do not append it as a default footer to unrelated replies.",
    "Only mention promos, special flavors, add-ons, unit prices or payment instructions when relevant and explicitly supported by LIVE_FACTS. A menu inquiry is not a requirement to list every product and every operational detail.",
    "proposed_reply is a legacy preview and must equal proposed_messages joined with a blank line.",
    "Always format Peruvian-sol prices exactly as S/. followed by the amount, for example S/. 10 or S/. 60. Never use $, USD, S/ or bare numbers for PEN prices.",
    "Operational facts MUST come only from LIVE_FACTS. Never invent price, stock, availability, batch date, delivery fee, payment state, address, product, exception, refund, compensation, or a custom promise.",
    "A merchant-review batch date is internal infrastructure, not a customer promise. If LIVE_FACTS.current_batch.delivery_date_confirmed is false, the delivery date is not confirmed and you must not infer one from orders_open_at or orders_close_at.",
    "RECENT_MESSAGES may contain older AI replies or expired promotions. Use them for context only; they are not authoritative facts or examples to copy.",
    "A seasonal=true flavor is NOT proof of current availability. Do not promote it as available unless current explicit availability exists. If asked, explain the uncertainty briefly.",
    "Never claim an external action happened unless LIVE_FACTS explicitly confirms it.",
    "For complaints, refunds, missing/damaged orders, allergies/celiac/food safety, payment disputes, or fraud: classify the matching high-risk intent and draft a cautious acknowledgement without promises.",
    "For media, use ONLY exact asset_key values supplied in LIVE_FACTS.media_assets. Never invent asset keys or URLs.",
    "Bagelito uses its real human-used catalog photos for flavors, menu and how_to_order. Prioritize approved human_reference assets tagged human-used, with catalog-overview first. A sendable=false asset is a shadow suggestion only.",
    "For a specific flavor or pack question, prefer the matching approved asset. For other intents, suggest media only when it helps.",
    "Format example only (all prices must be filled from LIVE_FACTS): 'Holaaa! 😊\\n\\nTe mando los sabores y los packs:\\n\\n🥯 De un mismo sabor\\n6 bagels: S/. [live amount]\\n12 bagels: S/. [live amount]\\n\\n🥯 Mixtos\\n6 bagels: S/. [live amount]\\n12 bagels: S/. [live amount]'; after the catalog, a separate short question. Never send placeholders.",
    "Return JSON only matching the schema."
  ].join("\n");

  const input = {
    CUSTOMER: { instagram_user_id: customerId },
    RECENT_MESSAGES: recentMessages,
    PROJECTED_SALES_STATE: projectedSales,
    LIVE_FACTS: {
      menu: factMap,
      mini_bagel_packs: factMap.mini_bagel_packs ?? [],
      order_rules: factMap.order_rules ?? null,
      current_batch: customerFacingBatch(batch, factMap.sales_schedule),
      current_order: projectedOrderForWriter,
      media_assets: mediaAssets ?? [],
      media_delivery: {
        enabled: Boolean(runtimeSettings?.media_enabled),
        maximum_images: configuredMediaLimit,
        catalog_available_for_reply: catalogAvailableForReply,
        catalog_already_sent_recently: catalogAlreadySentRecently,
        explicit_repeat_media_request: explicitRepeatMediaRequest
      },
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
              proposed_messages: {
                type: "array",
                minItems: 1,
                maxItems: 2,
                items: { type: "string" }
              },
              proposed_media_tags: {
                type: "array",
                maxItems: 8,
                items: { type: "string" }
              }
            },
            required: ["intent","language","confidence","proposed_reply","proposed_messages","proposed_media_tags"]
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
  const intent = salesExtraction.intent;
  const language = salesExtraction.language;
  const confidence = salesExtraction.confidence;
  const rawMessages = Array.isArray(parsed.proposed_messages)
    ? parsed.proposed_messages
        .filter((item: unknown) => typeof item === "string")
        .map((item: string) => normalizeInstagramText(item))
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const proposedMessages = rawMessages.length
    ? rawMessages
    : (typeof parsed.proposed_reply === "string" && parsed.proposed_reply.trim()
        ? [normalizeInstagramText(parsed.proposed_reply)]
        : []);
  const proposedReply = proposedMessages.join("\n\n");
  let requestedMediaKeys = Array.isArray(parsed.proposed_media_tags) ? parsed.proposed_media_tags.slice(0,8) : [];
  const approvedMediaByKey = new Map((mediaAssets ?? []).map((asset: any) => [asset.asset_key, asset]));

  // Historical audit: Bagelito proactively sends multiple product photos for
  // flavors/menu questions. Enforce that behavior even if the model returns
  // too few media suggestions.
  const humanUsedKeys = preferredHumanMedia(mediaAssets ?? [])
    .map((asset: any) => asset.asset_key)
    .slice(0, 7);

  if (intent === "flavors" || intent === "menu" || intent === "how_to_order") {
    if (catalogAlreadySentRecently && !explicitRepeatMediaRequest) {
      requestedMediaKeys = [];
    } else if (humanUsedKeys.length > 0) {
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
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      sendable: asset.sendable
    }));

  const seenFamiliesThisReply = new Set<string>();
  const dedupedProposedMedia = proposedMedia.filter((asset: any) => {
    const family = mediaFamilyKey(asset);
    if (!family) return false;
    if (!explicitRepeatMediaRequest && recentMediaFamilies.has(family)) return false;
    if (seenFamiliesThisReply.has(family)) return false;
    seenFamiliesThisReply.add(family);
    return true;
  });

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
      proposed_messages: proposedMessages,
      proposed_media: dedupedProposedMedia,
      facts_used: {
        fact_keys: (facts ?? []).map((f: any) => f.fact_key),
        current_batch: batch ?? null,
        risk: RISK[intent] ?? "review",
        formatting_version: DM_FORMAT_VERSION,
        readable: proposedMessages.length > 0 && proposedMessages.every(isReadableInstagramText),
        preflight_extraction: salesExtraction,
        preflight_sales: projectedSales
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
    proposedMessages,
    proposedMedia: dedupedProposedMedia,
    currentOrder: projectedOrderForWriter,
    projectedSales
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
    .select("enabled,mode,test_recipient_igsid,test_recipient_igsids,min_confidence,auto_intents,media_enabled,max_media,max_text_messages")
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

  const backgroundTask = (async () => {
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
            model: aiModel,
            runtimeSettings
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
            const latestMessageNeedsCustomReview =
              /\b(birthday|cumplea[nñ]os|cumple|custom|personaliz|forma especial|shape|color especial)\b/i.test(latestInboundText);
            const maxTextMessages = Math.max(1, Math.min(2, Number(runtimeSettings?.max_text_messages ?? 2)));
            const outboundTextMessages = Array.isArray(shadow.proposedMessages) && shadow.proposedMessages.length
              ? shadow.proposedMessages.slice(0, maxTextMessages)
              : [shadow.proposedReply].filter(Boolean).slice(0, maxTextMessages);
            const replyLooksReadable =
              outboundTextMessages.length > 0 &&
              outboundTextMessages.every(isReadableInstagramText);
            const replyLooksSalesReady =
              isSalesReadyInstagramTurn(
                outboundTextMessages,
                shadow.intent,
                shadow.currentOrder
              );
            const safeForAuto =
              Boolean(runtimeSettings?.enabled) &&
              Boolean(instagramAccessToken) &&
              (testOnly || conversation.mode !== "human_active") &&
              (testOnly || fullAuto) &&
              !latestMessageNeedsCustomReview &&
              autoIntents.includes(shadow.intent) &&
              typeof shadow.confidence === "number" &&
              shadow.confidence >= minConfidence &&
              shadow.risk === "auto" &&
              typeof shadow.proposedReply === "string" &&
              shadow.proposedReply.trim().length > 0 &&
              replyLooksReadable &&
              replyLooksSalesReady;

            if (!replyLooksReadable) {
              await db.from("instagram_conversation_events").insert({
                conversation_id: conversation.id,
                event_type: "auto_send_held",
                from_mode: conversation.mode,
                to_mode: conversation.mode,
                reason: "reply_format_needs_review",
                actor: "ai",
                metadata: { ai_run_id: shadow.aiRunId, formatting_version: DM_FORMAT_VERSION }
              });
            }

            if (replyLooksReadable && !replyLooksSalesReady) {
              await db.from("instagram_conversation_events").insert({
                conversation_id: conversation.id,
                event_type: "auto_send_held",
                from_mode: conversation.mode,
                to_mode: conversation.mode,
                reason: "sales_quality_needs_review",
                actor: "ai",
                metadata: {
                  ai_run_id: shadow.aiRunId,
                  intent: shadow.intent,
                  question_count: countSalesQuestions(outboundTextMessages),
                  has_clear_next_step: hasClearSalesNextStep(outboundTextMessages),
                  sales_skill_version: "bagelito-chat-sales-2026-11-04-v2"
                }
              });
            }

            if (safeForAuto) {
              try {
                const sentTextMessages: any[] = [];
                const sentMedia: any[] = [];
                const maxMedia = runtimeSettings?.media_enabled
                  ? Math.max(0, Math.min(7, Number(runtimeSettings?.max_media ?? 0)))
                  : 0;
                const mediaToSend = (shadow.proposedMedia ?? [])
                  .filter((asset: any) => asset?.sendable)
                  .slice(0, maxMedia);
                const steps = buildInstagramOutboundSteps(outboundTextMessages, mediaToSend, shadow.intent);

                for (const step of steps) {
                  if (step.kind === "text") {
                    const textSend = await postInstagramMessage({
                      accountId: igAccountId,
                      recipientId: contactInstagramId,
                      accessToken: instagramAccessToken,
                      message: { text: step.text.trim() }
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
                    sentTextMessages.push({
                      provider_message_id: textSend?.message_id ?? null,
                      text: step.text.trim()
                    });
                  } else {
                    const asset = step.asset;
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
                    provider_message_id: sentTextMessages[0]?.provider_message_id ?? null,
                    sent_text_messages: sentTextMessages,
                    sent_media: sentMedia,
                    formatting_version: DM_FORMAT_VERSION
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

    console.log("instagram_webhook_processing_completed", JSON.stringify({
      eventsSeen,
      messagesStored,
      shadowGenerated,
      humanMediaArchive,
      aiReady: Boolean(openaiKey)
    }));
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    console.error("instagram_webhook_processing_failed", errorText);
    await db.from("instagram_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: errorText.slice(0,1000) })
      .eq("event_key", webhookEventKey);
    return;
  }
  })();

  EdgeRuntime.waitUntil(backgroundTask);

  return respond({
    ok: true,
    accepted: true,
    shadowMode: true,
    eventKey: webhookEventKey
  });
});

