/**
 * Framework-independent, READ-ONLY translation of the batch capacity projection
 * in Bagelito Next.js src/lib/reservations/service.ts.
 * Never use availability checks alone to accept or commit an order. The order
 * reservation RPC enforces the transactional capacity and payment constraints.
 */
import { isBatchAcceptingOrders } from './batch-availability';
import type { BatchAvailability } from './batch-types';

export type CurrentBatchRow = {
  id: string;
  name: string;
  status: string;
  orders_open_at: string | null;
  orders_close_at: string | null;
  delivery_date: string | null;
  capacity_packs: number | null;
  capacity_bagels: number | null;
};
export type CapacityOrderRow = {
  pack_units: number;
  payment_expires_at?: string | null;
  payment_provider?: string | null;
  payment_status?: string | null;
  status: string;
};
export type BatchUsage = { reservedBagels: number; reservedPacks: number };

export function fallbackBatchAvailability(status = 'closed'): BatchAvailability {
  return {
    accepting: false,
    batchName: 'Next Bagelito Batch',
    capacityBagels: null,
    capacityPacks: null,
    deliveryDate: null,
    ordersOpenAt: null,
    ordersCloseAt: null,
    remainingBagels: null,
    remainingPacks: null,
    reservedBagels: 0,
    reservedPacks: 0,
    status,
  };
}

/** Mirror source semantics: expired pending/failed Culqi holds no longer use space. */
export function computeBatchUsage(orders: CapacityOrderRow[], now = Date.now()): BatchUsage {
  const active = orders.filter((order) => {
    if (order.status === 'cancelled') return false;
    const expiredCulqiHold =
      order.payment_provider === 'culqi' &&
      (order.payment_status === 'pending' || order.payment_status === 'failed') &&
      !!order.payment_expires_at &&
      new Date(order.payment_expires_at).getTime() <= now;
    return !expiredCulqiHold;
  });
  return {
    reservedBagels: active.reduce((sum, order) => sum + Number(order.pack_units), 0),
    reservedPacks: active.length,
  };
}

/** Read-only projection equivalent to getReservationBatchAvailability for fixtures. */
export function projectBatchAvailability(
  batch: CurrentBatchRow | null,
  orders: CapacityOrderRow[],
  now = Date.now(),
  nextPackUnits = 6,
): BatchAvailability {
  if (!batch) return fallbackBatchAvailability('closed');
  const usage = computeBatchUsage(orders, now);
  const accepting =
    isBatchAcceptingOrders(batch.status, batch.orders_close_at, now, batch.orders_open_at) &&
    !(batch.capacity_packs && usage.reservedPacks + 1 > Number(batch.capacity_packs)) &&
    !(batch.capacity_bagels && usage.reservedBagels + nextPackUnits > Number(batch.capacity_bagels));

  return {
    accepting: Boolean(accepting),
    batchName: batch.name,
    capacityBagels: batch.capacity_bagels,
    capacityPacks: batch.capacity_packs,
    deliveryDate: batch.delivery_date,
    ordersOpenAt: batch.orders_open_at,
    ordersCloseAt: batch.orders_close_at,
    remainingBagels: batch.capacity_bagels ? Math.max(0, Number(batch.capacity_bagels) - usage.reservedBagels) : null,
    remainingPacks: batch.capacity_packs ? Math.max(0, Number(batch.capacity_packs) - usage.reservedPacks) : null,
    reservedBagels: usage.reservedBagels,
    reservedPacks: usage.reservedPacks,
    status: batch.status,
  };
}
