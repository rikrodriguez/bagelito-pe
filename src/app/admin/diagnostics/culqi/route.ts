import { requireAdmin } from "@/lib/admin/auth";
import { culqiDiagnosticFormScope, culqiDiagnosticScope, diagnoseCulqiConfiguration } from "@/lib/payments/culqi-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vary": "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};

function reply(ok: boolean, status: number) {
  return Response.json({ ok }, { status, headers: noStoreHeaders });
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

export async function GET(request: Request) {
  try { await requireAdmin(); } catch { return reply(false, 401); }
  try {
    if (!Object.values(culqiDiagnosticFormScope(request, process.env)).every(Boolean)) return reply(false, 404);
    // Fixed HTML only. Do not inspect keys, the build snapshot or diagnostic results.
    return new Response(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Diagnóstico Culqi</title></head>
<body><main>
<h1>Diagnóstico Culqi</h1>
<p>Ejecuta la comprobación de configuración sandbox. Los resultados se registran en logs privados. No habilita pagos.</p>
<form method="post" action="https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/admin/diagnostics/culqi">
<button type="submit">Ejecutar diagnóstico</button>
</form>
<p><a href="/admin">Volver a administración</a></p>
</main></body></html>`, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        // no-referrer would make a normal form POST send Origin: null.
        "Referrer-Policy": "same-origin",
        "X-Frame-Options": "DENY",
        "Vary": "Cookie, Origin, Sec-Fetch-Site",
      },
    });
  } catch { return reply(false, 503); }
}
