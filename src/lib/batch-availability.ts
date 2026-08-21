export const ordersOpenStatus = "orders_open";

export function isBatchAcceptingOrders(
  status: string,
  ordersCloseAt: string | null,
  now = Date.now(),
) {
  if (status !== ordersOpenStatus) return false;
  if (!ordersCloseAt) return true;

  const closesAt = new Date(ordersCloseAt).getTime();
  return Number.isFinite(closesAt) && now < closesAt;
}
