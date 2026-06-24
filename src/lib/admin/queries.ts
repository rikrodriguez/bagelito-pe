import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const productionStatuses = ["payment_confirmed", "in_production", "ready_for_delivery", "delivered"] as const;

export type OrderItem = {
  id: string;
  flavor_slug: string;
  flavor_name: string;
  quantity: number;
};

export type StatusHistory = {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  order_code: string;
  pack_slug: string;
  pack_name: string;
  pack_units: number;
  pack_type: string;
  customer_name: string;
  whatsapp: string;
  email: string;
  delivery_address: string;
  district: string;
  address_reference: string | null;
  delivery_notes: string | null;
  marketing_opt_in: boolean;
  total_amount: number;
  payment_method: string;
  payment_transaction_number: string;
  payment_holder_name: string;
  payment_phone_number: string;
  payment_screenshot_path: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  order_status_history?: StatusHistory[];
};

type ArchiveableOrder = {
  order_status_history?: StatusHistory[];
};

export function getOrderArchiveState(order: ArchiveableOrder) {
  const latestArchiveEvent = [...(order.order_status_history ?? [])]
    .filter((item) => item.new_status === "archived" || item.new_status === "unarchived")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return {
    isArchived: latestArchiveEvent?.new_status === "archived",
    archivedAt: latestArchiveEvent?.new_status === "archived" ? latestArchiveEvent.created_at : null,
    archivedBy: latestArchiveEvent?.new_status === "archived" ? latestArchiveEvent.changed_by : null,
  };
}

export function isOrderArchived(order: ArchiveableOrder) {
  return getOrderArchiveState(order).isArchived;
}

export function filterActiveOrders<T extends ArchiveableOrder>(orders: T[]) {
  return orders.filter((order) => !isOrderArchived(order));
}

export function filterArchivedOrders<T extends ArchiveableOrder>(orders: T[]) {
  return orders.filter(isOrderArchived);
}

export async function fetchOrders() {
  const { data, error } = await createSupabaseAdminClient()
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function fetchOrderByCode(orderCode: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .eq("order_code", orderCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Order | null;
}

export function isManualPaymentPending(order: Order) {
  return order.payment_transaction_number === "PENDING_PAYMENT";
}

export function hasUploadedPaymentProof(order: Pick<Order, "payment_screenshot_path">) {
  return Boolean(order.payment_screenshot_path) && !order.payment_screenshot_path.startsWith("payment-pending/");
}

export function getDashboardStats(orders: Order[]) {
  const activeOrders = filterActiveOrders(orders);
  const byStatus = new Map<string, number>();
  const packBreakdown = new Map<string, number>();
  const flavorBreakdown = new Map<string, number>();
  let confirmedRevenue = 0;
  let confirmedBagels = 0;

  for (const order of activeOrders) {
    byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
    packBreakdown.set(order.pack_name, (packBreakdown.get(order.pack_name) ?? 0) + 1);

    if (productionStatuses.includes(order.status as (typeof productionStatuses)[number])) {
      confirmedRevenue += Number(order.total_amount);
      confirmedBagels += Number(order.pack_units);
      for (const item of order.order_items ?? []) {
        flavorBreakdown.set(item.flavor_name, (flavorBreakdown.get(item.flavor_name) ?? 0) + item.quantity);
      }
    }
  }

  return {
    total: activeOrders.length,
    pending: byStatus.get("payment_pending_review") ?? 0,
    confirmed: byStatus.get("payment_confirmed") ?? 0,
    needsCorrection: byStatus.get("needs_correction") ?? 0,
    cancelled: byStatus.get("cancelled") ?? 0,
    confirmedRevenue,
    confirmedBagels,
    packBreakdown: Array.from(packBreakdown.entries()),
    flavorBreakdown: Array.from(flavorBreakdown.entries()),
  };
}

export function getProductionSummary(orders: Order[]) {
  const summary = new Map<string, number>();

  for (const order of filterActiveOrders(orders)) {
    if (!productionStatuses.includes(order.status as (typeof productionStatuses)[number])) continue;
    for (const item of order.order_items ?? []) {
      summary.set(item.flavor_name, (summary.get(item.flavor_name) ?? 0) + item.quantity);
    }
  }

  return Array.from(summary.entries()).map(([flavorName, quantity]) => ({ flavorName, quantity }));
}

export function getDeliverySummary(orders: Order[]) {
  const groups = new Map<string, { district: string; orders: Order[]; packs: number; bagels: number }>();

  for (const order of filterActiveOrders(orders)) {
    if (!productionStatuses.includes(order.status as (typeof productionStatuses)[number])) continue;
    const current = groups.get(order.district) ?? { district: order.district, orders: [], packs: 0, bagels: 0 };
    current.orders.push(order);
    current.packs += 1;
    current.bagels += Number(order.pack_units);
    groups.set(order.district, current);
  }

  return Array.from(groups.values()).sort((a, b) => a.district.localeCompare(b.district));
}
