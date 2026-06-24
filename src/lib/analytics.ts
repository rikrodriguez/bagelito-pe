"use client";

import { track } from "@vercel/analytics";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsValue>;

export function trackBagelitoEvent(name: string, properties?: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Analytics should never block navigation or checkout.
  }
}
