import { requireAdmin } from "@/lib/admin/auth";
import { fetchCurrentBatch, fetchOrders, getProductionOpsPlan } from "@/lib/admin/queries";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  await requireAdmin();
  const [batch, orders] = await Promise.all([fetchCurrentBatch(), fetchOrders()]);
  const plan = getProductionOpsPlan(batch, orders);
  const rows = [
    ["Section", "Item", "Packs", "Bagels", "Orders", "Details"],
    ["Batch", plan.batchName, String(plan.totalPacks), String(plan.totalBagels), String(plan.orders.length), plan.deliveryDate ?? ""],
    ...plan.packingList.map((item) => [
      "Flavor",
      item.flavorName,
      "",
      String(item.quantity),
      [...new Set(item.orderCodes)].join(" | "),
      [...new Set(item.customers)].join(" | "),
    ]),
    ...plan.packList.map((item) => [
      "Pack",
      item.packName,
      String(item.packs),
      String(item.bagels),
      item.orderCodes.join(" | "),
      "",
    ]),
    ...plan.stages.map((stage) => [
      "Checklist",
      stage.label,
      String(stage.packs),
      String(stage.bagels),
      stage.orders.map((order) => order.order_code).join(" | "),
      stage.description,
    ]),
  ];
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename=bagelito-production-${date}.csv`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
