/** Exact read-only batch availability response contract copied from the Next.js reservation service. */
export type BatchAvailability = {
  accepting: boolean;
  batchName: string;
  capacityBagels: number | null;
  capacityPacks: number | null;
  deliveryDate: string | null;
  ordersOpenAt: string | null;
  ordersCloseAt: string | null;
  remainingBagels: number | null;
  remainingPacks: number | null;
  reservedBagels: number;
  reservedPacks: number;
  status: string;
};
