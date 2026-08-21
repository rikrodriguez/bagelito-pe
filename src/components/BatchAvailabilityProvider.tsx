"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BatchAvailability } from "@/lib/reservations/service";
import { useLiveBatchAvailability } from "@/lib/reservations/use-live-batch-availability";

const BatchAvailabilityContext = createContext<BatchAvailability | null>(null);

type BatchAvailabilityProviderProps = {
  children: ReactNode;
  initialBatch: BatchAvailability;
};

export function BatchAvailabilityProvider({ children, initialBatch }: BatchAvailabilityProviderProps) {
  const batch = useLiveBatchAvailability(initialBatch);

  return (
    <BatchAvailabilityContext.Provider value={batch}>
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
