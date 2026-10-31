import { randomBytes } from "node:crypto";
import { createManualReservation } from "./manual-service";
import { getFlavorBySlug, getPackBySlug } from "@/lib/catalog";
import { getCheckoutExtraPackOffer } from "@/lib/checkout-upsell";
import { getDeliveryDistanceKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { getMissingReservationEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { consumesBatchCapacity, isBatchAcceptingOrders, ordersOpenStatus } from "@/lib/batch-availability";
import {
  culqiReservationPayloadSchema,
  parseItems,
  reservationPayloadSchema,
  type CulqiReservationPayload,
  type ReservationPayload,
} from "./schema";

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
  const orders = ((data ?? []) as CapacityOrderRow[]).filter((order) => consumesBatchCapacity(order, now));
  return {
    reservedBagels: orders.reduce((sum, order) => sum + Number(order.pack_units), 0),
    reservedPacks: orders.length,
  };
}

function getBatchBlockReason(batch: CurrentBatchRow, usage: { reservedBagels: number; reservedPacks: number }, nextPackUnits = 0) {
  if (batch.status !== ordersOpenStatus) {
    return "This Bagelito batch is currently closed. Join the waitlist for the next opening.";
  }

  if (!isBatchAcceptingOrders(batch.status, batch.orders_close_at, Date.now(), batch.orders_open_at)) {
    return "This Bagelito batch has already closed. Join the waitlist for the next batch.";
  }

  if (batch.capacity_packs !== null && batch.capacity_packs !== undefined && usage.reservedPacks + 1 > Number(batch.capacity_packs)) {
    return "This Bagelito batch is full. Join the waitlist.";
  }

  if (batch.capacity_bagels !== null && batch.capacity_bagels !== undefined && usage.reservedBagels + nextPackUnits > Number(batch.capacity_bagels)) {
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
      remainingBagels: batch.capacity_bagels !== null && batch.capacity_bagels !== undefined ? Math.max(0, Number(batch.capacity_bagels) - usage.reservedBagels) : null,
      remainingPacks: batch.capacity_packs !== null && batch.capacity_packs !== undefined ? Math.max(0, Number(batch.capacity_packs) - usage.reservedPacks) : null,
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
    operationId: formData.get("operationId"),
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

export async function createReservation(formData: FormData) {
  const missing = getMissingReservationEnv();
  if (missing.length) throw new Error("Missing required environment variables: " + missing.join(", "));
  return createManualReservation(formData);
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
