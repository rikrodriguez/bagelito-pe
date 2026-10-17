"use client";

import { startTransition, useActionState } from "react";
import { runCulqiExistingOrderStatus, type CulqiAdminStatusResult } from "./culqi-status-actions";

function statusMessage(result: CulqiAdminStatusResult | null): string | null {
  if (result === null) return null;
  if (result.ok !== true) return "No se pudo consultar el estado Culqi. Inténtalo de nuevo.";

  const review = result.reconciliationRequired === true || result.recoveryState === "review_required";
  if (result.paymentStatus === "paid") {
    if (result.orderStatus === "cancelled") {
      return review
        ? "Pago registrado; reserva cancelada y en revisión"
        : "Pago registrado; reserva cancelada.";
    }
    return review ? "Pago registrado; requiere revisión." : "Pago registrado.";
  }
  if (review) return "El pago requiere revisión.";
  if (result.recoveryState === "deferred") return "Consulta diferida; vuelve a intentarlo en unos segundos.";
  if (result.recoveryState === "unavailable") return "No se pudo completar la consulta Culqi. Inténtalo de nuevo.";

  switch (result.paymentStatus) {
    case "pending": return "Pago pendiente.";
    case "failed": return "Pago fallido.";
    case "expired": return "Pago vencido.";
    case "refunded": return "Pago reembolsado.";
    default: return "Consulta terminada; estado del pago no disponible.";
  }
}

export function CulqiExistingStatusButton({ orderCode }: { orderCode: string }) {
  const [result, dispatch, pending] = useActionState<CulqiAdminStatusResult | null, { orderCode: string }>(
    runCulqiExistingOrderStatus,
    null,
  );
  const message = statusMessage(result);

  function run() {
    if (pending) return;
    startTransition(() => dispatch({ orderCode }));
  }

  return (
    <div>
      <button className="pill-button pink" type="button" onClick={run} disabled={pending}>
        {pending ? "Consultando estado Culqi…" : "Consultar estado Culqi"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
