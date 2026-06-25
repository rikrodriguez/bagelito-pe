import { CheckCircle2, MessageCircle } from "lucide-react";
import type { Order } from "@/lib/admin/queries";
import { buildAdminWhatsAppMessage, getAdminWhatsAppSentAt, type AdminWhatsAppIntent } from "@/lib/admin/whatsapp-messages";
import { AdminWhatsAppSendForm } from "./AdminWhatsAppSendForm";

type AdminWhatsAppMessageProps = {
  order: Order;
  intent: AdminWhatsAppIntent;
  returnTo: string;
};

export function AdminWhatsAppNotice({ order, intent, returnTo }: AdminWhatsAppMessageProps) {
  const content = buildAdminWhatsAppMessage(order, intent);
  const sentAt = getAdminWhatsAppSentAt(order, intent);

  return (
    <div className="admin-whatsapp-notice">
      <div className="admin-whatsapp-copy">
        <span><MessageCircle size={17} /> {content.eyebrow}</span>
        <strong>{content.title}</strong>
        <p>{content.description}</p>
        {sentAt ? <small><CheckCircle2 size={14} /> Logged {new Date(sentAt).toLocaleString("en-US")}</small> : null}
        <pre>{content.message}</pre>
      </div>
      <AdminWhatsAppSendForm href={content.href} intent={intent} label="Open + log sent" orderCode={order.order_code} orderId={order.id} returnTo={returnTo} />
    </div>
  );
}

export function AdminWhatsAppLink({ order, intent, label, returnTo }: AdminWhatsAppMessageProps & { label: string }) {
  const content = buildAdminWhatsAppMessage(order, intent);

  return <AdminWhatsAppSendForm href={content.href} intent={intent} label={label} orderCode={order.order_code} orderId={order.id} returnTo={returnTo} />;
}
