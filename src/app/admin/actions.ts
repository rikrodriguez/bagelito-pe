"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminToken, getAdminCookieName, requireAdmin, verifyAdminPassword } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasUploadedPaymentProof } from "@/lib/admin/queries";

const allowedOrderStatuses = [
  "payment_pending_review",
  "payment_confirmed",
  "needs_correction",
  "in_production",
  "ready_for_delivery",
  "delivered",
  "cancelled",
] as const;

function parseOrderStatus(status: string) {
  if (!allowedOrderStatuses.includes(status as (typeof allowedOrderStatuses)[number])) {
    throw new Error("Invalid order status");
  }

  return status;
}

async function setOrderStatus(orderId: string, status: string) {
  const nextStatus = parseOrderStatus(status);
  const supabase = createSupabaseAdminClient();

  const { data: current, error: readError } = await supabase.from("orders").select("status").eq("id", orderId).single();
  if (readError) throw new Error(readError.message);

  const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
  if (error) throw new Error(error.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    old_status: (current as { status?: string } | null)?.status ?? null,
    new_status: nextStatus,
    changed_by: "admin",
  });
}

export async function loginAdmin(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!process.env.ADMIN_PASSWORD) redirect("/admin/login?error=missing-password");
  if (!verifyAdminPassword(password)) redirect("/admin/login?error=invalid");

  const cookieStore = await cookies();
  cookieStore.set(getAdminCookieName(), createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 8,
  });

  redirect("/admin");
}

export async function updateOrderStatus(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const status = String(formData.get("status") ?? "");

  await setOrderStatus(orderId, status);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect(`/admin/orders/${orderCode}`);
}

export async function quickUpdateOrderStatus(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const status = String(formData.get("status") ?? "");

  await setOrderStatus(orderId, status);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect("/admin");
}

export async function updateAdminNote(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const adminNotes = String(formData.get("adminNotes") ?? "");

  const { error } = await createSupabaseAdminClient().from("orders").update({ admin_notes: adminNotes }).eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect(`/admin/orders/${orderCode}`);
}

export async function deleteOrder(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");

  if (!orderId) throw new Error("Missing order ID");

  const supabase = createSupabaseAdminClient();
  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("id, order_code, payment_screenshot_path")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!order) {
    revalidatePath("/admin");
    redirect("/admin?deleted=missing");
  }

  if (orderCode && order.order_code !== orderCode) {
    throw new Error("Order mismatch. Refresh the admin page and try again.");
  }

  if (hasUploadedPaymentProof(order)) {
    const { error: storageError } = await supabase.storage.from("payment-proofs").remove([order.payment_screenshot_path]);
    if (storageError) throw new Error("Could not delete payment proof: " + storageError.message);
  }

  const { error: deleteError } = await supabase.from("orders").delete().eq("id", order.id);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order.order_code}`);
  redirect(`/admin?deleted=${encodeURIComponent(order.order_code)}`);
}
