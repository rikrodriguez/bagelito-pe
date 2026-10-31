"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BatchAvailability } from "@/lib/reservations/service";
import { useLiveBatchAvailability } from "@/lib/reservations/use-live-batch-availability";

type PublicBatchContext = BatchAvailability & { merchantReviewOnly: boolean };
const BatchAvailabilityContext = createContext<PublicBatchContext | null>(null);

type BatchAvailabilityProviderProps = {
  children: ReactNode;
  initialBatch: BatchAvailability;
  merchantReviewOnly?: boolean;
};

export function BatchAvailabilityProvider({ children, initialBatch, merchantReviewOnly = false }: BatchAvailabilityProviderProps) {
  const batch = useLiveBatchAvailability(initialBatch);

  return (
    <BatchAvailabilityContext.Provider value={{ ...batch, merchantReviewOnly }}>
      {children}
    </BatchAvailabilityContext.Provider>
  );
}

export function useBatchAvailability() {
  const batch = useContext(BatchAvailabilityContext);

  if (!batch) {
    throw new Error("useBatchAvailability must be used within BatchAvailabilityProvider.");
  }

  return batch;
}
