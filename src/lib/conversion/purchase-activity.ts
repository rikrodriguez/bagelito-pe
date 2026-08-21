import { unstable_cache } from "next/cache";
import type { PackSlug } from "@/data/packs";
import { getMissingReservationEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublicPurchaseActivity = {
  district: string;
  occurredAt: string;
  packName: string;
  packSlug: PackSlug | null;
};

type PurchaseActivityRow = {
  created_at: string | null;
  district: string | null;
  pack_name: string | null;
  pack_slug: string | null;
  payment_paid_at: string | null;
};

const validPackSlugs = new Set<PackSlug>([
  "12-mixed",
  "6-mixed",
  "12-single",
  "6-single",
]);

const readRecentPaidActivity = unstable_cache(
  async (): Promise<PublicPurchaseActivity[]> => {
    const supabase = createSupabaseAdminClient();
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select("district, pack_slug, pack_name, created_at, payment_paid_at")
      .or("payment_status.eq.paid,status.in.(payment_confirmed,in_production,ready_for_delivery,delivered)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(16);

    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    return ((data ?? []) as PurchaseActivityRow[])
      .flatMap((row) => {
        const district = row.district?.trim();
        const packName = row.pack_name?.trim();
        const occurredAt = row.payment_paid_at ?? row.created_at;
        if (!district || !packName || !occurredAt) return [];

        const packSlug = validPackSlugs.has(row.pack_slug as PackSlug)
          ? row.pack_slug as PackSlug
          : null;
        const safeDistrict = district === "Other" ? "Lima" : district;
        const dedupeKey = `${safeDistrict}:${packSlug ?? packName}`;
        if (seen.has(dedupeKey)) return [];
        seen.add(dedupeKey);

        return [{
          district: safeDistrict,
          occurredAt,
          packName,
          packSlug,
        }];
      })
      .slice(0, 10);
  },
  ["bagelito-public-purchase-activity"],
  { revalidate: 300 },
);

export async function getPublicPurchaseActivity(): Promise<PublicPurchaseActivity[]> {
  if (getMissingReservationEnv().length) return [];

  try {
    return await readRecentPaidActivity();
  } catch {
    // Conversion UI must never block the storefront if activity data is
    // unavailable or the payment migration has not been installed yet.
    return [];
  }
}
