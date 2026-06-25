import type { Order } from "@/lib/admin/queries";
import { getWhatsAppHrefForPhone } from "@/lib/whatsapp";

export const adminWhatsAppIntents = ["payment_confirmed", "delivered"] as const;

export type AdminWhatsAppIntent = (typeof adminWhatsAppIntents)[number];

const sentStatusByIntent: Record<AdminWhatsAppIntent, string> = {
  payment_confirmed: "whatsapp_payment_confirmed_sent",
  delivered: "whatsapp_delivered_sent",
};

const intentByStatus: Record<string, AdminWhatsAppIntent | undefined> = {
  payment_confirmed: "payment_confirmed",
  delivered: "delivered",
};

const paidStatuses = new Set(["payment_confirmed", "in_production", "ready_for_delivery", "delivered"]);

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

export function getAdminWhatsAppSentStatus(intent: AdminWhatsAppIntent) {
  return sentStatusByIntent[intent];
}

export function getAdminWhatsAppSentAt(order: Order, intent: AdminWhatsAppIntent) {
  const sentStatus = getAdminWhatsAppSentStatus(intent);
  return [...(order.order_status_history ?? [])]
    .filter((item) => item.new_status === sentStatus)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at ?? null;
}

export function hasAdminWhatsAppMessageSent(order: Order, intent: AdminWhatsAppIntent) {
  return Boolean(getAdminWhatsAppSentAt(order, intent));
}

export function canSendAdminWhatsAppIntent(order: Pick<Order, "status">, intent: AdminWhatsAppIntent) {
  if (intent === "payment_confirmed") return paidStatuses.has(order.status);
  return order.status === "delivered";
}

export function getAdminWhatsAppFollowUps(orders: Order[]) {
  return orders.flatMap((order) => {
    const items: { order: Order; intent: AdminWhatsAppIntent }[] = [];

    if (canSendAdminWhatsAppIntent(order, "payment_confirmed") && !hasAdminWhatsAppMessageSent(order, "payment_confirmed")) {
      items.push({ order, intent: "payment_confirmed" });
    }

    if (canSendAdminWhatsAppIntent(order, "delivered") && !hasAdminWhatsAppMessageSent(order, "delivered")) {
      items.push({ order, intent: "delivered" });
    }

    return items;
  });
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
