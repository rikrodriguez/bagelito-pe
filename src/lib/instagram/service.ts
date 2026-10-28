import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  hashInstagramPayload,
  normalizeInstagramWebhook,
  type InstagramNormalizedEvent,
} from "@/lib/instagram/webhook";

type PersistResult = {
  duplicateWebhook: boolean;
  eventsSeen: number;
  messagesStored: number;
};

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function ensureAccount(instagramUserId: string) {
  const supabase = createSupabaseAdminClient();
  const username = process.env.INSTAGRAM_USERNAME?.trim() || "bagelito.pe";

  const { data, error } = await supabase
    .from("instagram_accounts")
    .upsert(
      {
        instagram_user_id: instagramUserId,
        username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_user_id" },
    )
    .select("id, instagram_user_id")
    .single();

  if (error) throw new Error(`instagram_account_upsert_failed: ${error.message}`);
  return data;
}

async function ensureContact(accountId: string, instagramUserId: string) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("instagram_contacts")
    .upsert(
      {
        account_id: accountId,
        instagram_user_id: instagramUserId,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "account_id,instagram_user_id" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`instagram_contact_upsert_failed: ${error.message}`);
  return data;
}

async function getConversation(accountId: string, contactId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("instagram_conversations")
    .select("id, unread_count")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error) {
    throw new Error(`instagram_conversation_read_failed: ${error.message}`);
  }

  return data;
}

async function ensureConversation(accountId: string, contactId: string) {
  const existing = await getConversation(accountId, contactId);
  if (existing) return existing;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("instagram_conversations")
    .insert({
      account_id: accountId,
      contact_id: contactId,
      mode: "review_required",
      status: "open",
    })
    .select("id, unread_count")
    .single();

  if (!error && data) return data;

  if (isUniqueViolation(error)) {
    const raced = await getConversation(accountId, contactId);
    if (raced) return raced;
  }

  throw new Error(
    `instagram_conversation_insert_failed: ${error?.message ?? "unknown error"}`,
  );
}

function messageType(event: InstagramNormalizedEvent): string {
  if (event.kind !== "message") return event.kind;
  if (event.attachments.length > 0 && event.text) return "text_with_attachment";
  if (event.attachments.length > 0) return "attachment";
  return "text";
}

async function claimWebhook(payload: unknown, rawBody: string) {
  const supabase = createSupabaseAdminClient();
  const eventKey = hashInstagramPayload(rawBody);

  const { data: existing, error: readError } = await supabase
    .from("instagram_webhook_events")
    .select("id, processed_at, processing_error")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (readError) {
    throw new Error(`instagram_webhook_dedupe_failed: ${readError.message}`);
  }

  if (existing?.processed_at || (existing && !existing.processing_error)) {
    return { eventKey, duplicate: true };
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("instagram_webhook_events")
      .insert({
        event_key: eventKey,
        payload,
        received_at: new Date().toISOString(),
      });

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return { eventKey, duplicate: true };
      }

      throw new Error(`instagram_webhook_store_failed: ${insertError.message}`);
    }
  } else {
    const { error: retryError } = await supabase
      .from("instagram_webhook_events")
      .update({
        payload,
        processing_error: null,
        received_at: new Date().toISOString(),
      })
      .eq("event_key", eventKey);

    if (retryError) {
      throw new Error(`instagram_webhook_retry_claim_failed: ${retryError.message}`);
    }
  }

  return { eventKey, duplicate: false };
}

async function storeMessage(
  conversationId: string,
  event: InstagramNormalizedEvent,
  inbound: boolean,
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("instagram_messages")
    .insert({
      attachments: event.attachments,
      conversation_id: conversationId,
      direction: inbound ? "inbound" : "outbound",
      message_type: messageType(event),
      provider_event_key: event.eventKey,
      provider_message_id: event.messageId,
      raw_payload: event.raw,
      sent_at: event.sentAt,
      text_content: event.text,
    });

  if (!error) return true;
  if (isUniqueViolation(error)) return false;

  throw new Error(`instagram_message_insert_failed: ${error.message}`);
}

export async function persistInstagramWebhook(
  payload: unknown,
  rawBody: string,
): Promise<PersistResult> {
  const supabase = createSupabaseAdminClient();
  const claim = await claimWebhook(payload, rawBody);

  if (claim.duplicate) {
    return { duplicateWebhook: true, eventsSeen: 0, messagesStored: 0 };
  }

  const events = normalizeInstagramWebhook(payload);
  let messagesStored = 0;

  try {
    for (const event of events) {
      if (event.kind !== "message") continue;

      const configuredAccountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim() || null;
      const accountInstagramId =
        event.accountInstagramId ??
        configuredAccountId ??
        event.recipientInstagramId;

      if (!accountInstagramId) continue;

      const account = await ensureAccount(accountInstagramId);
      const inbound = event.senderInstagramId !== accountInstagramId;
      const contactInstagramId = inbound
        ? event.senderInstagramId
        : event.recipientInstagramId;

      if (!contactInstagramId || contactInstagramId === accountInstagramId) continue;

      const contact = await ensureContact(account.id, contactInstagramId);
      const conversation = await ensureConversation(account.id, contact.id);
      const inserted = await storeMessage(conversation.id, event, inbound);

      if (inserted) messagesStored += 1;

      const updates: Record<string, unknown> = {
        last_message_at: event.sentAt,
        status: "open",
        updated_at: new Date().toISOString(),
      };

      if (inbound) {
        updates.last_inbound_at = event.sentAt;
        updates.unread_count = (conversation.unread_count ?? 0) + (inserted ? 1 : 0);
      } else {
        updates.last_outbound_at = event.sentAt;
      }

      const { error: conversationUpdateError } = await supabase
        .from("instagram_conversations")
        .update(updates)
        .eq("id", conversation.id);

      if (conversationUpdateError) {
        throw new Error(
          `instagram_conversation_update_failed: ${conversationUpdateError.message}`,
        );
      }
    }

    const { error: processedError } = await supabase
      .from("instagram_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("event_key", claim.eventKey);

    if (processedError) {
      throw new Error(`instagram_webhook_finalize_failed: ${processedError.message}`);
    }

    return {
      duplicateWebhook: false,
      eventsSeen: events.length,
      messagesStored,
    };
  } catch (error) {
    await supabase
      .from("instagram_webhook_events")
      .update({
        processing_error: error instanceof Error ? error.message : String(error),
      })
      .eq("event_key", claim.eventKey);

    throw error;
  }
}
