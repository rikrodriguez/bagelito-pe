import type { Order } from "@/lib/admin/queries";
import { getWhatsAppHrefForPhone } from "@/lib/whatsapp";

export const adminWhatsAppIntents = [
  "order_received",
  "payment_confirmed",
  "delivery_reminder",
  "delivered",
  "feedback_request",
] as const;

export type AdminWhatsAppIntent = (typeof adminWhatsAppIntents)[number];

const sentStatusByIntent: Record<AdminWhatsAppIntent, string> = {
  order_received: "whatsapp_order_received_sent",
  payment_confirmed: "whatsapp_payment_confirmed_sent",
  delivery_reminder: "whatsapp_delivery_reminder_sent",
  delivered: "whatsapp_delivered_sent",
  feedback_request: "whatsapp_feedback_request_sent",
};

const intentByStatus: Record<string, AdminWhatsAppIntent | undefined> = {
  payment_confirmed: "payment_confirmed",
  ready_for_delivery: "delivery_reminder",
  delivered: "delivered",
};

const paidStatuses = new Set(["payment_confirmed", "in_production", "ready_for_delivery", "delivered"]);
const activeStatuses = new Set(["payment_pending_review", "payment_confirmed", "needs_correction", "in_production", "ready_for_delivery", "delivered"]);

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

export function getAdminWhatsAppSentAt(order: Pick<Order, "order_status_history">, intent: AdminWhatsAppIntent) {
  const sentStatus = getAdminWhatsAppSentStatus(intent);
  return [...(order.order_status_history ?? [])]
    .filter((item) => item.new_status === sentStatus)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at ?? null;
}

export function hasAdminWhatsAppMessageSent(order: Pick<Order, "order_status_history">, intent: AdminWhatsAppIntent) {
  return Boolean(getAdminWhatsAppSentAt(order, intent));
}

export function canSendAdminWhatsAppIntent(order: Pick<Order, "status" | "order_status_history">, intent: AdminWhatsAppIntent) {
  if (intent === "order_received") return activeStatuses.has(order.status);
  if (intent === "payment_confirmed") return paidStatuses.has(order.status);
  if (intent === "delivery_reminder") return order.status === "ready_for_delivery";
  if (intent === "feedback_request") return order.status === "delivered" && hasAdminWhatsAppMessageSent(order, "delivered");
  return order.status === "delivered";
}

export function getAdminWhatsAppFollowUps(orders: Order[]) {
  return orders.flatMap((order) => {
    const items: { order: Order; intent: AdminWhatsAppIntent }[] = [];

    if ((order.status === "payment_pending_review" || order.status === "needs_correction") && !hasAdminWhatsAppMessageSent(order, "order_received")) {
      items.push({ order, intent: "order_received" });
    }

    if (canSendAdminWhatsAppIntent(order, "payment_confirmed") && !hasAdminWhatsAppMessageSent(order, "payment_confirmed")) {
      items.push({ order, intent: "payment_confirmed" });
    }

    if (canSendAdminWhatsAppIntent(order, "delivery_reminder") && !hasAdminWhatsAppMessageSent(order, "delivery_reminder")) {
      items.push({ order, intent: "delivery_reminder" });
    }

    const deliveredMessageSent = hasAdminWhatsAppMessageSent(order, "delivered");
    if (canSendAdminWhatsAppIntent(order, "delivered") && !deliveredMessageSent) {
      items.push({ order, intent: "delivered" });
    } else if (canSendAdminWhatsAppIntent(order, "feedback_request") && deliveredMessageSent && !hasAdminWhatsAppMessageSent(order, "feedback_request")) {
      items.push({ order, intent: "feedback_request" });
    }

    return items;
  });
}

export function buildAdminWhatsAppMessage(order: Order, intent: AdminWhatsAppIntent) {
  const name = firstName(order.customer_name);

  if (intent === "order_received") {
    const message = [
      `Hi ${name}! This is Bagelito.pe.`,
      `We received your reservation ${order.order_code}: ${order.pack_name} (${formatMoney(Number(order.total_amount))}).`,
      "We are reviewing your payment details now. Your pack is fully confirmed once payment is validated.",
      "If anything needs correction, we will message you here.",
    ].join("\n\n");

    return {
      title: "Order received message ready",
      eyebrow: "Post-purchase",
      cta: "Open WhatsApp",
      description: "Send after the reservation arrives, especially while payment is pending review.",
      message,
      href: getWhatsAppHrefForPhone(order.whatsapp, message),
    };
  }

  if (intent === "delivery_reminder") {
    const message = [
      `Hi ${name}! This is Bagelito.pe.`,
      `Your order ${order.order_code} is ready for the delivery window.`,
      `Delivery address: ${order.delivery_address}, ${order.district}.`,
      "Please keep your phone available. If there is a gate, front desk, or handoff note we should know, reply here.",
    ].join("\n\n");

    return {
      title: "Delivery reminder ready",
      eyebrow: "Delivery reminder",
      cta: "Open WhatsApp",
      description: "Send when the order is ready for delivery or before the driver leaves.",
      message,
      href: getWhatsAppHrefForPhone(order.whatsapp, message),
    };
  }

  if (intent === "delivered") {
    const message = [
      `Hi ${name}! This is Bagelito.pe.`,
      `We marked your order ${order.order_code} as delivered.`,
      "Thank you for being part of this batch. Hope the bagels arrived fresh and happy.",
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

  if (intent === "feedback_request") {
    const message = [
      `Hi ${name}! This is Bagelito.pe.`,
      `Quick favor: how was your ${order.pack_name}?`,
      "If you enjoyed it, a short testimonial, photo, or voice note would help us a lot for the next batch.",
      "Something simple like: \"Loved the texture and flavor - definitely ordering again\" is perfect.",
    ].join("\n\n");

    return {
      title: "Feedback request ready",
      eyebrow: "Feedback / testimonial",
      cta: "Open WhatsApp",
      description: "Send after the received message, once the customer has had time to try the bagels.",
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
