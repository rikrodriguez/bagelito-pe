import { requireAdmin } from "@/lib/admin/auth";
import { fetchComplaintsForAdmin } from "@/lib/complaints/service";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}

export async function GET() {
  await requireAdmin();
  const { complaints, schemaReady } = await fetchComplaintsForAdmin();

  if (!schemaReady) return new Response("Libro de Reclamaciones no configurado.", { status: 503 });

  const rows: unknown[][] = [[
    "Código", "Fecha", "Estado", "Tipo", "Consumidor", "Tipo documento", "Documento", "Domicilio",
    "Teléfono", "Email", "Menor", "Representante", "Documento representante", "Bien", "Monto",
    "Descripción", "Detalle", "Pedido", "Acciones del proveedor", "Fecha de respuesta", "Actualizado",
  ]];

  for (const complaint of complaints) {
    rows.push([
      complaint.complaint_code,
      complaint.created_at,
      complaint.status,
      complaint.request_type,
      complaint.consumer_name,
      complaint.document_type,
      complaint.document_number,
      complaint.consumer_address,
      complaint.phone,
      complaint.email,
      complaint.is_minor ? "sí" : "no",
      complaint.representative_name ?? "",
      complaint.representative_document ?? "",
      complaint.item_type,
      complaint.amount,
      complaint.item_description,
      complaint.detail,
      complaint.requested_action,
      complaint.provider_actions ?? "",
      complaint.responded_at ?? "",
      complaint.updated_at,
    ]);
  }

  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename=bagelito-libro-reclamaciones-${date}.csv`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
