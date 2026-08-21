import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Clock3, Download, Mail, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fetchComplaintsForAdmin, type ComplaintRecord } from "@/lib/complaints/service";
import { updateComplaint } from "./actions";

const statusLabels: Record<ComplaintRecord["status"], string> = {
  closed: "Cerrado",
  in_review: "En revisión",
  received: "Recibido",
  responded: "Respondido",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}
function requestTypeLabel(value: ComplaintRecord["request_type"]) {
  return value === "reclamo" ? "Reclamo" : "Queja";
}

export default async function ComplaintsAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; updated?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const { complaints, schemaReady } = await fetchComplaintsForAdmin();
  const pending = complaints.filter((complaint) => complaint.status === "received" || complaint.status === "in_review").length;
  const responded = complaints.filter((complaint) => complaint.status === "responded" || complaint.status === "closed").length;

  return (
    <main className="admin-page complaints-admin-page">
      <section className="admin-shell crm-shell">
        <div className="admin-topbar complaints-admin-topbar">
          <div>
            <p className="kicker">Atención al consumidor</p>
            <h1>Libro de Reclamaciones</h1>
            <p className="admin-intro">Registro privado de hojas, seguimiento y acciones adoptadas por Bagelito.pe.</p>
          </div>
          <div className="admin-export-row">
            <Link href="/admin"><ArrowLeft size={16} /> Volver al dashboard</Link>
            <a href="/admin/export/complaints"><Download size={16} /> Exportar CSV</a>
          </div>
        </div>

        {!schemaReady ? (
          <section className="admin-card complaints-setup-card">
            <ShieldCheck size={30} />
            <div>
              <h2>Falta activar el almacenamiento</h2>
              <p>Ejecuta <code>supabase/add-consumer-complaints.sql</code> en Supabase antes de publicar el formulario.</p>
            </div>
          </section>
        ) : (
          <>
            <div className="complaints-stat-grid">
              <div className="stat-card"><span>Total</span><strong>{complaints.length}</strong><small>Hojas registradas</small></div>
              <div className="stat-card"><span>Pendientes</span><strong>{pending}</strong><small>Requieren atención</small></div>
              <div className="stat-card"><span>Respondidos</span><strong>{responded}</strong><small>Con respuesta o cierre</small></div>
            </div>

            {params?.updated ? <div className="admin-flash success">La gestión interna quedó actualizada.</div> : null}
            {params?.error ? <div className="admin-flash warning">{params.error}</div> : null}

            <section className="admin-safety-card complaints-deadline-card">
              <div>
                <span><Clock3 size={17} /> Plazo legal</span>
                <strong>Responder por escrito en un máximo de 15 días hábiles.</strong>
                <p>Conserva el correo enviado o su constancia de entrega. Cambiar el estado aquí no envía ninguna comunicación.</p>
              </div>
            </section>

            <div className="complaints-admin-list">
              {complaints.length ? complaints.map((complaint) => (
                <article className="admin-card complaint-admin-card" key={complaint.id}>
                  <div className="complaint-admin-heading">
                    <div>
                      <span className={`complaint-status complaint-status-${complaint.status}`}>{statusLabels[complaint.status]}</span>
                      <h2>{complaint.complaint_code}</h2>
                      <p>{requestTypeLabel(complaint.request_type)} · {formatDate(complaint.created_at)}</p>
                    </div>
                    <a className="pill-button outline" href={`mailto:${complaint.email}?subject=${encodeURIComponent(`${complaint.complaint_code} - Respuesta de Bagelito.pe`)}`}>
                      <Mail size={16} /> Responder por email
                    </a>
                  </div>

                  <div className="complaint-admin-grid">
                    <div><span>Consumidor</span><strong>{complaint.consumer_name}</strong><small>{complaint.document_type} {complaint.document_number}</small></div>
                    <div><span>Contacto</span><strong>{complaint.email}</strong><small>{complaint.phone}</small></div>
                    <div><span>Bien contratado</span><strong>{complaint.item_type === "product" ? "Producto" : "Servicio"} · S/{Number(complaint.amount).toFixed(2)}</strong><small>{complaint.item_description}</small></div>
                  </div>

                  <details className="complaint-admin-detail" open>
                    <summary><BookOpenCheck size={17} /> Ver detalle y pedido</summary>
                    <div>
                      <section><span>Detalle</span><p>{complaint.detail}</p></section>
                      <section><span>Pedido del consumidor</span><p>{complaint.requested_action}</p></section>
                      <section><span>Domicilio</span><p>{complaint.consumer_address}</p></section>
                      {complaint.is_minor ? (
                        <section><span>Representante</span><p>{complaint.representative_name} · {complaint.representative_document}</p></section>
                      ) : null}
                    </div>
                  </details>

                  <form action={updateComplaint} className="complaint-admin-form">
                    <input name="complaintId" type="hidden" value={complaint.id} />
                    <label>
                      Estado
                      <select defaultValue={complaint.status} name="status">
                        <option value="received">Recibido</option>
                        <option value="in_review">En revisión</option>
                        <option value="responded">Respondido</option>
                        <option value="closed">Cerrado</option>
                      </select>
                    </label>
                    <label className="wide">
                      Acciones u observaciones del proveedor
                      <textarea defaultValue={complaint.provider_actions ?? ""} maxLength={4000} name="providerActions" placeholder="Resume la respuesta enviada, solución ofrecida y fecha de comunicación." rows={4} />
                    </label>
                    <p><ShieldCheck size={15} /> Registro interno: guarda aquí después de enviar la respuesta por email.</p>
                    <button className="pill-button pink" type="submit">Guardar gestión</button>
                  </form>
                </article>
              )) : (
                <section className="admin-card complaints-empty-card">
                  <BookOpenCheck size={34} />
                  <h2>Aún no hay hojas registradas</h2>
                  <p>Los reclamos y quejas aparecerán aquí inmediatamente después de su envío.</p>
                </section>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
