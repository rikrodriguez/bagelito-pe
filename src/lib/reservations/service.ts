import { randomBytes } from "node:crypto";
import { getFlavorBySlug, getPackBySlug } from "@/lib/catalog";
import { getDeliveryDistanceKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { getMissingReservationEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseItems, reservationPayloadSchema, type ReservationPayload } from "./schema";

const paymentProofBucket = "payment-proofs";
const maxPaymentScreenshotBytes = 5 * 1024 * 1024;
const allowedPaymentScreenshotTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

type OrderRow = { id: string; order_code: string };
type CurrentBatchRow = {
  id: string;
  name: string;
  status: string;
  orders_close_at: string | null;
  delivery_date: string | null;
  capacity_packs: number | null;
  capacity_bagels: number | null;
};
type CapacityOrderRow = { pack_units: number; status: string };

const acceptingBatchStatuses = new Set(["waitlist_open", "orders_open"]);
const currentBatchSelect = "id, name, status, orders_close_at, delivery_date, capacity_packs, capacity_bagels";

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
    .insert({ name: "Next Bagelito Batch", status: "orders_open", orders_open_at: new Date().toISOString() })
    .select(currentBatchSelect)
    .single();

  const createdBatch = created as CurrentBatchRow | null;
  if (createError || !createdBatch?.id) {
    throw new Error("Could not create default batch: " + (createError?.message ?? "unknown error"));
  }

  return createdBatch;
}

async function getBatchCapacityUsage(supabase: ReturnType<typeof createSupabaseAdminClient>, batchId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("pack_units, status")
    .eq("batch_id", batchId)
    .neq("status", "cancelled");

  if (error) throw new Error("Could not read batch capacity: " + error.message);

  const orders = (data ?? []) as CapacityOrderRow[];
  return {
    reservedBagels: orders.reduce((sum, order) => sum + Number(order.pack_units), 0),
    reservedPacks: orders.length,
  };
}

function getBatchBlockReason(batch: CurrentBatchRow, usage: { reservedBagels: number; reservedPacks: number }, nextPackUnits = 0) {
  if (!acceptingBatchStatuses.has(batch.status)) {
    return "This Bagelito batch is currently closed. Message us on WhatsApp to join the waitlist for the next opening.";
  }

  if (batch.orders_close_at && Date.now() >= new Date(batch.orders_close_at).getTime()) {
    return "This Bagelito batch has already closed. Message us on WhatsApp to join the waitlist for the next batch.";
  }

  if (batch.capacity_packs && usage.reservedPacks + 1 > Number(batch.capacity_packs)) {
    return "This Bagelito batch is full. Message us on WhatsApp to join the waitlist.";
  }

  if (batch.capacity_bagels && usage.reservedBagels + nextPackUnits > Number(batch.capacity_bagels)) {
    return "This Bagelito batch is full for the pack size selected. Message us on WhatsApp to join the waitlist.";
  }

  return "";
}

function fallbackBatchAvailability({
  accepting = true,
  status = "orders_open",
}: {
  accepting?: boolean;
  status?: string;
} = {}) {
  return {
    accepting,
    batchName: "Next Bagelito Batch",
    capacityBagels: null,
    capacityPacks: null,
    deliveryDate: null,
    ordersCloseAt: null,
    remainingBagels: null,
    remainingPacks: null,
    reservedBagels: 0,
    reservedPacks: 0,
    status,
  };
}

export async function getReservationBatchAvailability() {
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_code: orderCode,
      batch_id: batch.id,
      pack_slug: pack.slug,
      pack_name: pack.name,
      pack_units: pack.units,
      pack_type: pack.packType,
      customer_name: payload.customerName,
      whatsapp: payload.whatsapp,
      email: payload.email,
      delivery_address: payload.deliveryAddress,
      district: payload.district,
      address_reference: payload.addressReference || null,
      delivery_notes: deliveryNotes || null,
      marketing_opt_in: payload.marketingOptIn,
      total_amount: totalAmount,
      payment_method: payload.paymentMethod,
      payment_transaction_number: payload.paymentTransactionNumber,
      payment_holder_name: payload.paymentHolderName,
      payment_phone_number: payload.paymentPhoneNumber,
      payment_screenshot_path: paymentScreenshotPath,
      terms_accepted: payload.termsAccepted,
      exact_amount_confirmed: payload.exactAmountConfirmed,
      status: "payment_pending_review",
    })
    .select("id, order_code")
    .single();

  const orderRow = order as OrderRow | null;
  if (orderError || !orderRow?.id) {
    await supabase.storage.from(paymentProofBucket).remove([paymentScreenshotPath]);
    throw new Error("Could not create reservation: " + (orderError?.message ?? "unknown error"));
  }

  const items = payload.items.map((item) => {
    const flavor = getFlavorBySlug(item.flavorSlug);
    if (!flavor) throw new Error("Invalid flavor selected.");
    return {
      order_id: orderRow.id,
      flavor_slug: flavor.slug,
      flavor_name: flavor.name,
      quantity: item.quantity,
    };
  });

  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) throw new Error("Could not create order items: " + itemsError.message);

  await supabase.from("order_status_history").insert({
    order_id: orderRow.id,
    old_status: null,
    new_status: "payment_pending_review",
    changed_by: "customer",
  });

  return {
    amount: totalAmount,
    orderCode: orderRow.order_code,
    packSlug: pack.slug,
  };
}
