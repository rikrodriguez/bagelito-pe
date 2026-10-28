export const ordersOpenStatus = 'orders_open'

export function isBatchAcceptingOrders(
  status: string,
  ordersCloseAt: string | null,
  now = Date.now(),
  ordersOpenAt: string | null = null,
) {
  if (status !== ordersOpenStatus) return false
  if (ordersOpenAt) {
    const opensAt = new Date(ordersOpenAt).getTime()
    if (!Number.isFinite(opensAt) || now < opensAt) return false
  }
  if (!ordersCloseAt) return true

  const closesAt = new Date(ordersCloseAt).getTime()
  return Number.isFinite(closesAt) && now < closesAt
}
