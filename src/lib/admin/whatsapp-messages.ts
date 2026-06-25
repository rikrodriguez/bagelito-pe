import type { Order } from "@/lib/admin/queries";
import { getWhatsAppHrefForPhone } from "@/lib/whatsapp";

export const adminWhatsAppIntents = ["payment_confirmed", "delivered"] as const;

export type AdminWhatsAppIntent = (typeof adminWhatsAppIntents)[number];

const intentByStatus: Record<string, AdminWhatsAppIntent | undefined> = {
  payment_confirmed: "payment_confirmed",
  delivered: "delivered",
};

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function formatMoney(value: number) {
  return `S/${Math.round(Number(value))}`;
}

export function parseAdminWhatsAppIntent(value: string | undefined | null): AdminWhatsAppIntent | null {
  if (adminWhatsAppIntents.includes(value as AdminWhatsAppIntent)) return value as AdminWhatsAppIntent;
  return null;
}

export function getAdminWhatsAppIntentForStatus(status: string) {
  return intentByStatus[status] ?? null;
}

export function buildAdminWhatsAppMessage(order: Order, intent: AdminWhatsAppIntent) {
  const name = firstName(order.customer_name);

  if (intent === "delivered") {
    const message = [
      `Hi ${name}! This is Bagelito.pe.`,
      `We marked your order ${order.order_code} as delivered.`,
      "Thank you for being part of this batch. If you loved it, a quick reply or photo would mean a lot. 🥯",
    ].join("\n\n");

    return {
      title: "Received message ready",
      eyebrow: "Customer received",
      cta: "Open WhatsApp",
      description: "Send after the customer has received the order.",
      message,
      href: getWhatsAppHrefForPhone(order.whatsapp, message),
    };
  }

  const message = [
    `Hi ${name}! This is Bagelito.pe.`,
    `Your payment for ${order.order_code} is confirmed: ${order.pack_name} (${formatMoney(Number(order.total_amount))}).`,
    "We saved your spot in the next batch and will message you again when it is ready for delivery. 🥯",
  ].join("\n\n");

  return {
    title: "Payment confirmation ready",
    eyebrow: "Payment confirmed",
    cta: "Open WhatsApp",
    description: "Send right after confirming the customer's payment.",
    message,
    href: getWhatsAppHrefForPhone(order.whatsapp, message),
  };
}
