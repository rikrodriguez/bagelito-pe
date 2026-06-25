import { MessageCircle, Send } from "lucide-react";
import type { Order } from "@/lib/admin/queries";
import { buildAdminWhatsAppMessage, type AdminWhatsAppIntent } from "@/lib/admin/whatsapp-messages";

type AdminWhatsAppMessageProps = {
  order: Order;
  intent: AdminWhatsAppIntent;
};

export function AdminWhatsAppNotice({ order, intent }: AdminWhatsAppMessageProps) {
  const content = buildAdminWhatsAppMessage(order, intent);

  return (
    <div className="admin-whatsapp-notice">
      <div className="admin-whatsapp-copy">
        <span><MessageCircle size={17} /> {content.eyebrow}</span>
        <strong>{content.title}</strong>
        <p>{content.description}</p>
        <pre>{content.message}</pre>
      </div>
      <a href={content.href} target="_blank" rel="noreferrer">
        <Send size={16} />
        {content.cta}
      </a>
    </div>
  );
}

export function AdminWhatsAppLink({ order, intent, label }: AdminWhatsAppMessageProps & { label: string }) {
  const content = buildAdminWhatsAppMessage(order, intent);

  return (
    <a className="status-action whatsapp" href={content.href} target="_blank" rel="noreferrer">
      <MessageCircle size={15} />
      <span>{label}</span>
    </a>
  );
}
