import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrderByCode } from "@/lib/admin/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ orderCode: string }> }) {
  await requireAdmin();
  const { orderCode } = await params;
  const order = await fetchOrderByCode(orderCode);

  if (!order) return new Response("Order not found", { status: 404 });
  if (!order.payment_screenshot_path || order.payment_screenshot_path.startsWith("payment-pending/")) {
    return new Response("No payment proof uploaded yet.", { status: 404 });
  }

  const { data, error } = await createSupabaseAdminClient().storage.from("payment-proofs").createSignedUrl(order.payment_screenshot_path, 120);
  if (error || !data?.signedUrl) return new Response("Could not generate signed screenshot URL", { status: 500 });

  redirect(data.signedUrl);
}
