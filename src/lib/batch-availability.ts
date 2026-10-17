export const ordersOpenStatus = "orders_open";

export function isBatchAcceptingOrders(
  status: string,
  ordersCloseAt: string | null,
  now = Date.now(),
  ordersOpenAt: string | null = null,
) {
  if (status !== ordersOpenStatus) return false;
  if (ordersOpenAt) {
    const opensAt = new Date(ordersOpenAt).getTime();
    if (!Number.isFinite(opensAt) || now < opensAt) return false;
  }
  if (!ordersCloseAt) return true;

  const closesAt = new Date(ordersCloseAt).getTime();
  return Number.isFinite(closesAt) && now < closesAt;
}

// Archive is a display concern. Capacity is released by cancellation or expiry,
// never by hiding a record from the operator's active list.
export function consumesBatchCapacity(order: {
  status: string;
  payment_provider?: string | null;
  payment_status?: string | null;
  payment_expires_at?: string | null;
}, now = Date.now()) {
  return order.status !== "cancelled" && !(
    order.payment_provider === "culqi"
    && (order.payment_status === "pending" || order.payment_status === "failed")
    && order.payment_expires_at
    && new Date(order.payment_expires_at).getTime() <= now
  );
}
