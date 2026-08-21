import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders, getOrderArchiveState } from "@/lib/admin/queries";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export async function GET() {
  await requireAdmin();
  const orders = await fetchOrders();
  const rows = [
    [
      "Order ID",
      "Order code",
      "Created at",
      "Updated at",
      "Status",
      "Archive state",
      "Archived at",
      "Archived by",
      "Customer",
      "WhatsApp",
      "Email",
      "Marketing opt-in",
      "Pack slug",
      "Pack",
      "Pack units",
      "Pack type",
      "Total",
      "Delivery address",
      "District",
      "Address reference",
      "Delivery notes",
      "Payment method",
      "Payment transaction",
      "Payment holder",
      "Payment phone",
      "Payment screenshot path",
      "Payment provider",
      "Payment status",
      "Culqi order ID",
      "Culqi charge ID",
      "Payment paid at",
      "Payment expires at",
      "Payment failure code",
      "Payment failure message",
      "Admin notes",
      "Order items JSON",
      "Status history JSON",
    ],
  ];

  for (const order of orders) {
    const archiveState = getOrderArchiveState(order);
    const orderItems = [...(order.order_items ?? [])]
      .sort((a, b) => a.flavor_name.localeCompare(b.flavor_name))
      .map((item) => ({
        id: item.id,
        flavor_slug: item.flavor_slug,
        flavor_name: item.flavor_name,
        quantity: item.quantity,
      }));
    const statusHistory = [...(order.order_status_history ?? [])]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((item) => ({
        id: item.id,
        old_status: item.old_status,
        new_status: item.new_status,
        changed_by: item.changed_by,
        created_at: item.created_at,
      }));

    rows.push([
      order.id,
      order.order_code,
      order.created_at,
      order.updated_at,
      order.status,
      archiveState.isArchived ? "archived" : "active",
      archiveState.archivedAt ?? "",
      archiveState.archivedBy ?? "",
      order.customer_name,
      order.whatsapp,
      order.email,
      order.marketing_opt_in ? "yes" : "no",
      order.pack_slug,
      order.pack_name,
      String(order.pack_units),
      order.pack_type,
      String(order.total_amount),
      order.delivery_address,
      order.district,
      order.address_reference ?? "",
      order.delivery_notes ?? "",
      order.payment_method ?? "",
      order.payment_transaction_number ?? "",
      order.payment_holder_name ?? "",
      order.payment_phone_number ?? "",
      order.payment_screenshot_path ?? "",
      order.payment_provider ?? "manual",
      order.payment_status ?? "",
      order.payment_order_id ?? "",
      order.payment_charge_id ?? "",
      order.payment_paid_at ?? "",
      order.payment_expires_at ?? "",
      order.payment_failure_code ?? "",
      order.payment_failure_message ?? "",
      order.admin_notes ?? "",
      compactJson(orderItems),
      compactJson(statusHistory),
    ]);
  }
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=bagelito-orders-backup-${date}.csv` } });
}
