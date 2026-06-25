import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders, getDeliveryRoutePlan, type Order } from "@/lib/admin/queries";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function getFlavorText(order: Order) {
  if (!order.order_items?.length) return "No flavors captured";
  return order.order_items.map((item) => `${item.quantity} x ${item.flavor_name}`).join(" | ");
}

function getHandoffText(order: Order) {
  const notes = order.delivery_notes ?? "";
  if (notes.toLowerCase().includes("porteria") || notes.toLowerCase().includes("portería")) return "Front desk";
  return "Customer";
}

export async function GET() {
  await requireAdmin();
  const routePlan = getDeliveryRoutePlan(await fetchOrders());
  const rows = [
    [
      "Stop",
      "District",
      "Km from Lince",
      "Estimated delivery fee",
      "Delivered check",
      "Order code",
      "Status",
      "Customer",
      "WhatsApp",
      "Address",
      "Reference",
      "Handoff",
      "Delivery notes",
      "Pack",
      "Bagels",
      "Flavors",
      "Total paid",
    ],
  ];

  for (const stop of routePlan) {
    for (const order of stop.orders) {
      rows.push([
        String(stop.stopNumber),
        stop.district,
        stop.distanceKm.toFixed(1),
        `S/${stop.deliveryFee}`,
        order.status === "delivered" ? "DONE" : "[ ]",
        order.order_code,
        order.status,
        order.customer_name,
        order.whatsapp,
        order.delivery_address,
        order.address_reference ?? "",
        getHandoffText(order),
        order.delivery_notes ?? "",
        order.pack_name,
        String(order.pack_units),
        getFlavorText(order),
        `S/${Math.round(Number(order.total_amount))}`,
      ]);
    }
  }

  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename=bagelito-driver-route-${date}.csv`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
