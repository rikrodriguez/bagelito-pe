"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/payments/culqi/status/route";
import { createCulqiAdminStatusAction, type CulqiAdminStatusResult } from "@/lib/payments/culqi-admin-status-adapter";

export type { CulqiAdminStatusResult } from "@/lib/payments/culqi-admin-status-adapter";

const ENV_KEYS = ["CULQI_STATUS_RECOVERY_APPROVED", "VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV",
  "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG",
  "VERCEL_BRANCH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "PAYMENT_PROVIDER",
  "CULQI_MODE", "CULQI_ENABLED", "CULQI_LIVE_APPROVED", "NEXT_PUBLIC_CULQI_PUBLIC_KEY", "CULQI_SECRET_KEY"] as const;

export async function runCulqiExistingOrderStatus(previousState: unknown, input: unknown): Promise<CulqiAdminStatusResult> {
  const run = createCulqiAdminStatusAction({
    requireAdmin,
    readHeaders: headers,
    readConfig: () => Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])),
    readOrderPair: async (orderCode, signal) => {
      const database = createSupabaseAdminClient();
      const { data, error } = await database.from("orders")
        .select("order_code,checkout_session_id").eq("order_code", orderCode)
        .abortSignal(signal).maybeSingle();
      if (error) throw new Error("status_unavailable");
      return data;
    },
    // A local call preserves the status handler's existing policy, rate limit,
    // GET/parser, confirmation and authoritative reread. No hosting fetch.
    postStatus: POST,
  });
  // Next's native Server Action CSRF check remains enabled; the adapter also
  // rejects missing or noncanonical real headers before configuration or DB.
  return run(previousState, input);
}
