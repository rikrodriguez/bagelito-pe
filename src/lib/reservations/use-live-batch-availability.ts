"use client";

import { useEffect, useState } from "react";
import type { BatchAvailability } from "./service";

const refreshIntervalMs = 15_000;

function isBatchAvailability(value: unknown): value is BatchAvailability {
  if (!value || typeof value !== "object") return false;
  const batch = value as Partial<BatchAvailability>;
  return typeof batch.accepting === "boolean"
    && typeof batch.batchName === "string"
    && typeof batch.status === "string"
    && typeof batch.reservedPacks === "number"
    && typeof batch.reservedBagels === "number";
}

export function useLiveBatchAvailability(initialBatch: BatchAvailability) {
  const [batch, setBatch] = useState(initialBatch);

  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;

    async function refresh() {
      request?.abort();
      request = new AbortController();

      try {
        const response = await fetch("/api/batch", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;

        const nextBatch: unknown = await response.json();
        if (active && isBatchAvailability(nextBatch)) setBatch(nextBatch);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last known-good batch state when a refresh fails.
        }
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    void refresh();
    const interval = window.setInterval(refresh, refreshIntervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      request?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return batch;
}
