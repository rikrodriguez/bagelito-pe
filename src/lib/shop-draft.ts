import type { PackSlug } from "@/data/packs";

// The visual shop carries only the pack and flavor counts into checkout.
// This key must be stable across the homepage and original ReservationFlow.
export const SHOP_DRAFT_KEY = "bagelito:shop-box:v1";
export const SHOP_DRAFT_UPDATED_EVENT = "bagelito:shop-box-updated";

const validPackSlugs: ReadonlySet<string> = new Set([
  "6-mixed", "6-single", "12-mixed", "12-single",
]);

export function getShopCheckoutHref(readItem?: (key: string) => string | null): string {
  let slug: PackSlug = "6-mixed";
  try {
    const draft: unknown = JSON.parse(readItem?.(SHOP_DRAFT_KEY) ?? "null");
    if (draft && typeof draft === "object") {
      const candidate = draft as { version?: unknown; packSlug?: unknown };
      if (candidate.version === 1 && typeof candidate.packSlug === "string" && validPackSlugs.has(candidate.packSlug)) {
        slug = candidate.packSlug as PackSlug;
      }
    }
  } catch { /* Untrusted or unavailable storage must never break checkout. */ }
  return "/checkout?pack=" + encodeURIComponent(slug);
}
