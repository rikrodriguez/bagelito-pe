import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders, getProductionSummary } from "@/lib/admin/queries";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin();
  const rows = [["Flavor", "Units"], ...getProductionSummary(await fetchOrders()).map((item) => [item.flavorName, String(item.quantity)])];
  const body = rows.map((row) => row.join(",")).join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bagelito-production.csv" } });
}
