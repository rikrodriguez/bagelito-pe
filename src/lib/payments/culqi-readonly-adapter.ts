import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createCulqiReadonlyDiagnostic,
  type CulqiReadonlyDiagnosticOrder,
  type CulqiReadonlyDiagnosticRequest,
} from "./culqi-readonly-diagnostic";

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const ORDER_FIELDS = "order_code,payment_provider,payment_lane,payment_order_id,payment_charge_id,payment_charge_source_id,payment_amount_minor,payment_currency";

export function isCulqiReadonlyActionRequestAllowed(request: CulqiReadonlyDiagnosticRequest): boolean {
  if (request.method !== "POST" || request.origin !== ORIGIN || request.host !== HOST
    || (request.forwardedHost != null && request.forwardedHost !== HOST)
    || (request.fetchSite != null && request.fetchSite !== "same-origin")) return false;
  if (request.referer != null) {
    try {
      const referer = new URL(request.referer);
      if (referer.origin !== ORIGIN || referer.username || referer.password) return false;
    } catch { return false; }
  }
  return true;
}

// Imported only by the existing administrative Server Action. No environment,
// database or provider work occurs at module initialization or during rendering.
export async function runAdminCulqiReadonlyDiagnostic(): Promise<{ ok: boolean }> {
  try {
    await requireAdmin();
    const incoming = await headers();
    const request: CulqiReadonlyDiagnosticRequest = {
      // Next.js Server Actions only accept POST. Do not take these from action input.
      method: "POST",
      origin: incoming.get("origin"),
      host: incoming.get("host"),
      forwardedHost: incoming.get("x-forwarded-host"),
      referer: incoming.get("referer"),
      fetchSite: incoming.get("sec-fetch-site"),
    };
    const forwardedProtocol = incoming.get("x-forwarded-proto");
    if (!isCulqiReadonlyActionRequestAllowed(request)
      || (forwardedProtocol !== null && forwardedProtocol !== "https")) return { ok: false };

    // The framework's Origin/Host protection is supplemented by the exact
    // canonical-origin gate above; no origins or proxy permissions are broadened.
    const run = createCulqiReadonlyDiagnostic({
      requireAdmin: async () => { /* Already verified before headers/config. */ },
      verifyActionCsrf: () => true,
      readConfig: () => process.env,
      readOrders: async (orderCodes) => {
        const database = createSupabaseAdminClient();
        const { data, error } = await database.from("orders")
          .select(ORDER_FIELDS).in("order_code", [...orderCodes]).limit(4)
          .abortSignal(AbortSignal.timeout(10_000));
        if (error) throw new Error("Readonly order lookup failed.");
        return (data ?? []) as CulqiReadonlyDiagnosticOrder[];
      },
      fetch: (url, init) => fetch(url, init),
      // Do not use monitoring helpers: they can write DB rows or send alerts.
      safeLog: (label, report) => console.info(label, report),
    });
    const report = await run(request);
    // All diagnostic observations remain in private runtime logs.
    return { ok: report.ok === true };
  } catch {
    // Suppress auth redirects, headers/config failures and all raw exceptions.
    return { ok: false };
  }
}
