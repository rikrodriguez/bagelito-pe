import { getMissingReservationEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { trackLookupSchema, type TrackLookupInput } from "./schema";

type OrderItemRow = {
  flavor_name: string;
  flavor_slug: string;
  quantity: number;
};

type StatusHistoryRow = {
  created_at: string;
  new_status: string;
};

type OrderLookupRow = {
  batch_id: string | null;
  created_at: string;
  customer_name: string;
  district: string;
  email: string;
  order_code: string;
  order_items?: OrderItemRow[];
  order_status_history?: StatusHistoryRow[];
  pack_name: string;
  pack_units: number;
  payment_provider: string | null;
  payment_status: string | null;
  status: string;
  total_amount: number;
  updated_at: string;
  whatsapp: string;
};

type BatchLookupRow = {
  delivery_date: string | null;
  name: string;
};

export type PublicTrackedOrder = {
  batchName: string | null;
  createdAt: string;
  customerName: string;
  deliveryDate: string | null;
  district: string;
  history: Array<{ createdAt: string; status: string }>;
  items: Array<{ flavorName: string; flavorSlug: string; quantity: number }>;
  orderCode: string;
  packName: string;
  packUnits: number;
  paymentProvider: string | null;
  paymentStatus: string | null;
  status: string;
  totalAmount: number;
  updatedAt: string;
};

export class TrackLookupError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrackLookupError";
    this.status = status;
  }
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length === 11) return digits.slice(2);
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

function matchesContact(order: Pick<OrderLookupRow, "email" | "whatsapp">, contact: string) {
  const normalizedContact = contact.trim();
  if (!normalizedContact) return false;

  return normalizeEmail(order.email) === normalizeEmail(normalizedContact)
    || normalizePhone(order.whatsapp) === normalizePhone(normalizedContact);
}

const orderLookupSelect = "batch_id, created_at, customer_name, district, email, order_code, pack_name, pack_units, payment_provider, payment_status, status, total_amount, updated_at, whatsapp, order_items(flavor_name, flavor_slug, quantity), order_status_history(created_at, new_status)";

async function readOrderByCode(orderCode: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("orders")
    .select(orderLookupSelect)
    .eq("order_code", orderCode)
    .maybeSingle();

  if (error) {
    throw new Error("Could not look up reservation: " + error.message);
  }

  return (data as OrderLookupRow | null) ?? null;
}

async function readOrderByContact(contact: string) {
  const supabase = createSupabaseAdminClient();
  const trimmedContact = contact.trim();
  const baseQuery = supabase
    .from("orders")
    .select(orderLookupSelect);
  const filteredQuery = trimmedContact.includes("@")
    ? baseQuery.ilike("email", trimmedContact)
    : baseQuery.in("whatsapp", [...new Set([
        trimmedContact,
        normalizePhone(trimmedContact),
        `51${normalizePhone(trimmedContact)}`,
        `+51${normalizePhone(trimmedContact)}`,
      ])]);
  const { data, error } = await filteredQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Could not look up reservation: " + error.message);
  }

  const order = (data as OrderLookupRow | null) ?? null;
  return order && matchesContact(order, contact) ? order : null;
}

async function readBatch(batchId: string | null) {
  if (!batchId) return null;

  const { data, error } = await createSupabaseAdminClient()
    .from("batches")
    .select("name, delivery_date")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not read batch for tracking: " + error.message);
  }

  return (data as BatchLookupRow | null) ?? null;
}

export async function findTrackedOrder(input: unknown) {
  const missing = getMissingReservationEnv();
  if (missing.length) {
    throw new TrackLookupError("Tracking is not configured right now.", 503);
  }

  const payload: TrackLookupInput = trackLookupSchema.parse(input);
  let order = payload.orderCode ? await readOrderByCode(payload.orderCode) : null;

  if (!order && payload.contact) {
    order = await readOrderByContact(payload.contact);
  }

  if (!order) {
    throw new TrackLookupError("We could not find a reservation with those details.", 404);
  }

  const batch = await readBatch(order.batch_id);

  return {
    batchName: batch?.name ?? null,
    createdAt: order.created_at,
    customerName: order.customer_name,
    deliveryDate: batch?.delivery_date ?? null,
    district: order.district,
    history: [...(order.order_status_history ?? [])]
      .filter((item) => item?.new_status)
      .map((item) => ({ createdAt: item.created_at, status: item.new_status }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    items: [...(order.order_items ?? [])]
      .map((item) => ({
        flavorName: item.flavor_name,
        flavorSlug: item.flavor_slug,
        quantity: item.quantity,
      }))
      .sort((a, b) => a.flavorName.localeCompare(b.flavorName)),
    orderCode: order.order_code,
    packName: order.pack_name,
    packUnits: order.pack_units,
    paymentProvider: order.payment_provider,
    paymentStatus: order.payment_status,
    status: order.status,
    totalAmount: Number(order.total_amount),
    updatedAt: order.updated_at,
  } satisfies PublicTrackedOrder;
}
