import { requireAdmin } from "@/lib/admin/auth";
import { culqiDiagnosticScope, diagnoseCulqiConfiguration } from "@/lib/payments/culqi-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function reply(ok: boolean, status: number) {
  return Response.json({ ok }, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vercel-CDN-Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Vary": "Cookie, Origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // Replace auth redirects/errors with a constant, uncached response.
    return reply(false, 401);
  }

  try {
    const scope = culqiDiagnosticScope(request, process.env);
    if (!Object.values(scope).every(Boolean)) return reply(false, 404);

    // next.config always inlines this public snapshot, including empty build
    // values. Missing build values must never fall back to runtime credentials.
    const bundled = JSON.parse(process.env.CULQI_DIAGNOSTIC_BUILD_PUBLIC_CONFIG ?? "{}");
    const checks = diagnoseCulqiConfiguration(process.env, bundled);
    console.info("culqi_configuration_diagnostic", { ...scope, ...checks, diagnosticCompleted: true });
    // Results stay in private hosting runtime logs, never in HTTP responses.
    return reply(true, 200);
  } catch {
    // No raw exceptions, values, identifiers, fingerprints or personal data.
    return reply(false, 503);
  }
}

export async function GET() {
  try { await requireAdmin(); } catch { return reply(false, 401); }
  return reply(false, 405);
}
