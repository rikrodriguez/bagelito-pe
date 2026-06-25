import { track } from "@vercel/analytics/server";
import { logWarn } from "@/lib/monitoring";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsValue>;

export async function trackBagelitoServerEvent(name: string, properties?: AnalyticsProperties, request?: Request) {
  try {
    await track(name, properties, request ? { request } : undefined);
  } catch (error) {
    logWarn("analytics_event_failed", {
      event: name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
