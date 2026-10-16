import {
  createCulqiChargeReconciliation,
  type CulqiChargeReconciliationDependencies,
} from "./culqi-charge-reconciliation";
import type { CulqiReadonlyDiagnosticRequest } from "./culqi-readonly-diagnostic";

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;

export type CulqiReconciliationHttpDependencies = Omit<
  CulqiChargeReconciliationDependencies, "requireAdmin" | "verifyActionCsrf"
> & {
  requireAdmin(request: Request): Promise<void>;
  verifyActionCsrf(request: Request): boolean | Promise<boolean>;
};

function reply(ok: boolean, status: number): Response {
  return Response.json({ ok }, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie, Origin",
      ...(status === 405 ? { Allow: "POST" } : {}),
    },
  });
}

function describe(request: Request): CulqiReadonlyDiagnosticRequest | null {
  const url = new URL(request.url);
  if (url.origin !== ORIGIN || url.username || url.password) return null;
  const descriptor: CulqiReadonlyDiagnosticRequest = {
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    referer: request.headers.get("referer"),
    fetchSite: request.headers.get("sec-fetch-site"),
  };
  const protocol = request.headers.get("x-forwarded-proto");
  if (descriptor.origin !== ORIGIN || descriptor.host !== HOST
    || (descriptor.forwardedHost != null && descriptor.forwardedHost !== HOST)
    || (protocol != null && protocol !== "https")
    || (descriptor.fetchSite != null && descriptor.fetchSite !== "same-origin")) return null;
  if (descriptor.referer != null) {
    try {
      const referer = new URL(descriptor.referer);
      if (referer.origin !== ORIGIN || referer.username || referer.password) return null;
    } catch { return null; }
  }
  return descriptor;
}

// Unwired factory: this file exports no route or Server Action, creates no DB
// client and reads no environment. Injected auth/CSRF must verify the actual
// request. The engine's independent application approval remains closed.
export function createCulqiReconciliationHttpHandler(dependencies: CulqiReconciliationHttpDependencies) {
  return async function handle(rawRequest: Request): Promise<Response> {
    try {
      await dependencies.requireAdmin(rawRequest);
    } catch {
      // No headers, configuration, diagnostic logger or provider work on denial.
      return reply(false, 401);
    }
    try {
      if (rawRequest.method !== "POST") return reply(false, 405);
      const request = describe(rawRequest);
      if (!request) return reply(false, 403);

      const run = createCulqiChargeReconciliation({
        // Auth succeeded above before any descriptor or configuration access.
        requireAdmin: async () => {},
        // Never approve CSRF from a caller-supplied descriptor or body.
        verifyActionCsrf: () => dependencies.verifyActionCsrf(rawRequest),
        readConfig: dependencies.readConfig,
        readPersistedOrder: dependencies.readPersistedOrder,
        fetch: dependencies.fetch,
        applyVerifiedCharge: dependencies.applyVerifiedCharge,
        safeLog: dependencies.safeLog,
        now: dependencies.now,
      });
      const report = await run(request);
      if (report.stage === "csrf" || report.stage === "origin") return reply(false, 403);
      // ok indicates a completed evidence inspection, never an applied payment.
      return reply(report.ok === true, report.ok === true ? 200 : 503);
    } catch {
      return reply(false, 503);
    }
  };
}
