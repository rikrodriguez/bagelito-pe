"use client";

import { MessageCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { AdminWhatsAppIntent } from "@/lib/admin/whatsapp-messages";
import { markWhatsAppMessageSent } from "./actions";

type AdminWhatsAppSendFormProps = {
  href: string;
  intent: AdminWhatsAppIntent;
  label: string;
  orderCode: string;
  orderId: string;
  returnTo: string;
};

export function AdminWhatsAppSendForm({ href, intent, label, orderCode, orderId, returnTo }: AdminWhatsAppSendFormProps) {
  return (
    <form
      action={markWhatsAppMessageSent}
      className="admin-whatsapp-send-form"
      onSubmit={() => {
        window.open(href, "_blank", "noopener,noreferrer");
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderCode" value={orderCode} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <WhatsAppSendButton label={label} />
    </form>
  );
}

function WhatsAppSendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="status-action whatsapp" disabled={pending} type="submit">
      <MessageCircle size={15} />
      <span>{pending ? "Logging..." : label}</span>
    </button>
  );
}
