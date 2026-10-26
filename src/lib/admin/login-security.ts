import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const ADMIN_PASSWORD_MIN_LENGTH = 16;
export const ADMIN_LOGIN_WINDOW_SECONDS = 15 * 60;
export const ADMIN_LOGIN_IP_LIMIT = 5;
export const ADMIN_LOGIN_GLOBAL_LIMIT = 20;
// The production rate limiter stores ONLY SHA-256 identifiers (64 lowercase hex).
const ADMIN_LOGIN_GLOBAL_IDENTIFIER = createHash("sha256").update("bagelito:admin-login:global").digest("hex");

type HeaderReader = { get(name: string): string | null };
type LimiterClient = { rpc(name: string, args: Record<string, unknown>): {
  single(): PromiseLike<{ data: unknown; error: unknown }>;
} };

export function hasStrongAdminPassword(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length >= ADMIN_PASSWORD_MIN_LENGTH && value.length <= 1024;
}

export function adminLoginOriginAllowed(headers: HeaderReader, configuredSiteUrl: string | undefined): boolean {
  try {
    const expected = new URL(configuredSiteUrl ?? "");
    if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password) return false;
    return headers.get("origin") === expected.origin;
  } catch { return false; }
}

export function adminLoginIdentifier(headers: HeaderReader, vercelRuntime: boolean): string {
  // Only Vercel's runtime flag establishes the platform trust boundary. Never
  // trust x-vercel-id or a client-supplied forwarding header outside Vercel.
  const raw = vercelRuntime ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  let identity = "untrusted-or-missing";
  if (raw && isIP(raw)) {
    // URL canonicalizes alternate IPv6 spellings, without trusting an IP list.
    identity = isIP(raw) === 6 ? new URL(`http://[${raw}]/`).hostname.toLowerCase() : raw;
  }
  return createHash("sha256").update(`admin-login:${identity}`).digest("hex");
}

export async function consumeAdminLoginLimit(db: LimiterClient, headers: HeaderReader, vercelRuntime: boolean): Promise<boolean> {
  const limits = [
    { scope: "admin_login_ip", identifier: adminLoginIdentifier(headers, vercelRuntime), limit: ADMIN_LOGIN_IP_LIMIT },
    { scope: "admin_login_global", identifier: ADMIN_LOGIN_GLOBAL_IDENTIFIER, limit: ADMIN_LOGIN_GLOBAL_LIMIT },
  ];
  // A global ceiling also limits IP rotation. All attempts, including successful
  // ones, consume budget; no comparison or session issuance happens beforehand.
  for (const item of limits) {
    let response;
    try {
      response = await db.rpc("consume_api_rate_limit", {
        p_scope: item.scope, p_identifier: item.identifier,
        p_limit: item.limit, p_window_seconds: ADMIN_LOGIN_WINDOW_SECONDS,
      }).single();
    } catch {
      throw new Error("Admin sign-in temporarily unavailable.");
    }
    const row = response.data as { allowed?: unknown; hits?: unknown; retry_after_seconds?: unknown } | null;
    if (response.error || !row || typeof row.allowed !== "boolean"
      || !Number.isInteger(row.hits) || Number(row.hits) < 1 || Number(row.hits) > item.limit + 1
      || !Number.isInteger(row.retry_after_seconds) || Number(row.retry_after_seconds) < 0
      || Number(row.retry_after_seconds) > ADMIN_LOGIN_WINDOW_SECONDS
      || (row.allowed && row.retry_after_seconds !== 0)
      || (!row.allowed && Number(row.retry_after_seconds) < 1)) {
      throw new Error("Admin sign-in temporarily unavailable.");
    }
    if (!row.allowed) return false;
  }
  return true;
}
