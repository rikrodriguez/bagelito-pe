import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders, getDeliverySummary } from "@/lib/admin/queries";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  await requireAdmin();
  const groups = getDeliverySummary(await fetchOrders());
  const rows = [["District", "Orders", "Packs", "Bagels", "Customers", "WhatsApp", "Addresses", "Statuses"]];
  for (const group of groups) {
    rows.push([
      group.district,
      String(group.orders.length),
      String(group.packs),
      String(group.bagels),
      group.orders.map((order) => order.customer_name).join(" | "),
      group.orders.map((order) => order.whatsapp).join(" | "),
      group.orders.map((order) => order.delivery_address).join(" | "),
      group.orders.map((order) => order.status).join(" | "),
    ]);
  }
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bagelito-delivery.csv" } });
}
