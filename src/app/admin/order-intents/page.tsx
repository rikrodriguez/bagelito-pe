import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  allowedReviewTransitions,
  INTENT_REVIEW_STATUSES,
  type IntentReviewStatus,
} from "@/lib/order-intents/review-state";
import { updateOrderIntentReview } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type IntentRow = {
  id: string; customer_name: string; email: string; whatsapp: string;
  district: string; delivery_address: string | null; notes: string;
  items: unknown; status: string; created_at: string;
  quote_status: string; payment_status: string; review_note?: string | null;
};
const statusNames: Record<IntentReviewStatus, string> = {
  awaiting_human_review: "Por revisar",
  reviewing: "En revisión",
  approved_for_followup: "Listo para seguimiento",
  rejected: "Descartada",
  expired: "Vencida",
};
function formatItems(value: unknown) {
  if (!Array.isArray(value)) return "Productos por verificar";
  return value.map((line: unknown) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) return "Producto no reconocido";
    const item = line as { sku?: unknown; quantity?: unknown; flavors?: unknown };
    const sku = typeof item.sku === "string" ? item.sku : "Producto sin código";
    const qty = typeof item.quantity === "number" ? item.quantity : 1;
    const mix = Array.isArray(item.flavors)
      ? item.flavors.map((f: unknown) => {
          if (!f || typeof f !== "object") return "";
          const x = f as { flavor?: unknown; quantity?: unknown };
          return `${String(x.flavor ?? "")} × ${String(x.quantity ?? "")}`;
        }).filter(Boolean).join(", ")
      : "";
    return `${qty} × ${sku}${mix ? ` (${mix})` : ""}`;
  }).join(" · ");
}

export default async function OrderIntentReviewQueue({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; updated?: string }>;
}) {
  await requireAdmin();
  const enabled = process.env.BAGELITO_ORDER_INTENTS_ADMIN_ENABLED === "true";
  const params = await searchParams;
  const chosen = params?.status;
  const filter: IntentReviewStatus | "all" =
    chosen && INTENT_REVIEW_STATUSES.includes(chosen as IntentReviewStatus)
      ? chosen as IntentReviewStatus : "all";

  if (!enabled) {
    return (
      <main className="admin-page">
        <section className="admin-shell admin-card">
          <Link href="/admin">← Volver a operaciones</Link>
          <h1>Solicitudes para revisión humana</h1>
          <p>Vista no activada. La migración de Supabase, los permisos y las pruebas reales deben aprobarse antes de habilitarla.</p>
          <p>No se han activado cobros, confirmaciones ni mensajes automáticos.</p>
        </section>
      </main>
    );
  }

  const db = createSupabaseAdminClient();
  let intents: IntentRow[] = [];
  let unavailable = false;
  try {
    let query = db.from("order_intents")
      .select("id,customer_name,email,whatsapp,district,delivery_address,notes,items,status,created_at,quote_status,payment_status,review_note")
      .eq("store_id", "bagelito-01").eq("source", "web")
      .order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) unavailable = true;
    else intents = (data ?? []) as IntentRow[];
  } catch {
    unavailable = true;
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Link href="/admin">← Volver a operaciones</Link>
        <div className="admin-topbar">
          <div>
            <p className="kicker">Bagelito · Operaciones</p>
            <h1>Solicitudes para revisión humana</h1>
          </div>
        </div>
        <p>Estas solicitudes no son órdenes confirmadas. No implican stock reservado, precio final, entrega, pago ni mensaje al cliente.</p>
        {params?.updated === "1" ? <p className="admin-flash success">Estado de revisión actualizado.</p> : null}
        <nav aria-label="Filtrar solicitudes" className="admin-detail-actions">
          <Link href="/admin/order-intents">Todas</Link>
          {INTENT_REVIEW_STATUSES.map((status) => (
            <Link key={status} href={`/admin/order-intents?status=${status}`}>{statusNames[status]}</Link>
          ))}
        </nav>
        {unavailable ? <div className="admin-flash warning">La cola no está disponible. Verifica la migración y las credenciales del servidor.</div> : null}
        {!unavailable && intents.length === 0 ? <p>Sin solicitudes en esta vista.</p> : null}
        {!unavailable && intents.map((intent) => {
          const transitions = allowedReviewTransitions(intent.status);
          return (
            <article key={intent.id} className="admin-card" style={{ marginBlock: "1rem" }}>
              <header className="admin-card-head">
                <h2>{intent.customer_name}</h2>
                <span className="status-pill">{statusNames[intent.status as IntentReviewStatus] ?? "Revisión"}</span>
              </header>
              <p><strong>Contacto:</strong> {intent.whatsapp} · {intent.email}</p>
              <p><strong>Destino:</strong> {intent.district}{intent.delivery_address ? ` · ${intent.delivery_address}` : " · Dirección por confirmar"}</p>
              <p><strong>Selección:</strong> {formatItems(intent.items)}</p>
              {intent.notes ? <p><strong>Notas del cliente:</strong> {intent.notes}</p> : null}
              <p><small>Recibido: {new Date(intent.created_at).toLocaleString("es-PE", { timeZone: "America/Lima" })}</small></p>
              <p><strong>Pago:</strong> no solicitado · <strong>Cotización:</strong> pendiente de revisión</p>
              {transitions.length > 0 ? (
                <form action={updateOrderIntentReview}>
                  <input type="hidden" name="intentId" value={intent.id} />
                  <label>
                    Nota interna (máximo 500 caracteres)
                    <textarea name="reviewNote" defaultValue={intent.review_note ?? ""} maxLength={500} rows={2} />
                  </label>
                  <label>
                    Siguiente estado de revisión
                    <select name="nextStatus" defaultValue={transitions[0]}>
                      {transitions.map((next) => <option key={next} value={next}>{statusNames[next]}</option>)}
                    </select>
                  </label>
                  <button className="pill-button pink" type="submit">Guardar revisión</button>
                </form>
              ) : <p><small>Estado final. No se permiten más transiciones desde esta vista.</small></p>}
            </article>
          );
        })}
        <p><small>Hasta 100 solicitudes por consulta. Acceso restringido al administrador. Esta pantalla no envía mensajes ni inicia pagos.</small></p>
      </section>
    </main>
  );
}
