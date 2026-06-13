import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders } from "@/lib/admin/queries";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  await requireAdmin();
  const orders = await fetchOrders();
  const rows = [["Order", "Date", "Customer", "WhatsApp", "Email", "Marketing opt-in", "Pack", "Total", "District", "Status", "Payment", "Transaction"]];
  for (const order of orders) {
    rows.push([order.order_code, order.created_at, order.customer_name, order.whatsapp, order.email, order.marketing_opt_in ? "yes" : "no", order.pack_name, String(order.total_amount), order.district, order.status, order.payment_method, order.payment_transaction_number]);
  }
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bagelito-orders.csv" } });
}
