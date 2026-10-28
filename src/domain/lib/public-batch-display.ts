import type { BatchAvailability } from "./batch-types";
type PublicBatchSnapshot = Pick<BatchAvailability, "accepting" | "status" | "ordersOpenAt" | "deliveryDate">;

function futureTimestamp(value: string | null, now: number): number | null {
  if (!value || !Number.isFinite(now) || now <= 0) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > now ? milliseconds : null;
}

/** Never serve expired batch availability or delivery dates as future promises. */
export function getPublicBatchDisplay(batch: PublicBatchSnapshot, now: number) {
  const nextOpeningAt = !batch.accepting && batch.status === "waitlist_open"
    && futureTimestamp(batch.ordersOpenAt, now) !== null ? batch.ordersOpenAt : null;
  const showFutureDelivery = !batch.accepting && batch.status !== "delivered"
    && futureTimestamp(batch.deliveryDate, now) !== null;
  return { nextOpeningAt, showFutureDelivery };
}
