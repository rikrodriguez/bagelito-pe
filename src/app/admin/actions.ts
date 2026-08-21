"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminToken, getAdminCookieName, requireAdmin, verifyAdminPassword } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { batchStatuses, defaultFinancialCosts, getCustomerKey, hasUploadedPaymentProof, isOrderArchived, type StatusHistory } from "@/lib/admin/queries";
import { ordersOpenStatus } from "@/lib/batch-availability";
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

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("status, payment_provider, payment_status")
    .eq("id", orderId)
    .single();
  if (readError) throw new Error(readError.message);
  if (current.status === nextStatus) return;

  if (current.payment_provider === "culqi") {
    if (["payment_pending_review", "payment_confirmed", "needs_correction"].includes(nextStatus)) {
      throw new Error("Culqi payment status can only be changed by the verified webhook.");
    }
    if (
      ["in_production", "ready_for_delivery", "delivered"].includes(nextStatus)
      && current.payment_status !== "paid"
    ) {
      throw new Error("A Culqi order cannot enter production before the webhook confirms payment.");
    }
  }

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
    .select("id, order_code, status, payment_order_id, payment_charge_id, payment_screenshot_path, order_status_history(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  if (orderCode && order.order_code !== orderCode) {
    throw new Error("Order mismatch. Refresh the admin page and try again.");
  }

  return { supabase, order };
}

async function readCustomerOrdersForAdminMutation(customerKey: string) {
  if (!customerKey) throw new Error("Missing customer key");

  const supabase = createSupabaseAdminClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_code, customer_name, whatsapp, email, status, payment_order_id, payment_charge_id, payment_screenshot_path, created_at, order_status_history(*)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const customerOrders = (orders ?? []).filter((order) => getCustomerKey(order) === customerKey);
  const visibleOrders = customerOrders.filter((order) => order.status !== "cancelled" && !isOrderArchived(order));

  return {
    customerName: visibleOrders[0]?.customer_name ?? customerOrders[0]?.customer_name ?? "Customer",
    customerOrders,
    supabase,
  };
}

const operationalCustomerStatuses = new Set([
  "payment_pending_review",
  "payment_confirmed",
  "needs_correction",
  "in_production",
  "ready_for_delivery",
]);

function customerHasOperationalOrders(orders: { status: string; order_status_history?: StatusHistory[] }[]) {
  return orders.some((order) => !isOrderArchived(order) && operationalCustomerStatuses.has(order.status));
}

async function readMatchingWaitlistIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  customerKey: string,
) {
  const { data: waitlistSignups, error } = await supabase
    .from("waitlist_signups")
    .select("id, whatsapp, email");
  const schemaMissing = error?.code === "42P01" || error?.message.toLowerCase().includes("waitlist_signups");
  if (error && !schemaMissing) throw new Error(error.message);

  return (waitlistSignups ?? [])
    .filter((signup) => getCustomerKey(signup) === customerKey)
    .map((signup) => signup.id);
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

async function readWaitlistLeadForAdminMutation(leadId: string) {
  if (!leadId) throw new Error("Missing waitlist lead ID");

  const supabase = createSupabaseAdminClient();
  const { data: lead, error } = await supabase
    .from("waitlist_signups")
    .select("id, customer_name, status")
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { lead, supabase };
}

async function setWaitlistLeadArchiveState(formData: FormData, archived: boolean) {
  const startedAt = Date.now();
  await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "");
  const returnTo = getSafeAdminReturnTo(formData, "/admin?section=waitlist");
  const action = archived ? "archive" : "restore";

  logInfo("admin_waitlist_lead_archive_start", { action, leadId });
  const { lead, supabase } = await readWaitlistLeadForAdminMutation(leadId);
  if (!lead) {
    logWarn("admin_waitlist_lead_archive_missing", {
      action,
      durationMs: getDurationMs(startedAt),
      leadId,
    });
    revalidatePath("/admin");
    redirect(appendAdminQuery(returnTo, "waitlist", "missing"));
  }

  const nextStatus = archived ? "archived" : "new";
  try {
    if (lead.status !== nextStatus) {
      const { data: updated, error } = await supabase
        .from("waitlist_signups")
        .update({ status: nextStatus })
        .eq("id", lead.id)
        .select("status")
        .single();

      if (error) throw new Error(error.message);
      if (updated.status !== nextStatus) throw new Error("Waitlist lead status was not saved.");
    }
  } catch (error) {
    logError("admin_waitlist_lead_archive_failed", error, {
      action,
      durationMs: getDurationMs(startedAt),
      leadId,
    });
    throw error;
  }

  logInfo("admin_waitlist_lead_archive_success", {
    action,
    durationMs: getDurationMs(startedAt),
    leadId,
  });
  revalidatePath("/admin");
  redirect(appendAdminQuery(returnTo, "waitlist", archived ? "archived" : "restored"));
}

export async function archiveWaitlistLead(formData: FormData) {
  await setWaitlistLeadArchiveState(formData, true);
}

export async function restoreWaitlistLead(formData: FormData) {
  await setWaitlistLeadArchiveState(formData, false);
}

export async function deleteWaitlistLead(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "");
  const confirmCustomerName = String(formData.get("confirmCustomerName") ?? "").trim();
  const returnTo = getSafeAdminReturnTo(formData, "/admin?section=waitlist");

  logWarn("admin_waitlist_lead_delete_start", { leadId });
  const { lead, supabase } = await readWaitlistLeadForAdminMutation(leadId);
  if (!lead) {
    logWarn("admin_waitlist_lead_delete_missing", {
      durationMs: getDurationMs(startedAt),
      leadId,
    });
    revalidatePath("/admin");
    redirect(appendAdminQuery(returnTo, "waitlist", "missing"));
  }

  if (confirmCustomerName !== lead.customer_name.trim()) {
    logWarn("admin_waitlist_lead_delete_confirmation_failed", {
      durationMs: getDurationMs(startedAt),
      leadId,
    });
    redirect(appendAdminQuery(returnTo, "waitlistError", "confirmation"));
  }

  try {
    const { error } = await supabase.from("waitlist_signups").delete().eq("id", lead.id);
    if (error) throw new Error(error.message);
  } catch (error) {
    logError("admin_waitlist_lead_delete_failed", error, {
      durationMs: getDurationMs(startedAt),
      leadId,
    });
    throw error;
  }

  logWarn("admin_waitlist_lead_delete_success", {
    durationMs: getDurationMs(startedAt),
    leadId,
  });
  revalidatePath("/admin");
  redirect(appendAdminQuery(returnTo, "waitlist", "deleted"));
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
  const intent = String(formData.get("intent") ?? "save");
  const status = intent === "open"
    ? ordersOpenStatus
    : parseBatchStatus(String(formData.get("status") ?? ""));
  const capacityPacks = parseNullableInteger(formData.get("capacityPacks"));
  const capacityBagels = parseNullableInteger(formData.get("capacityBagels"));
  const ordersOpenAt = parseLimaDateTime(formData.get("ordersOpenAt"));
  const ordersCloseAt = parseLimaDateTime(formData.get("ordersCloseAt"));
  const deliveryDate = parseLimaDateTime(formData.get("deliveryDate"));
  const statusAcceptsOrders = status === ordersOpenStatus;

  if (!batchId) throw new Error("Missing batch ID");

  if (statusAcceptsOrders) {
    const closeTime = ordersCloseAt ? new Date(ordersCloseAt).getTime() : Number.NaN;
    const deliveryTime = deliveryDate ? new Date(deliveryDate).getTime() : Number.NaN;

    if (!Number.isFinite(closeTime) || closeTime <= Date.now()) {
      redirect("/admin?section=batch&batch=invalid-close");
    }

    if (!Number.isFinite(deliveryTime) || deliveryTime <= closeTime) {
      redirect("/admin?section=batch&batch=invalid-delivery");
    }
  }

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
      .select("orders_open_at, status")
      .eq("id", batchId)
      .single();

    if (readError) throw new Error(readError.message);

    const update: {
      capacity_bagels: number | null;
      capacity_packs: number | null;
      delivery_date: string | null;
      name: string;
      orders_close_at: string | null;
      orders_open_at: string | null;
      status: string;
    } = {
      capacity_bagels: capacityBagels,
      capacity_packs: capacityPacks,
      delivery_date: deliveryDate,
      name,
      orders_close_at: status === "closed" && !ordersCloseAt ? new Date().toISOString() : ordersCloseAt,
      orders_open_at: ordersOpenAt ?? (existing as { orders_open_at?: string | null } | null)?.orders_open_at ?? null,
      status,
    };

    if (
      statusAcceptsOrders
      && (
        intent === "open"
        || (existing as { status?: string } | null)?.status !== ordersOpenStatus
        || !(existing as { orders_open_at?: string | null } | null)?.orders_open_at
      )
    ) {
      update.orders_open_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from("batches")
      .update(update)
      .eq("id", batchId)
      .select("status")
      .single();
    if (error) throw new Error(error.message);
    if (updated?.status !== status) throw new Error("Batch status was not saved.");
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
  revalidatePath("/waitlist");
  revalidatePath("/admin");
  redirect(`/admin?section=batch&batch=${intent === "open" ? "opened" : "updated"}`);
}

export async function closeCurrentBatch(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) throw new Error("Missing batch ID");

  logInfo("admin_batch_close_start", { batchId });

  try {
    const { data: updated, error } = await createSupabaseAdminClient()
      .from("batches")
      .update({
        orders_close_at: new Date().toISOString(),
        status: "closed",
      })
      .eq("id", batchId)
      .select("status")
      .single();

    if (error) throw new Error(error.message);
    if (updated?.status !== "closed") throw new Error("Batch status was not closed.");
  } catch (error) {
    logError("admin_batch_close_failed", error, {
      batchId,
      durationMs: getDurationMs(startedAt),
    });
    throw error;
  }

  logInfo("admin_batch_close_success", {
    batchId,
    durationMs: getDurationMs(startedAt),
  });
  revalidatePath("/");
  revalidatePath("/reserve");
  revalidatePath("/waitlist");
  revalidatePath("/admin");
  redirect("/admin?section=batch&batch=closed");
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

    for (const providerResourceId of [order.payment_order_id, order.payment_charge_id]) {
      if (!providerResourceId) continue;
      const { error: webhookDeleteError } = await supabase
        .from("payment_webhook_events")
        .delete()
        .eq("provider", "culqi")
        .eq("provider_order_id", providerResourceId);
      if (webhookDeleteError) throw new Error(webhookDeleteError.message);
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

export async function archiveCustomerProfile(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const customerKey = String(formData.get("customerKey") ?? "");

  logInfo("admin_customer_archive_start", { customerKeyType: customerKey.split(":", 1)[0] });
  const { customerOrders, supabase } = await readCustomerOrdersForAdminMutation(customerKey);
  if (!customerOrders.length) {
    logWarn("admin_customer_archive_missing", { durationMs: getDurationMs(startedAt) });
    revalidatePath("/admin");
    redirect("/admin?section=crm&archivedCustomer=missing");
  }

  if (customerHasOperationalOrders(customerOrders)) {
    logWarn("admin_customer_archive_blocked_active_order", {
      durationMs: getDurationMs(startedAt),
      orderCount: customerOrders.length,
    });
    redirect("/admin?section=crm&customerActionError=active");
  }

  const ordersToArchive = customerOrders.filter((order) => !isOrderArchived(order));
  try {
    const waitlistIds = await readMatchingWaitlistIds(supabase, customerKey);

    if (ordersToArchive.length) {
      const { error: archiveError } = await supabase.from("order_status_history").insert(
        ordersToArchive.map((order) => ({
          order_id: order.id,
          old_status: order.status,
          new_status: "archived",
          changed_by: "admin customer archive",
        })),
      );
      if (archiveError) throw new Error(archiveError.message);
    }

    if (waitlistIds.length) {
      const { error: waitlistArchiveError } = await supabase
        .from("waitlist_signups")
        .update({ status: "archived" })
        .in("id", waitlistIds);
      if (waitlistArchiveError) throw new Error(waitlistArchiveError.message);
    }
  } catch (error) {
    logError("admin_customer_archive_failed", error, {
      durationMs: getDurationMs(startedAt),
      orderCount: customerOrders.length,
    });
    throw error;
  }

  logInfo("admin_customer_archive_success", {
    durationMs: getDurationMs(startedAt),
    orderCount: customerOrders.length,
  });
  revalidatePath("/admin");
  for (const order of customerOrders) revalidatePath(`/admin/orders/${order.order_code}`);
  redirect("/admin?section=crm&archivedCustomer=success");
}

export async function deleteCustomerProfile(formData: FormData) {
  const startedAt = Date.now();
  await requireAdmin();
  const customerKey = String(formData.get("customerKey") ?? "");
  const confirmCustomerName = String(formData.get("confirmCustomerName") ?? "");

  logWarn("admin_customer_delete_start", { customerKeyType: customerKey.split(":", 1)[0] });
  const { customerName, customerOrders, supabase } = await readCustomerOrdersForAdminMutation(customerKey);
  if (!customerOrders.length) {
    logWarn("admin_customer_delete_missing", { durationMs: getDurationMs(startedAt) });
    revalidatePath("/admin");
    redirect("/admin?section=crm&deletedCustomer=missing");
  }

  if (confirmCustomerName !== customerName) {
    logWarn("admin_customer_delete_confirmation_failed", {
      durationMs: getDurationMs(startedAt),
      orderCount: customerOrders.length,
    });
    redirect("/admin?section=crm&customerActionError=confirmation");
  }

  if (customerHasOperationalOrders(customerOrders)) {
    logWarn("admin_customer_delete_blocked_active_order", {
      durationMs: getDurationMs(startedAt),
      orderCount: customerOrders.length,
    });
    redirect("/admin?section=crm&customerActionError=active");
  }

  try {
    const waitlistIds = await readMatchingWaitlistIds(supabase, customerKey);
    const paymentProofPaths = Array.from(new Set(
      customerOrders
        .filter(hasUploadedPaymentProof)
        .map((order) => order.payment_screenshot_path)
        .filter((path): path is string => Boolean(path)),
    ));
    if (paymentProofPaths.length) {
      const { error: storageError } = await supabase.storage.from("payment-proofs").remove(paymentProofPaths);
      if (storageError) throw new Error("Could not delete payment proofs: " + storageError.message);
    }

    const providerResourceIds = Array.from(new Set(
      customerOrders
        .flatMap((order) => [order.payment_order_id, order.payment_charge_id])
        .filter((id): id is string => Boolean(id)),
    ));
    if (providerResourceIds.length) {
      const { error: webhookDeleteError } = await supabase
        .from("payment_webhook_events")
        .delete()
        .eq("provider", "culqi")
        .in("provider_order_id", providerResourceIds);
      if (webhookDeleteError) throw new Error(webhookDeleteError.message);
    }

    const orderIds = customerOrders.map((order) => order.id);
    const { error: deleteError } = await supabase.from("orders").delete().in("id", orderIds);
    if (deleteError) throw new Error(deleteError.message);

    if (waitlistIds.length) {
      const { error: waitlistDeleteError } = await supabase.from("waitlist_signups").delete().in("id", waitlistIds);
      if (waitlistDeleteError) throw new Error(waitlistDeleteError.message);
    }
  } catch (error) {
    logError("admin_customer_delete_failed", error, {
      durationMs: getDurationMs(startedAt),
      orderCount: customerOrders.length,
    });
    throw error;
  }

  logWarn("admin_customer_delete_success", {
    durationMs: getDurationMs(startedAt),
    orderCount: customerOrders.length,
  });
  revalidatePath("/admin");
  for (const order of customerOrders) revalidatePath(`/admin/orders/${order.order_code}`);
  redirect("/admin?section=crm&deletedCustomer=success");
}
