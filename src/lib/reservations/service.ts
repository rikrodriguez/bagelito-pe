import { randomBytes } from "node:crypto";
import { getFlavorBySlug, getPackBySlug } from "@/lib/catalog";
import { getCheckoutExtraPackOffer } from "@/lib/checkout-upsell";
import { getDeliveryDistanceKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { getMissingReservationEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/monitoring";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBatchAcceptingOrders, ordersOpenStatus } from "@/lib/batch-availability";
import {
  culqiReservationPayloadSchema,
  parseItems,
  reservationPayloadSchema,
  type CulqiReservationPayload,
  type ReservationPayload,
} from "./schema";

const paymentProofBucket = "payment-proofs";
const maxPaymentScreenshotBytes = 5 * 1024 * 1024;
const allowedPaymentScreenshotTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

type OrderRow = { id: string; order_code: string };
type ReservationRpcRow = { order_id: string; order_code: string };
type CulqiReservationRpcRow = { order_id: string; order_code: string; payment_expires_at: string };
type ReservationItemInsert = {
  flavor_name: string;
  flavor_slug: string;
  quantity: number;
};
type CurrentBatchRow = {
  id: string;
  name: string;
  status: string;
  orders_open_at: string | null;
  orders_close_at: string | null;
  delivery_date: string | null;
  capacity_packs: number | null;
  capacity_bagels: number | null;
};
type CapacityOrderRow = {
  pack_units: number;
  payment_expires_at?: string | null;
  payment_provider?: string | null;
  payment_status?: string | null;
  status: string;
};

export type BatchAvailability = {
  accepting: boolean;
  batchName: string;
  capacityBagels: number | null;
  capacityPacks: number | null;
  deliveryDate: string | null;
  ordersOpenAt: string | null;
  ordersCloseAt: string | null;
  remainingBagels: number | null;
  remainingPacks: number | null;
  reservedBagels: number;
  reservedPacks: number;
  status: string;
};

const currentBatchSelect = "id, name, status, orders_open_at, orders_close_at, delivery_date, capacity_packs, capacity_bagels";

function fallbackOrderCode() {
  return "BAG-" + Date.now().toString(36).toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase();
}

function safeFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);

  return cleaned || "payment-proof.png";
}

function getPaymentScreenshot(formData: FormData) {
  const file = formData.get("paymentScreenshot");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Payment screenshot is required.");
  }

  if (!allowedPaymentScreenshotTypes.has(file.type)) {
    throw new Error("Payment screenshot must be PNG, JPG, JPEG, or WEBP.");
  }

  if (file.size > maxPaymentScreenshotBytes) {
    throw new Error("Payment screenshot must be 5MB or smaller.");
  }

  return file;
}

function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined, functionName: string) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42883" || message.includes(functionName.toLowerCase());
}

async function nextOrderCode(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase.rpc("next_order_code");
  return error || typeof data !== "string" ? fallbackOrderCode() : data;
}

async function readCurrentBatch(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from("batches")
    .select(currentBatchSelect)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Could not read active batch: " + error.message);

  const batch = data as CurrentBatchRow | null;
  return batch?.id ? batch : null;
}

async function getOrCreateCurrentBatch(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const batch = await readCurrentBatch(supabase);
  if (batch?.id) return batch;

  const { data: created, error: createError } = await supabase
    .from("batches")
    .insert({ name: "Next Bagelito Batch", status: "waitlist_open" })
    .select(currentBatchSelect)
    .single();

  const createdBatch = created as CurrentBatchRow | null;
  if (createError || !createdBatch?.id) {
    throw new Error("Could not create default batch: " + (createError?.message ?? "unknown error"));
  }

  return createdBatch;
}

async function getBatchCapacityUsage(supabase: ReturnType<typeof createSupabaseAdminClient>, batchId: string) {
  let { data, error } = await supabase
    .from("orders")
    .select("pack_units, status, payment_provider, payment_status, payment_expires_at")
    .eq("batch_id", batchId)
    .neq("status", "cancelled");

  if (error?.code === "42703") {
    const legacyResult = await supabase
      .from("orders")
      .select("pack_units, status")
      .eq("batch_id", batchId)
      .neq("status", "cancelled");

    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  if (error) throw new Error("Could not read batch capacity: " + error.message);

  const now = Date.now();
  const orders = ((data ?? []) as CapacityOrderRow[]).filter((order) => !(
    order.payment_provider === "culqi"
    && (order.payment_status === "pending" || order.payment_status === "failed")
    && order.payment_expires_at
    && new Date(order.payment_expires_at).getTime() <= now
  ));
  return {
    reservedBagels: orders.reduce((sum, order) => sum + Number(order.pack_units), 0),
    reservedPacks: orders.length,
  };
}

function getBatchBlockReason(batch: CurrentBatchRow, usage: { reservedBagels: number; reservedPacks: number }, nextPackUnits = 0) {
  if (batch.status !== ordersOpenStatus) {
    return "This Bagelito batch is currently closed. Join the waitlist for the next opening.";
  }

  if (!isBatchAcceptingOrders(batch.status, batch.orders_close_at)) {
    return "This Bagelito batch has already closed. Join the waitlist for the next batch.";
  }

  if (batch.capacity_packs && usage.reservedPacks + 1 > Number(batch.capacity_packs)) {
    return "This Bagelito batch is full. Join the waitlist.";
  }

  if (batch.capacity_bagels && usage.reservedBagels + nextPackUnits > Number(batch.capacity_bagels)) {
    return "This Bagelito batch is full for the pack size selected. Join the waitlist.";
  }

  return "";
}

function fallbackBatchAvailability({
  accepting = false,
  status = "waitlist_open",
}: {
  accepting?: boolean;
  status?: string;
} = {}): BatchAvailability {
  return {
    accepting,
    batchName: "Next Bagelito Batch",
    capacityBagels: null,
    capacityPacks: null,
    deliveryDate: null,
    ordersOpenAt: null,
    ordersCloseAt: null,
    remainingBagels: null,
    remainingPacks: null,
    reservedBagels: 0,
    reservedPacks: 0,
    status,
  };
}

export async function getReservationBatchAvailability(): Promise<BatchAvailability> {
  const missing = getMissingReservationEnv();
  if (missing.length) return fallbackBatchAvailability();

  try {
    const supabase = createSupabaseAdminClient();
    const batch = await readCurrentBatch(supabase);
    if (!batch) return fallbackBatchAvailability({ accepting: false, status: "closed" });

    const usage = await getBatchCapacityUsage(supabase, batch.id);
    const blockReason = getBatchBlockReason(batch, usage, 6);

    return {
      accepting: !blockReason,
      batchName: batch.name,
      capacityBagels: batch.capacity_bagels,
      capacityPacks: batch.capacity_packs,
      deliveryDate: batch.delivery_date,
      ordersOpenAt: batch.orders_open_at,
      ordersCloseAt: batch.orders_close_at,
      remainingBagels: batch.capacity_bagels ? Math.max(0, Number(batch.capacity_bagels) - usage.reservedBagels) : null,
      remainingPacks: batch.capacity_packs ? Math.max(0, Number(batch.capacity_packs) - usage.reservedPacks) : null,
      reservedBagels: usage.reservedBagels,
      reservedPacks: usage.reservedPacks,
      status: batch.status,
    };
  } catch {
    return fallbackBatchAvailability({ accepting: false, status: "closed" });
  }
}

export function payloadFromFormData(formData: FormData): ReservationPayload {
  return reservationPayloadSchema.parse({
    packSlug: formData.get("packSlug"),
    items: parseItems(formData.get("items")),
    customerName: formData.get("customerName"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    website: formData.get("website") ?? "",
    deliveryAddress: formData.get("deliveryAddress"),
    district: formData.get("district"),
    addressReference: formData.get("addressReference") ?? "",
    deliveryNotes: formData.get("deliveryNotes") ?? "",
    deliveryHandoff: formData.get("deliveryHandoff") ?? "self",
    marketingOptIn: formData.get("marketingOptIn") === "true",
    paymentMethod: formData.get("paymentMethod"),
    paymentTransactionNumber: formData.get("paymentTransactionNumber"),
    paymentHolderName: formData.get("paymentHolderName"),
    paymentPhoneNumber: formData.get("paymentPhoneNumber"),
    exactAmountConfirmed: formData.get("exactAmountConfirmed") === "true",
    termsAccepted: formData.get("termsAccepted") === "true",
  });
}

function buildReservationItems(payload: Pick<ReservationPayload | CulqiReservationPayload, "items">) {
  return payload.items.map((item) => {
    const flavor = getFlavorBySlug(item.flavorSlug);
    if (!flavor) throw new Error("Invalid flavor selected.");

    return {
      flavor_name: flavor.name,
      flavor_slug: flavor.slug,
      quantity: item.quantity,
    } satisfies ReservationItemInsert;
  });
}

async function removeUploadedPaymentProof(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  path: string,
) {
  const { error } = await supabase.storage.from(paymentProofBucket).remove([path]);
  if (error) {
    logWarn("reservation_payment_proof_cleanup_failed", {
      error: error.message,
      path,
    });
  }
}

async function rollbackLegacyReservation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  {
    orderId,
  }: {
    orderId: string | null;
  },
) {
  if (orderId) {
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) {
      logWarn("reservation_legacy_order_cleanup_failed", {
        error: error.message,
        orderId,
      });
    }
  }
}

async function createReservationViaRpc(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    addressReference: string;
    batchId: string;
    customerName: string;
    deliveryAddress: string;
    deliveryNotes: string;
    district: string;
    email: string;
    exactAmountConfirmed: boolean;
    items: ReservationItemInsert[];
    marketingOptIn: boolean;
    orderCode: string;
    packName: string;
    packSlug: string;
    packType: string;
    packUnits: number;
    paymentHolderName: string;
    paymentMethod: string;
    paymentPhoneNumber: string;
    paymentScreenshotPath: string;
    paymentTransactionNumber: string;
    termsAccepted: boolean;
    totalAmount: number;
    whatsapp: string;
  },
) {
  const { data, error } = await supabase
    .rpc("create_reservation_order", {
      p_address_reference: input.addressReference || null,
      p_batch_id: input.batchId,
      p_customer_name: input.customerName,
      p_delivery_address: input.deliveryAddress,
      p_delivery_notes: input.deliveryNotes || null,
      p_district: input.district,
      p_email: input.email,
      p_exact_amount_confirmed: input.exactAmountConfirmed,
      p_items: input.items,
      p_marketing_opt_in: input.marketingOptIn,
      p_order_code: input.orderCode,
      p_pack_name: input.packName,
      p_pack_slug: input.packSlug,
      p_pack_type: input.packType,
      p_pack_units: input.packUnits,
      p_payment_holder_name: input.paymentHolderName,
      p_payment_method: input.paymentMethod,
      p_payment_phone_number: input.paymentPhoneNumber,
      p_payment_screenshot_path: input.paymentScreenshotPath,
      p_payment_transaction_number: input.paymentTransactionNumber,
      p_terms_accepted: input.termsAccepted,
      p_total_amount: input.totalAmount,
      p_whatsapp: input.whatsapp,
    })
    .single();

  if (error) {
    if (isMissingFunctionError(error, "create_reservation_order")) {
      logWarn("reservation_rpc_missing_fallback", {
        orderCode: input.orderCode,
      });
      return null;
    }

    throw new Error("Could not create reservation: " + error.message);
  }

  const row = data as ReservationRpcRow | null;
  if (!row?.order_id || !row.order_code) {
    throw new Error("Could not create reservation: transaction returned no order row.");
  }

  return {
    id: row.order_id,
    order_code: row.order_code,
  } satisfies OrderRow;
}

async function createReservationLegacy(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    addressReference: string;
    batchId: string;
    customerName: string;
    deliveryAddress: string;
    deliveryNotes: string;
    district: string;
    email: string;
    exactAmountConfirmed: boolean;
    items: ReservationItemInsert[];
    marketingOptIn: boolean;
    orderCode: string;
    packName: string;
    packSlug: string;
    packType: string;
    packUnits: number;
    paymentHolderName: string;
    paymentMethod: string;
    paymentPhoneNumber: string;
    paymentScreenshotPath: string;
    paymentTransactionNumber: string;
    termsAccepted: boolean;
    totalAmount: number;
    whatsapp: string;
  },
) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      address_reference: input.addressReference || null,
      batch_id: input.batchId,
      customer_name: input.customerName,
      delivery_address: input.deliveryAddress,
      delivery_notes: input.deliveryNotes || null,
      district: input.district,
      email: input.email,
      exact_amount_confirmed: input.exactAmountConfirmed,
      marketing_opt_in: input.marketingOptIn,
      order_code: input.orderCode,
      pack_name: input.packName,
      pack_slug: input.packSlug,
      pack_type: input.packType,
      pack_units: input.packUnits,
      payment_holder_name: input.paymentHolderName,
      payment_method: input.paymentMethod,
      payment_phone_number: input.paymentPhoneNumber,
      payment_screenshot_path: input.paymentScreenshotPath,
      payment_transaction_number: input.paymentTransactionNumber,
      status: "payment_pending_review",
      terms_accepted: input.termsAccepted,
      total_amount: input.totalAmount,
      whatsapp: input.whatsapp,
    })
    .select("id, order_code")
    .single();

  const orderRow = order as OrderRow | null;
  if (orderError || !orderRow?.id) {
    throw new Error("Could not create reservation: " + (orderError?.message ?? "unknown error"));
  }

  try {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item) => ({
        ...item,
        order_id: orderRow.id,
      })),
    );

    if (itemsError) {
      throw new Error("Could not create order items: " + itemsError.message);
    }

    const { error: statusError } = await supabase.from("order_status_history").insert({
      changed_by: "customer",
      new_status: "payment_pending_review",
      old_status: null,
      order_id: orderRow.id,
    });

    if (statusError) {
      throw new Error("Could not create order status history: " + statusError.message);
    }
  } catch (error) {
    await rollbackLegacyReservation(supabase, {
      orderId: orderRow.id,
    });

    throw error;
  }

  return orderRow;
}

export async function createReservation(formData: FormData) {
  const missing = getMissingReservationEnv();
  if (missing.length) throw new Error("Missing required environment variables: " + missing.join(", "));

  const payload = payloadFromFormData(formData);
  const pack = getPackBySlug(payload.packSlug);
  if (!pack) throw new Error("Invalid pack selected.");
  const deliveryDistanceKm = getDeliveryDistanceKm(payload.district);
  const deliveryFee = getDeliveryFee(payload.district);
  const totalAmount = pack.amount + deliveryFee;

  const supabase = createSupabaseAdminClient();
  const batch = await getOrCreateCurrentBatch(supabase);
  const usage = await getBatchCapacityUsage(supabase, batch.id);
  const batchBlockReason = getBatchBlockReason(batch, usage, pack.units);
  if (batchBlockReason) throw new Error(batchBlockReason);

  const paymentScreenshot = getPaymentScreenshot(formData);
  const reservationItems = buildReservationItems(payload);
  const orderCode = await nextOrderCode(supabase);
  const paymentScreenshotPath = orderCode + "/" + Date.now() + "-" + safeFilename(paymentScreenshot.name);
  const handoffNote = payload.deliveryHandoff === "porteria" ? "Recepción: Dejar en portería" : "Recepción: Yo lo recibo";
  const deliveryNotes = [handoffNote, `Delivery: S/${deliveryFee} (${deliveryDistanceKm} km)`, payload.deliveryNotes].filter(Boolean).join(" | ");

  const { error: uploadError } = await supabase.storage
    .from(paymentProofBucket)
    .upload(paymentScreenshotPath, paymentScreenshot, {
      contentType: paymentScreenshot.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Could not upload payment proof: " + uploadError.message);
  }

  let orderRow: OrderRow | null = null;
  try {
    orderRow = await createReservationViaRpc(supabase, {
      addressReference: payload.addressReference,
      batchId: batch.id,
      customerName: payload.customerName,
      deliveryAddress: payload.deliveryAddress,
      deliveryNotes,
      district: payload.district,
      email: payload.email,
      exactAmountConfirmed: payload.exactAmountConfirmed,
      items: reservationItems,
      marketingOptIn: payload.marketingOptIn,
      orderCode,
      packName: pack.name,
      packSlug: pack.slug,
      packType: pack.packType,
      packUnits: pack.units,
      paymentHolderName: payload.paymentHolderName,
      paymentMethod: payload.paymentMethod,
      paymentPhoneNumber: payload.paymentPhoneNumber,
      paymentScreenshotPath,
      paymentTransactionNumber: payload.paymentTransactionNumber,
      termsAccepted: payload.termsAccepted,
      totalAmount,
      whatsapp: payload.whatsapp,
    });

    if (!orderRow) {
      orderRow = await createReservationLegacy(supabase, {
        addressReference: payload.addressReference,
        batchId: batch.id,
        customerName: payload.customerName,
        deliveryAddress: payload.deliveryAddress,
        deliveryNotes,
        district: payload.district,
        email: payload.email,
        exactAmountConfirmed: payload.exactAmountConfirmed,
        items: reservationItems,
        marketingOptIn: payload.marketingOptIn,
        orderCode,
        packName: pack.name,
        packSlug: pack.slug,
        packType: pack.packType,
        packUnits: pack.units,
        paymentHolderName: payload.paymentHolderName,
        paymentMethod: payload.paymentMethod,
        paymentPhoneNumber: payload.paymentPhoneNumber,
        paymentScreenshotPath,
        paymentTransactionNumber: payload.paymentTransactionNumber,
        termsAccepted: payload.termsAccepted,
        totalAmount,
        whatsapp: payload.whatsapp,
      });
    }
  } catch (error) {
    await removeUploadedPaymentProof(supabase, paymentScreenshotPath);
    logError("reservation_create_failed_after_upload", error, {
      batchId: batch.id,
      orderCode,
      paymentScreenshotPath,
    });
    throw error;
  }

  return {
    amount: totalAmount,
    orderCode: orderRow.order_code,
    packSlug: pack.slug,
  };
}

export async function createCulqiReservation(input: unknown) {
  const missing = getMissingReservationEnv();
  if (missing.length) throw new Error("Missing required environment variables: " + missing.join(", "));

  const payload = culqiReservationPayloadSchema.parse(input);
  const pack = getPackBySlug(payload.packSlug);
  if (!pack) throw new Error("Invalid pack selected.");

  const deliveryDistanceKm = getDeliveryDistanceKm(payload.district);
  const deliveryFee = getDeliveryFee(payload.district);
  const extraPackOffer = getCheckoutExtraPackOffer(pack.amount);
  const productSubtotal = pack.amount + (payload.extraPack ? extraPackOffer.discountedAmount : 0);
  const totalAmount = productSubtotal + deliveryFee;
  const orderPackUnits = pack.units * (payload.extraPack ? 2 : 1);
  const orderPackName = payload.extraPack
    ? `2 x ${pack.name} (extra pack 20% off)`
    : pack.name;
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("id, order_code, email, pack_slug, total_amount, payment_expires_at, status")
    .eq("checkout_session_id", payload.checkoutSessionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.code === "42703"
        ? "Culqi database migration is not installed yet."
        : "Could not verify checkout session: " + existingError.message,
    );
  }

  if (existing) {
    if (String(existing.email).trim().toLowerCase() !== payload.email.trim().toLowerCase()) {
      throw new Error("Checkout session does not match this reservation.");
    }

    if (
      existing.pack_slug !== pack.slug
      || Number(existing.total_amount) !== totalAmount
    ) {
      throw new Error("Checkout session does not match this pack or delivery total.");
    }

    if (existing.status === "cancelled") {
      throw new Error("This payment session expired. Refresh the page to start a new reservation.");
    }

    return {
      amount: Number(existing.total_amount),
      expiresAt: String(existing.payment_expires_at ?? ""),
      orderCode: String(existing.order_code),
      packSlug: String(existing.pack_slug),
    };
  }

  const batch = await getOrCreateCurrentBatch(supabase);
  const batchBlockReason = getBatchBlockReason(batch, { reservedBagels: 0, reservedPacks: 0 }, 0);
  if (batchBlockReason) throw new Error(batchBlockReason);

  const orderCode = await nextOrderCode(supabase);
  const reservationItems = buildReservationItems(payload);
  const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const handoffNote = payload.deliveryHandoff === "porteria" ? "Recepción: Dejar en portería" : "Recepción: Yo lo recibo";
  const deliveryNotes = [
    handoffNote,
    `Delivery: S/${deliveryFee} (${deliveryDistanceKm} km)`,
    payload.extraPack
      ? `Upsell: pack extra con 20% de descuento (S/${extraPackOffer.discountedAmount})`
      : "",
    payload.deliveryNotes,
  ].filter(Boolean).join(" | ");

  const { data, error } = await supabase
    .rpc("create_culqi_reservation_order", {
      p_address_reference: payload.addressReference || null,
      p_batch_id: batch.id,
      p_checkout_session_id: payload.checkoutSessionId,
      p_customer_name: payload.customerName,
      p_delivery_address: payload.deliveryAddress,
      p_delivery_notes: deliveryNotes || null,
      p_district: payload.district,
      p_email: payload.email,
      p_items: reservationItems,
      p_marketing_opt_in: payload.marketingOptIn,
      p_order_code: orderCode,
      p_pack_name: orderPackName,
      p_pack_slug: pack.slug,
      p_pack_type: pack.packType,
      p_pack_units: orderPackUnits,
      p_payment_expires_at: paymentExpiresAt,
      p_terms_accepted: payload.termsAccepted,
      p_total_amount: totalAmount,
      p_whatsapp: payload.whatsapp,
    })
    .single();

  if (error) {
    if (isMissingFunctionError(error, "create_culqi_reservation_order")) {
      throw new Error("Culqi database migration is not installed yet.");
    }
    throw new Error("Could not create Culqi reservation: " + error.message);
  }

  const order = data as CulqiReservationRpcRow | null;
  if (!order?.order_id || !order.order_code) {
    throw new Error("Could not create Culqi reservation: transaction returned no order row.");
  }

  return {
    amount: totalAmount,
    expiresAt: order.payment_expires_at || paymentExpiresAt,
    orderCode: order.order_code,
    packSlug: pack.slug,
  };
}
