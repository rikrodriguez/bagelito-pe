"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminToken, getAdminCookieName, requireAdmin, verifyAdminPassword } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { batchStatuses, defaultFinancialCosts, hasUploadedPaymentProof } from "@/lib/admin/queries";
import { canSendAdminWhatsAppIntent, getAdminWhatsAppIntentForStatus, getAdminWhatsAppSentStatus, parseAdminWhatsAppIntent } from "@/lib/admin/whatsapp-messages";
import { getDurationMs, logError, logInfo, logWarn } from "@/lib/monitoring";

const allowedOrderStatuses = [
  "payment_pending_review",
  "payment_confirmed",
  "needs_correction",
  "in_production",
  "ready_for_delivery",
  "delivered",
  "cancelled",
] as const;

function parseBatchStatus(status: string) {
  if (!batchStatuses.includes(status as (typeof batchStatuses)[number])) {
    throw new Error("Invalid batch status");
  }

  return status;
}

function parseOrderStatus(status: string) {
  if (!allowedOrderStatuses.includes(status as (typeof allowedOrderStatuses)[number])) {
    throw new Error("Invalid order status");
  }

  return status;
}

function parseNullableInteger(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0) throw new Error("Batch capacity must be a positive whole number.");
  if (number === 0) return null;
  return number;
}

function parseMoneyInput(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a positive amount.`);
  return Math.round(number * 100) / 100;
}

function parseLimaDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.length === 16 ? `${text}:00-05:00` : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid batch date.");
  return date.toISOString();
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

function getSafeAdminReturnTo(formData: FormData, fallback: string) {
  const returnTo = String(formData.get("returnTo") ?? "");
  const isAdminPath = returnTo === "/admin" || returnTo.startsWith("/admin/") || returnTo.startsWith("/admin?");
  return isAdminPath ? returnTo : fallback;
}

function getWhatsAppStatusQuery(status: string, orderCode: string) {
  const intent = getAdminWhatsAppIntentForStatus(status);
  if (!intent) return "";

  return `?whatsapp=${encodeURIComponent(intent)}&order=${encodeURIComponent(orderCode)}`;
}

function appendAdminQuery(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function appendAdminQueryString(path: string, query: string) {
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query.replace(/^\?/, "")}`;
}

async function readOrderForAdminMutation(orderId: string, orderCode: string) {
  if (!orderId) throw new Error("Missing order ID");

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_code, status, payment_screenshot_path, order_status_history(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  if (orderCode && order.order_code !== orderCode) {
    throw new Error("Order mismatch. Refresh the admin page and try again.");
  }

  return { supabase, order };
}

async function setOrderArchiveState(formData: FormData, archived: boolean) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const fallback = archived ? `/admin?archived=${encodeURIComponent(orderCode)}` : `/admin?restored=${encodeURIComponent(orderCode)}`;
  const returnTo = getSafeAdminReturnTo(formData, fallback);
  const action = archived ? "archive" : "restore";

  logInfo("admin_order_archive_start", { action, orderCode });

  const result = await readOrderForAdminMutation(orderId, orderCode);
  if (!result) {
    logWarn("admin_order_archive_missing", { action, durationMs: getDurationMs(startedAt), orderCode });
    revalidatePath("/admin");
    redirect("/admin?deleted=missing");
  }

  const { supabase, order } = result;
  try {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: order.id,
      old_status: order.status,
      new_status: archived ? "archived" : "unarchived",
      changed_by: archived ? "admin archive" : "admin restore",
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_order_archive_failed", error, {
      action,
      durationMs: getDurationMs(startedAt),
      orderCode: order.order_code,
    });
    throw error;
  }

  logInfo("admin_order_archive_success", {
    action,
    durationMs: getDurationMs(startedAt),
    orderCode: order.order_code,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order.order_code}`);
  redirect(returnTo);
}

export async function loginAdmin(formData: FormData) {
  const startedAt = Date.now();
  const password = String(formData.get("password") ?? "");

  if (!process.env.ADMIN_PASSWORD) {
    logError("admin_login_missing_password_env", new Error("ADMIN_PASSWORD is not configured"), {
      durationMs: getDurationMs(startedAt),
    });
    redirect("/admin/login?error=missing-password");
  }

  if (!verifyAdminPassword(password)) {
    logWarn("admin_login_invalid", { durationMs: getDurationMs(startedAt) });
    redirect("/admin/login?error=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set(getAdminCookieName(), createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 8,
  });

  logInfo("admin_login_success", { durationMs: getDurationMs(startedAt) });
  redirect("/admin");
}

export async function updateOrderStatus(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const status = String(formData.get("status") ?? "");

  logInfo("admin_order_status_start", { orderCode, status, source: "detail" });
  try {
    await setOrderStatus(orderId, status);
  } catch (error) {
    logError("admin_order_status_failed", error, {
      durationMs: getDurationMs(startedAt),
      orderCode,
      source: "detail",
      status,
    });
    throw error;
  }

  logInfo("admin_order_status_success", {
    durationMs: getDurationMs(startedAt),
    orderCode,
    source: "detail",
    status,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect(`/admin/orders/${orderCode}${getWhatsAppStatusQuery(status, orderCode)}`);
}

export async function quickUpdateOrderStatus(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const status = String(formData.get("status") ?? "");
  const returnTo = getSafeAdminReturnTo(formData, "/admin");

  logInfo("admin_order_status_start", { orderCode, status, source: "quick" });
  try {
    await setOrderStatus(orderId, status);
  } catch (error) {
    logError("admin_order_status_failed", error, {
      durationMs: getDurationMs(startedAt),
      orderCode,
      source: "quick",
      status,
    });
    throw error;
  }

  logInfo("admin_order_status_success", {
    durationMs: getDurationMs(startedAt),
    orderCode,
    source: "quick",
    status,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect(appendAdminQueryString(returnTo, getWhatsAppStatusQuery(status, orderCode)));
}

export async function archiveOrder(formData: FormData) {
  await setOrderArchiveState(formData, true);
}

export async function restoreOrder(formData: FormData) {
  await setOrderArchiveState(formData, false);
}

export async function updateAdminNote(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const adminNotes = String(formData.get("adminNotes") ?? "");

  logInfo("admin_note_update_start", { orderCode });
  try {
    const { error } = await createSupabaseAdminClient().from("orders").update({ admin_notes: adminNotes }).eq("id", orderId);
    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_note_update_failed", error, { durationMs: getDurationMs(startedAt), orderCode });
    throw error;
  }

  logInfo("admin_note_update_success", {
    durationMs: getDurationMs(startedAt),
    hasNote: Boolean(adminNotes.trim()),
    orderCode,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderCode}`);
  redirect(`/admin/orders/${orderCode}`);
}

export async function updateBatchSettings(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const batchId = String(formData.get("batchId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Next Bagelito Batch";
  const status = parseBatchStatus(String(formData.get("status") ?? ""));
  const capacityPacks = parseNullableInteger(formData.get("capacityPacks"));
  const capacityBagels = parseNullableInteger(formData.get("capacityBagels"));
  const ordersCloseAt = parseLimaDateTime(formData.get("ordersCloseAt"));
  const deliveryDate = parseLimaDateTime(formData.get("deliveryDate"));
  const statusAcceptsOrders = status === "waitlist_open" || status === "orders_open";
  const nextOrdersCloseAt = statusAcceptsOrders && ordersCloseAt && new Date(ordersCloseAt).getTime() <= Date.now()
    ? null
    : ordersCloseAt;

  if (!batchId) throw new Error("Missing batch ID");

  const supabase = createSupabaseAdminClient();
  logInfo("admin_batch_update_start", {
    batchId,
    capacityBagels: capacityBagels ?? null,
    capacityPacks: capacityPacks ?? null,
    status,
  });

  try {
    const { data: existing, error: readError } = await supabase
      .from("batches")
      .select("orders_open_at")
      .eq("id", batchId)
      .single();

    if (readError) throw new Error(readError.message);

    const update: {
      capacity_bagels: number | null;
      capacity_packs: number | null;
      delivery_date: string | null;
      name: string;
      orders_close_at: string | null;
      orders_open_at?: string;
      status: string;
    } = {
      capacity_bagels: capacityBagels,
      capacity_packs: capacityPacks,
      delivery_date: deliveryDate,
      name,
      orders_close_at: status === "closed" && !nextOrdersCloseAt ? new Date().toISOString() : nextOrdersCloseAt,
      status,
    };

    if (status === "orders_open" && !(existing as { orders_open_at?: string | null } | null)?.orders_open_at) {
      update.orders_open_at = new Date().toISOString();
    }

    const { error } = await supabase.from("batches").update(update).eq("id", batchId);
    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_batch_update_failed", error, {
      batchId,
      durationMs: getDurationMs(startedAt),
      status,
    });
    throw error;
  }

  logInfo("admin_batch_update_success", {
    batchId,
    durationMs: getDurationMs(startedAt),
    status,
  });
  revalidatePath("/");
  revalidatePath("/reserve");
  revalidatePath("/admin");
  redirect("/admin?section=batch&batch=updated");
}

export async function updateBatchFinancialCosts(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) throw new Error("Missing batch ID");

  const ingredientCostPerBagel = parseMoneyInput(formData.get("ingredientCostPerBagel"), "Ingredient cost");
  const packagingCostPerPack = parseMoneyInput(formData.get("packagingCostPerPack"), "Packaging cost");
  const actualDeliveryCost = parseMoneyInput(formData.get("actualDeliveryCost"), "Delivery cost");
  const otherBatchCost = parseMoneyInput(formData.get("otherBatchCost"), "Other batch cost");

  logInfo("admin_finance_costs_update_start", {
    actualDeliveryCost,
    batchId,
    ingredientCostPerBagel,
    packagingCostPerPack,
  });

  try {
    const { error } = await createSupabaseAdminClient()
      .from("batches")
      .update({
        actual_delivery_cost: actualDeliveryCost,
        ingredient_cost_per_bagel: ingredientCostPerBagel || defaultFinancialCosts.ingredientCostPerBagel,
        other_batch_cost: otherBatchCost,
        packaging_cost_per_pack: packagingCostPerPack || defaultFinancialCosts.packagingCostPerPack,
      })
      .eq("id", batchId);

    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_finance_costs_update_failed", error, {
      batchId,
      durationMs: getDurationMs(startedAt),
    });
    throw error;
  }

  logInfo("admin_finance_costs_update_success", {
    batchId,
    durationMs: getDurationMs(startedAt),
  });
  revalidatePath("/admin");
  redirect("/admin?section=finance&finance=updated");
}

export async function markWhatsAppMessageSent(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const intent = parseAdminWhatsAppIntent(String(formData.get("intent") ?? ""));
  const returnTo = getSafeAdminReturnTo(formData, "/admin");

  if (!intent) throw new Error("Invalid WhatsApp message intent");

  logInfo("admin_whatsapp_log_start", { intent, orderCode });
  const result = await readOrderForAdminMutation(orderId, orderCode);
  if (!result) {
    logWarn("admin_whatsapp_log_missing", { durationMs: getDurationMs(startedAt), intent, orderCode });
    revalidatePath("/admin");
    redirect("/admin?deleted=missing");
  }

  const { supabase, order } = result;
  if (!canSendAdminWhatsAppIntent(order, intent)) {
    logWarn("admin_whatsapp_log_blocked", {
      durationMs: getDurationMs(startedAt),
      intent,
      orderCode: order.order_code,
      status: order.status,
    });
    const errorReturnTo = returnTo.startsWith("/admin/orders/") ? `/admin/orders/${order.order_code}` : "/admin";
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${order.order_code}`);
    redirect(appendAdminQuery(errorReturnTo, "whatsappError", "status"));
  }

  const sentStatus = getAdminWhatsAppSentStatus(intent);
  let existing: { id?: string } | null = null;

  try {
    const { data, error: existingError } = await supabase
      .from("order_status_history")
      .select("id")
      .eq("order_id", order.id)
      .eq("new_status", sentStatus)
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    existing = data;
  } catch (error) {
    logError("admin_whatsapp_log_failed", error, {
      durationMs: getDurationMs(startedAt),
      intent,
      orderCode: order.order_code,
      stage: "read_existing",
    });
    throw error;
  }

  if (existing) {
    logInfo("admin_whatsapp_log_duplicate", {
      durationMs: getDurationMs(startedAt),
      intent,
      orderCode: order.order_code,
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${order.order_code}`);
    redirect(returnTo);
  }

  try {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: order.id,
      old_status: order.status,
      new_status: sentStatus,
      changed_by: "admin whatsapp",
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_whatsapp_log_failed", error, {
      durationMs: getDurationMs(startedAt),
      intent,
      orderCode: order.order_code,
      stage: "insert_history",
    });
    throw error;
  }

  logInfo("admin_whatsapp_log_success", {
    durationMs: getDurationMs(startedAt),
    intent,
    orderCode: order.order_code,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order.order_code}`);
  redirect(returnTo);
}

export async function deleteOrder(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const orderCode = String(formData.get("orderCode") ?? "");
  const confirmOrderCode = String(formData.get("confirmOrderCode") ?? "");

  if (!orderId) throw new Error("Missing order ID");

  logWarn("admin_order_delete_start", { orderCode });
  const result = await readOrderForAdminMutation(orderId, orderCode);
  if (!result) {
    logWarn("admin_order_delete_missing", { durationMs: getDurationMs(startedAt), orderCode });
    revalidatePath("/admin");
    redirect("/admin?deleted=missing");
  }

  const { supabase, order } = result;
  if (confirmOrderCode !== order.order_code) {
    logWarn("admin_order_delete_confirmation_failed", {
      durationMs: getDurationMs(startedAt),
      orderCode: order.order_code,
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${order.order_code}`);
    redirect(`/admin/orders/${order.order_code}?deleteError=confirmation`);
  }

  try {
    if (hasUploadedPaymentProof(order)) {
      const { error: storageError } = await supabase.storage.from("payment-proofs").remove([order.payment_screenshot_path]);
      if (storageError) throw new Error("Could not delete payment proof: " + storageError.message);
    }

    const { error: deleteError } = await supabase.from("orders").delete().eq("id", order.id);
    if (deleteError) throw new Error(deleteError.message);
  } catch (error) {
    logError("admin_order_delete_failed", error, {
      durationMs: getDurationMs(startedAt),
      hasPaymentProof: hasUploadedPaymentProof(order),
      orderCode: order.order_code,
    });
    throw error;
  }

  logWarn("admin_order_delete_success", {
    durationMs: getDurationMs(startedAt),
    hasPaymentProof: hasUploadedPaymentProof(order),
    orderCode: order.order_code,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order.order_code}`);
  redirect(`/admin?deleted=${encodeURIComponent(order.order_code)}`);
}
