"use client";

import { useState, useTransition } from "react";
import { runCulqiReadonlyDiagnostic } from "./actions";

export function CulqiReadonlyDiagnosticButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<boolean | null>(null);

  function run() {
    if (pending) return;
    startTransition(async () => {
      try {
        const response = await runCulqiReadonlyDiagnostic();
        setResult(response.ok === true);
      } catch {
        setResult(false);
      }
    });
  }

  // A hydrated button avoids an MPA form submit and rendering the dashboard
  // again. Its existing batch setup logic must not run as a diagnostic side effect.
  return (
    <div>
      <button type="button" onClick={run} disabled={pending}>
        {pending ? "Consultando diagnóstico Culqi…" : "Diagnóstico Culqi de solo lectura"}
      </button>
      {result !== null ? (
        <p role="status">
          {result
            ? "Consulta terminada. Revisa la evidencia parcial en los logs privados; esto no confirma pagos."
            : "No se pudo completar el diagnóstico. Revisa los controles y logs privados."}
        </p>
      ) : null}
    </div>
  );
}
