import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type InstagramInboxConversation = {
  id: string;
  mode: "ai_active" | "review_required" | "human_active";
  status: "open" | "resolved";
  detectedLanguage: "es" | "en" | "mixed" | "unknown";
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  contact: {
    id: string;
    instagramUserId: string;
    username: string | null;
    displayName: string | null;
  };
  lastMessage: {
    direction: "inbound" | "outbound";
    type: string;
    text: string | null;
    sentAt: string;
    hasAttachments: boolean;
  } | null;
};

export type InstagramInboxData = {
  schemaReady: boolean;
  conversations: InstagramInboxConversation[];
  openCount: number;
  unreadCount: number;
  reviewCount: number;
};

function isMissingInstagramSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /instagram_(conversations|contacts|messages)/i.test(error.message ?? "")
  );
}

export async function fetchInstagramInbox(): Promise<InstagramInboxData> {
  const empty: InstagramInboxData = {
    schemaReady: false,
    conversations: [],
    openCount: 0,
    unreadCount: 0,
    reviewCount: 0,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const { data: conversations, error: conversationError } = await supabase
      .from("instagram_conversations")
      .select(
        "id, contact_id, mode, status, detected_language, unread_count, last_message_at, last_inbound_at, last_outbound_at",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(75);

    if (conversationError) {
      if (isMissingInstagramSchema(conversationError)) return empty;
      throw new Error(`instagram_inbox_conversations_failed: ${conversationError.message}`);
    }

    if (!conversations?.length) {
      return { ...empty, schemaReady: true };
    }

    const contactIds = [...new Set(conversations.map((item) => item.contact_id))];
    const conversationIds = conversations.map((item) => item.id);

    const [{ data: contacts, error: contactError }, { data: messages, error: messageError }] =
      await Promise.all([
        supabase
          .from("instagram_contacts")
          .select("id, instagram_user_id, username, display_name")
          .in("id", contactIds),
        supabase
          .from("instagram_messages")
          .select(
            "conversation_id, direction, message_type, text_content, attachments, sent_at",
          )
          .in("conversation_id", conversationIds)
          .order("sent_at", { ascending: false })
          .limit(600),
      ]);

    if (contactError) {
      if (isMissingInstagramSchema(contactError)) return empty;
      throw new Error(`instagram_inbox_contacts_failed: ${contactError.message}`);
    }

    if (messageError) {
      if (isMissingInstagramSchema(messageError)) return empty;
      throw new Error(`instagram_inbox_messages_failed: ${messageError.message}`);
    }

    const contactsById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
    const lastMessageByConversation = new Map<string, (typeof messages)[number]>();

    for (const message of messages ?? []) {
      if (!lastMessageByConversation.has(message.conversation_id)) {
        lastMessageByConversation.set(message.conversation_id, message);
      }
    }

    const normalized: InstagramInboxConversation[] = conversations.flatMap((conversation) => {
      const contact = contactsById.get(conversation.contact_id);
      if (!contact) return [];

      const lastMessage = lastMessageByConversation.get(conversation.id) ?? null;
      const attachments = Array.isArray(lastMessage?.attachments)
        ? lastMessage.attachments
        : [];

      return [{
        id: conversation.id,
        mode: conversation.mode,
        status: conversation.status,
        detectedLanguage: conversation.detected_language,
        unreadCount: conversation.unread_count ?? 0,
        lastMessageAt: conversation.last_message_at,
        lastInboundAt: conversation.last_inbound_at,
        lastOutboundAt: conversation.last_outbound_at,
        contact: {
          id: contact.id,
          instagramUserId: contact.instagram_user_id,
          username: contact.username,
          displayName: contact.display_name,
        },
        lastMessage: lastMessage
          ? {
              direction: lastMessage.direction,
              type: lastMessage.message_type,
              text: lastMessage.text_content,
              sentAt: lastMessage.sent_at,
              hasAttachments: attachments.length > 0,
            }
          : null,
      }];
    });

    return {
      schemaReady: true,
      conversations: normalized,
      openCount: normalized.filter((item) => item.status === "open").length,
      unreadCount: normalized.reduce((sum, item) => sum + item.unreadCount, 0),
      reviewCount: normalized.filter((item) => item.mode === "review_required").length,
    };
  } catch (error) {
    console.error("instagram_inbox_read_failed", error);
    return empty;
  }
}
