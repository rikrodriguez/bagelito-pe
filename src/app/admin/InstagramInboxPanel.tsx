import { Bot, CircleUserRound, Languages, MessageCircle, ShieldCheck } from "lucide-react";
import type { InstagramInboxData } from "@/lib/admin/instagram-inbox";\nimport { InstagramShadowDraftButton } from "./InstagramShadowDraftButton";

function languageLabel(language: string) {
  if (language === "es") return "ES";
  if (language === "en") return "EN";
  if (language === "mixed") return "ES/EN";
  return "Detecting";
}

function modeLabel(mode: string) {
  if (mode === "ai_active") return "AI active";
  if (mode === "human_active") return "Human";
  return "Needs review";
}

function formatInboxTime(value: string | null) {
  if (!value) return "No messages yet";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

function previewText(message: InstagramInboxData["conversations"][number]["lastMessage"]) {
  if (!message) return "No message captured yet.";
  if (message.text) return message.text;
  if (message.hasAttachments) return "Media attachment";
  return message.type.replaceAll("_", " ");
}

export function InstagramInboxPanel({ data }: { data: InstagramInboxData }) {
  if (!data.schemaReady) {
    return (
      <section className="admin-card" id="instagram-inbox">
        <div className="admin-card-head">
          <div>
            <p className="kicker">Instagram · Shadow mode</p>
            <h2>Instagram inbox</h2>
            <p>The inbox UI is ready, but Instagram is not connected to this environment yet.</p>
          </div>
          <span className="status-pill warning">Not connected</span>
        </div>
        <div className="admin-safety-card">
          <div>
            <span><ShieldCheck size={17} /> Safe by design</span>
            <strong>No automatic Instagram sending is enabled.</strong>
            <p>After the Bagelito database and Meta webhook are connected, conversations will appear here in read-only Shadow Mode.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card" id="instagram-inbox">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Instagram · Shadow mode</p>
          <h2>Instagram inbox</h2>
          <p>Real conversations, bilingual language detection, and AI/human state. Sending remains disabled.</p>
        </div>
        <span className="status-pill neutral">Read only</span>
      </div>

      <div className="customer-crm-kpis">
        <div><span>Open threads</span><strong>{data.openCount}</strong><small>Current conversations</small></div>
        <div><span>Unread</span><strong>{data.unreadCount}</strong><small>Inbound messages</small></div>
        <div><span>Needs review</span><strong>{data.reviewCount}</strong><small>Human review state</small></div>
        <div><span>Automation</span><strong>Shadow</strong><small>No outbound messaging</small></div>
      </div>

      {data.conversations.length ? (
        <div className="customer-profile-list">
          {data.conversations.map((conversation) => {
            const name = conversation.contact.displayName || conversation.contact.username || conversation.contact.instagramUserId;
            const username = conversation.contact.username
              ? `@${conversation.contact.username}`
              : conversation.contact.instagramUserId;

            return (
              <article className="customer-profile-card" key={conversation.id}>
                <div className="customer-profile-head">
                  <div className="customer-avatar"><CircleUserRound size={20} /></div>
                  <div>
                    <h3>{name}</h3>
                    <p>{username}</p>
                    <p>{formatInboxTime(conversation.lastMessageAt)}</p>
                  </div>
                  <span className={`status-pill ${conversation.unreadCount ? "warning" : "neutral"}`}>
                    {conversation.unreadCount ? `${conversation.unreadCount} unread` : "Seen"}
                  </span>
                </div>

                <div className="customer-profile-metrics">
                  <div><span>Language</span><strong><Languages size={14} /> {languageLabel(conversation.detectedLanguage)}</strong></div>
                  <div><span>Mode</span><strong><Bot size={14} /> {modeLabel(conversation.mode)}</strong></div>
                  <div><span>Status</span><strong>{conversation.status}</strong></div>
                  <div><span>Last</span><strong>{conversation.lastMessage?.direction ?? "—"}</strong></div>
                </div>

                <div className="customer-crm-highlight">
                  <span><MessageCircle size={14} /> Last message</span>
                  <strong>{previewText(conversation.lastMessage)}</strong>
                  <small>{conversation.lastMessage?.hasAttachments ? "Includes media · " : ""}Shadow Mode: analysis only.</small>
                </div>

                <InstagramShadowDraftButton conversationId={conversation.id} />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">Instagram is connected, but no conversations have been captured yet.</div>
      )}
    </section>
  );
}
