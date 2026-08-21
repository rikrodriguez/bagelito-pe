import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDeliveryDistanceKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { isBatchAcceptingOrders } from "@/lib/batch-availability";

export const productionStatuses = ["payment_confirmed", "in_production", "ready_for_delivery", "delivered"] as const;
export const batchStatuses = ["waitlist_open", "orders_open", "closed", "in_production", "delivered"] as const;

export type BatchStatus = (typeof batchStatuses)[number];

export type Batch = {
  id: string;
  name: string;
  status: BatchStatus;
  orders_open_at: string | null;
  orders_close_at: string | null;
  delivery_date: string | null;
  capacity_packs: number | null;
  capacity_bagels: number | null;
  ingredient_cost_per_bagel?: number | string | null;
  packaging_cost_per_pack?: number | string | null;
  actual_delivery_cost?: number | string | null;
  other_batch_cost?: number | string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  flavor_slug: string;
  flavor_name: string;
  quantity: number;
};

export type StatusHistory = {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  order_code: string;
  batch_id: string | null;
  pack_slug: string;
  pack_name: string;
  pack_units: number;
  pack_type: string;
  customer_name: string;
  whatsapp: string;
  email: string;
  delivery_address: string;
  district: string;
  address_reference: string | null;
  delivery_notes: string | null;
  marketing_opt_in: boolean;
  total_amount: number;
  payment_method: string | null;
  payment_transaction_number: string | null;
  payment_holder_name: string | null;
  payment_phone_number: string | null;
  payment_screenshot_path: string | null;
  payment_provider?: "manual" | "culqi" | string | null;
  payment_status?: "pending" | "paid" | "failed" | "expired" | "refunded" | string | null;
  payment_order_id?: string | null;
  payment_charge_id?: string | null;
  payment_amount_minor?: number | null;
  payment_paid_at?: string | null;
  payment_expires_at?: string | null;
  payment_failure_code?: string | null;
  payment_failure_message?: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  order_status_history?: StatusHistory[];
};

export type WaitlistSignup = {
  id: string;
  batch_id: string | null;
  list_date: string;
  list_label: string;
  customer_name: string;
  whatsapp: string;
  email: string;
  preferred_pack_slug: string | null;
  preferred_pack_name: string | null;
  contact_preference: "whatsapp" | "email" | "both";
  locale: "en" | "es";
  source: string;
  notes: string | null;
  consent_accepted: boolean;
  status: "new" | "notified" | "converted" | "archived";
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ArchiveableOrder = {
  order_status_history?: StatusHistory[];
};

export function getOrderArchiveState(order: ArchiveableOrder) {
  const latestArchiveEvent = [...(order.order_status_history ?? [])]
    .filter((item) => item.new_status === "archived" || item.new_status === "unarchived")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return {
    isArchived: latestArchiveEvent?.new_status === "archived",
    archivedAt: latestArchiveEvent?.new_status === "archived" ? latestArchiveEvent.created_at : null,
    archivedBy: latestArchiveEvent?.new_status === "archived" ? latestArchiveEvent.changed_by : null,
  };
}

export function isOrderArchived(order: ArchiveableOrder) {
  return getOrderArchiveState(order).isArchived;
}

export function filterActiveOrders<T extends ArchiveableOrder>(orders: T[]) {
  return orders.filter((order) => !isOrderArchived(order));
}

export function filterArchivedOrders<T extends ArchiveableOrder>(orders: T[]) {
  return orders.filter(isOrderArchived);
}

export async function fetchOrders() {
  const { data, error } = await createSupabaseAdminClient()
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function fetchWaitlistSignups() {
  const { data, error } = await createSupabaseAdminClient()
    .from("waitlist_signups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42P01" || error.message.toLowerCase().includes("waitlist_signups")) {
      return {
        schemaReady: false,
        signups: [] as WaitlistSignup[],
      };
    }

    throw new Error(error.message);
  }

  return {
    schemaReady: true,
    signups: (data ?? []) as WaitlistSignup[],
  };
}

export async function fetchCurrentBatch() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as Batch;

  const { data: created, error: createError } = await supabase
    .from("batches")
    .insert({ name: "Next Bagelito Batch", status: "waitlist_open" })
    .select("*")
    .single();

  if (createError || !created) throw new Error(createError?.message ?? "Could not create current batch.");
  return created as Batch;
}

export async function fetchOrderByCode(orderCode: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .eq("order_code", orderCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Order | null;
}

export function isManualPaymentPending(order: Order) {
  return order.payment_provider !== "culqi" && order.payment_transaction_number === "PENDING_PAYMENT";
}

export function hasUploadedPaymentProof(order: Pick<Order, "payment_screenshot_path">) {
  const path = order.payment_screenshot_path ?? "";
  return Boolean(path) && !path.startsWith("payment-pending/");
}

export function getPaymentDisplay(order: Pick<Order, "payment_method" | "payment_transaction_number" | "payment_provider" | "payment_status">) {
  if (order.payment_provider === "culqi") {
    const status = order.payment_status === "paid" ? "confirmed" : order.payment_status ?? "pending";
    return `Culqi · ${status}`;
  }

  if (order.payment_transaction_number === "PENDING_PAYMENT") return "Manual proof pending";
  return [order.payment_method, order.payment_transaction_number].filter(Boolean).join(" - ") || "Payment pending";
}

export function getCustomerDeliveryNote(order: Pick<Order, "delivery_notes"> | string | null | undefined) {
  const rawNotes = typeof order === "string" || order == null ? order : order.delivery_notes;
  if (!rawNotes) return null;

  const cleaned = rawNotes
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^delivery:/i.test(part))
    .filter((part) => !/^recepci[oó]n:/i.test(part))
    .filter((part) => !/^reception:/i.test(part))
    .join(" | ");

  return cleaned || null;
}

export type CustomerFlavorPreference = {
  flavorName: string;
  quantity: number;
  orders: number;
};

export type CustomerDistrictPreference = {
  district: string;
  orders: number;
};

export type CustomerProfile = {
  key: string;
  customerName: string;
  whatsapp: string;
  email: string;
  district: string;
  firstOrderAt: string;
  lastOrderAt: string;
  lastPurchaseAt: string | null;
  totalOrders: number;
  paidOrders: number;
  deliveredOrders: number;
  repeatOrders: number;
  totalSpent: number;
  totalReservedValue: number;
  totalBagels: number;
  marketingOptIn: boolean;
  favoriteFlavors: CustomerFlavorPreference[];
  districts: CustomerDistrictPreference[];
  orders: Order[];
};

function normalizeCustomerPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length === 11) return digits.slice(2);
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

function normalizeCustomerEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function getCustomerKey(order: Pick<Order, "email" | "id" | "whatsapp">) {
  const phone = normalizeCustomerPhone(order.whatsapp);
  if (phone) return `phone:${phone}`;

  const email = normalizeCustomerEmail(order.email);
  if (email) return `email:${email}`;

  return `order:${order.id}`;
}

function isConfirmedCustomerOrder(order: Pick<Order, "status">) {
  return productionStatuses.includes(order.status as (typeof productionStatuses)[number]);
}

function buildFlavorPreferences(orders: Order[]) {
  const map = new Map<string, CustomerFlavorPreference>();

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const current = map.get(item.flavor_name) ?? { flavorName: item.flavor_name, quantity: 0, orders: 0 };
      current.quantity += Number(item.quantity);
      current.orders += 1;
      map.set(item.flavor_name, current);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.orders - a.orders || a.flavorName.localeCompare(b.flavorName, "es"));
}

function buildDistrictPreferences(orders: Order[]) {
  const map = new Map<string, CustomerDistrictPreference>();

  for (const order of orders) {
    const current = map.get(order.district) ?? { district: order.district, orders: 0 };
    current.orders += 1;
    map.set(order.district, current);
  }

  return Array.from(map.values()).sort((a, b) => b.orders - a.orders || a.district.localeCompare(b.district, "es"));
}

function sortCustomerOrders(orders: Order[]) {
  return [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getCustomerProfiles(orders: Order[]) {
  const groups = new Map<string, Order[]>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const key = getCustomerKey(order);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }

  return Array.from(groups.entries()).map(([key, customerOrders]) => {
    const sortedOrders = sortCustomerOrders(customerOrders);
    const latest = sortedOrders[0];
    const first = sortedOrders.at(-1) ?? latest;
    const paidOrders = sortedOrders.filter(isConfirmedCustomerOrder);
    const flavorSource = paidOrders.length ? paidOrders : sortedOrders;
    const lastPurchase = paidOrders[0] ?? null;

    return {
      key,
      customerName: latest.customer_name,
      whatsapp: latest.whatsapp,
      email: latest.email,
      district: latest.district,
      firstOrderAt: first.created_at,
      lastOrderAt: latest.created_at,
      lastPurchaseAt: lastPurchase?.created_at ?? null,
      totalOrders: sortedOrders.length,
      paidOrders: paidOrders.length,
      deliveredOrders: sortedOrders.filter((order) => order.status === "delivered").length,
      repeatOrders: Math.max(0, sortedOrders.length - 1),
      totalSpent: paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
      totalReservedValue: sortedOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
      totalBagels: paidOrders.reduce((sum, order) => sum + Number(order.pack_units), 0),
      marketingOptIn: sortedOrders.some((order) => order.marketing_opt_in),
      favoriteFlavors: buildFlavorPreferences(flavorSource),
      districts: buildDistrictPreferences(sortedOrders),
      orders: sortedOrders,
    } satisfies CustomerProfile;
  }).sort((a, b) =>
    b.totalSpent - a.totalSpent
      || b.totalOrders - a.totalOrders
      || new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()
      || a.customerName.localeCompare(b.customerName, "es"),
  );
}

export function findCustomerProfileForOrder(targetOrder: Pick<Order, "email" | "id" | "whatsapp">, orders: Order[]) {
  const targetKey = getCustomerKey(targetOrder);
  return getCustomerProfiles(orders).find((profile) => profile.key === targetKey) ?? null;
}

export function getCustomerCrmStats(profiles: CustomerProfile[]) {
  const repeatCustomers = profiles.filter((profile) => profile.repeatOrders > 0).length;
  const totalSpent = profiles.reduce((sum, profile) => sum + profile.totalSpent, 0);
  const totalPaidOrders = profiles.reduce((sum, profile) => sum + profile.paidOrders, 0);
  const lastPurchaseAt = profiles
    .map((profile) => profile.lastPurchaseAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return {
    totalCustomers: profiles.length,
    repeatCustomers,
    repeatRate: profiles.length ? Math.round((repeatCustomers / profiles.length) * 100) : 0,
    totalSpent,
    averageCustomerValue: profiles.length ? Math.round(totalSpent / profiles.length) : 0,
    totalPaidOrders,
    lastPurchaseAt,
    topCustomer: profiles[0] ?? null,
  };
}

export function getDashboardStats(orders: Order[]) {
  const activeOrders = filterActiveOrders(orders);
  const byStatus = new Map<string, number>();
  const packBreakdown = new Map<string, number>();
  const flavorBreakdown = new Map<string, number>();
  let confirmedRevenue = 0;
  let confirmedBagels = 0;

  for (const order of activeOrders) {
    byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
    packBreakdown.set(order.pack_name, (packBreakdown.get(order.pack_name) ?? 0) + 1);

    if (productionStatuses.includes(order.status as (typeof productionStatuses)[number])) {
      confirmedRevenue += Number(order.total_amount);
      confirmedBagels += Number(order.pack_units);
      for (const item of order.order_items ?? []) {
        flavorBreakdown.set(item.flavor_name, (flavorBreakdown.get(item.flavor_name) ?? 0) + item.quantity);
      }
    }
  }

  return {
    total: activeOrders.length,
    pending: byStatus.get("payment_pending_review") ?? 0,
    confirmed: byStatus.get("payment_confirmed") ?? 0,
    needsCorrection: byStatus.get("needs_correction") ?? 0,
    cancelled: byStatus.get("cancelled") ?? 0,
    confirmedRevenue,
    confirmedBagels,
    packBreakdown: Array.from(packBreakdown.entries()),
    flavorBreakdown: Array.from(flavorBreakdown.entries()),
  };
}

export function isBatchAcceptingReservations(batch: Pick<Batch, "orders_close_at" | "status">) {
  return isBatchAcceptingOrders(batch.status, batch.orders_close_at);
}

export function getBatchStats(batch: Batch, orders: Order[]) {
  const batchOrders = filterActiveOrders(orders).filter((order) => order.batch_id === batch.id && order.status !== "cancelled");
  const confirmedOrders = batchOrders.filter((order) => productionStatuses.includes(order.status as (typeof productionStatuses)[number]));
  const reservedPacks = batchOrders.length;
  const reservedBagels = batchOrders.reduce((sum, order) => sum + Number(order.pack_units), 0);
  const confirmedPacks = confirmedOrders.length;
  const confirmedBagels = confirmedOrders.reduce((sum, order) => sum + Number(order.pack_units), 0);
  const packCapacity = Number(batch.capacity_packs ?? 0);
  const bagelCapacity = Number(batch.capacity_bagels ?? 0);
  const remainingPacks = packCapacity ? Math.max(0, packCapacity - reservedPacks) : null;
  const remainingBagels = bagelCapacity ? Math.max(0, bagelCapacity - reservedBagels) : null;
  const packPercent = packCapacity ? Math.min(100, Math.round((reservedPacks / packCapacity) * 100)) : 0;
  const bagelPercent = bagelCapacity ? Math.min(100, Math.round((reservedBagels / bagelCapacity) * 100)) : 0;

  return {
    acceptingReservations: isBatchAcceptingReservations(batch),
    reservedPacks,
    reservedBagels,
    confirmedPacks,
    confirmedBagels,
    remainingPacks,
    remainingBagels,
    packPercent,
    bagelPercent,
  };
}

export function getProductionSummary(orders: Order[]) {
  const summary = new Map<string, number>();

  for (const order of filterActiveOrders(orders)) {
    if (!productionStatuses.includes(order.status as (typeof productionStatuses)[number])) continue;
    for (const item of order.order_items ?? []) {
      summary.set(item.flavor_name, (summary.get(item.flavor_name) ?? 0) + item.quantity);
    }
  }

  return Array.from(summary.entries()).map(([flavorName, quantity]) => ({ flavorName, quantity }));
}

export function getDeliverySummary(orders: Order[]) {
  const groups = new Map<string, { district: string; orders: Order[]; packs: number; bagels: number }>();

  for (const order of filterActiveOrders(orders)) {
    if (!productionStatuses.includes(order.status as (typeof productionStatuses)[number])) continue;
    const current = groups.get(order.district) ?? { district: order.district, orders: [], packs: 0, bagels: 0 };
    current.orders.push(order);
    current.packs += 1;
    current.bagels += Number(order.pack_units);
    groups.set(order.district, current);
  }

  return Array.from(groups.values()).sort((a, b) => a.district.localeCompare(b.district));
}

export type DeliveryRouteStop = {
  stopNumber: number;
  district: string;
  distanceKm: number;
  deliveryFee: number;
  orders: Order[];
  packs: number;
  bagels: number;
  received: number;
  pendingHandoff: number;
};

export type ProductionPackingItem = {
  flavorName: string;
  quantity: number;
  orderCodes: string[];
  customers: string[];
};

export type ProductionPackItem = {
  packSlug: string;
  packName: string;
  packs: number;
  bagels: number;
  orderCodes: string[];
};

export type ProductionStageKey = "bake" | "pack" | "deliver" | "done";

export type ProductionStage = {
  key: ProductionStageKey;
  label: string;
  description: string;
  status: string;
  nextStatus: string | null;
  actionLabel: string | null;
  orders: Order[];
  packs: number;
  bagels: number;
};

export type ProductionOpsPlan = {
  batchId: string;
  batchName: string;
  deliveryDate: string | null;
  orders: Order[];
  totalPacks: number;
  totalBagels: number;
  totalRevenue: number;
  packingList: ProductionPackingItem[];
  packList: ProductionPackItem[];
  stages: ProductionStage[];
};

export type FinancialCostSettings = {
  ingredientCostPerBagel: number;
  packagingCostPerPack: number;
  actualDeliveryCost: number;
  otherBatchCost: number;
};

export const defaultFinancialCosts: FinancialCostSettings = {
  ingredientCostPerBagel: 3.2,
  packagingCostPerPack: 1.5,
  actualDeliveryCost: 0,
  otherBatchCost: 0,
};

export type FinancialPackMetric = {
  packSlug: string;
  packName: string;
  reservedPacks: number;
  confirmedPacks: number;
  pendingPacks: number;
  deliveredPacks: number;
  bagels: number;
  confirmedSales: number;
  productRevenue: number;
  deliveryCollected: number;
  ingredientCost: number;
  packagingCost: number;
  grossMargin: number;
  grossMarginRate: number;
  marginPerPack: number;
};

export type FinancialSummary = {
  batchId: string;
  batchName: string;
  confirmedSales: number;
  confirmedProductSales: number;
  pendingSales: number;
  deliveryCollected: number;
  deliveryPending: number;
  confirmedPacks: number;
  pendingPacks: number;
  reservedPacks: number;
  confirmedBagels: number;
  estimatedProductCost: number;
  estimatedPackagingCost: number;
  actualDeliveryCost: number;
  otherBatchCost: number;
  estimatedTotalCost: number;
  estimatedGrossMargin: number;
  estimatedGrossMarginRate: number;
  deliverySurplus: number;
  estimatedNetProfit: number;
  estimatedNetProfitRate: number;
  packMetrics: FinancialPackMetric[];
  costs: FinancialCostSettings;
  costSchemaReady: boolean;
};

function readBatchMoney(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getFinancialCostSettings(batch: Partial<Batch>): FinancialCostSettings {
  return {
    ingredientCostPerBagel: readBatchMoney(batch.ingredient_cost_per_bagel, defaultFinancialCosts.ingredientCostPerBagel),
    packagingCostPerPack: readBatchMoney(batch.packaging_cost_per_pack, defaultFinancialCosts.packagingCostPerPack),
    actualDeliveryCost: readBatchMoney(batch.actual_delivery_cost, defaultFinancialCosts.actualDeliveryCost),
    otherBatchCost: readBatchMoney(batch.other_batch_cost, defaultFinancialCosts.otherBatchCost),
  };
}

function hasFinancialCostColumns(batch: Partial<Batch>) {
  return "ingredient_cost_per_bagel" in batch
    && "packaging_cost_per_pack" in batch
    && "actual_delivery_cost" in batch
    && "other_batch_cost" in batch;
}

function parseDeliveryFeeFromNotes(notes: string | null | undefined) {
  const match = notes?.match(/Delivery:\s*S\/\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

export function getOrderDeliveryFee(order: Pick<Order, "delivery_notes" | "district" | "total_amount">) {
  const parsed = parseDeliveryFeeFromNotes(order.delivery_notes);
  const fee = Number.isFinite(parsed) && parsed !== null ? parsed : getDeliveryFee(order.district);
  return Math.min(Math.max(0, fee), Math.max(0, Number(order.total_amount)));
}

function getOrderProductRevenue(order: Pick<Order, "delivery_notes" | "district" | "total_amount">) {
  return Math.max(0, Number(order.total_amount) - getOrderDeliveryFee(order));
}

function isPendingFinancialOrder(order: Pick<Order, "status">) {
  return order.status === "payment_pending_review" || order.status === "needs_correction";
}

export function getFinancialSummary(batch: Pick<Batch, "actual_delivery_cost" | "id" | "ingredient_cost_per_bagel" | "name" | "other_batch_cost" | "packaging_cost_per_pack">, orders: Order[]): FinancialSummary {
  const activeOrders = filterActiveOrders(orders).filter((order) => order.status !== "cancelled");
  const batchOrders = activeOrders.filter((order) => order.batch_id === batch.id);
  const confirmedOrders = batchOrders.filter((order) => productionStatuses.includes(order.status as (typeof productionStatuses)[number]));
  const pendingOrders = batchOrders.filter(isPendingFinancialOrder);
  const packMap = new Map<string, FinancialPackMetric>();
  const costs = getFinancialCostSettings(batch);
  const costSchemaReady = hasFinancialCostColumns(batch);

  for (const order of batchOrders) {
    const pack = packMap.get(order.pack_slug) ?? {
      packSlug: order.pack_slug,
      packName: order.pack_name,
      reservedPacks: 0,
      confirmedPacks: 0,
      pendingPacks: 0,
      deliveredPacks: 0,
      bagels: 0,
      confirmedSales: 0,
      productRevenue: 0,
      deliveryCollected: 0,
      ingredientCost: 0,
      packagingCost: 0,
      grossMargin: 0,
      grossMarginRate: 0,
      marginPerPack: 0,
    };

    pack.reservedPacks += 1;
    if (productionStatuses.includes(order.status as (typeof productionStatuses)[number])) {
      const productRevenue = getOrderProductRevenue(order);
      pack.confirmedPacks += 1;
      pack.bagels += Number(order.pack_units);
      pack.confirmedSales += Number(order.total_amount);
      pack.productRevenue += productRevenue;
      pack.deliveryCollected += getOrderDeliveryFee(order);
    }
    if (isPendingFinancialOrder(order)) pack.pendingPacks += 1;
    if (order.status === "delivered") pack.deliveredPacks += 1;
    packMap.set(order.pack_slug, pack);
  }

  const packMetrics = Array.from(packMap.values()).map((pack) => {
    const ingredientCost = pack.bagels * costs.ingredientCostPerBagel;
    const packagingCost = pack.confirmedPacks * costs.packagingCostPerPack;
    const grossMargin = pack.productRevenue - ingredientCost - packagingCost;

    return {
      ...pack,
      ingredientCost,
      packagingCost,
      grossMargin,
      grossMarginRate: pack.productRevenue ? Math.round((grossMargin / pack.productRevenue) * 100) : 0,
      marginPerPack: pack.confirmedPacks ? grossMargin / pack.confirmedPacks : 0,
    };
  }).sort((a, b) => b.confirmedPacks - a.confirmedPacks || b.reservedPacks - a.reservedPacks || a.packName.localeCompare(b.packName, "es"));

  const deliveryCollected = confirmedOrders.reduce((sum, order) => sum + getOrderDeliveryFee(order), 0);
  const confirmedSales = confirmedOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const confirmedProductSales = confirmedOrders.reduce((sum, order) => sum + getOrderProductRevenue(order), 0);
  const confirmedBagels = confirmedOrders.reduce((sum, order) => sum + Number(order.pack_units), 0);
  const estimatedProductCost = confirmedBagels * costs.ingredientCostPerBagel;
  const estimatedPackagingCost = confirmedOrders.length * costs.packagingCostPerPack;
  const actualDeliveryCost = costs.actualDeliveryCost;
  const otherBatchCost = costs.otherBatchCost;
  const deliverySurplus = deliveryCollected - actualDeliveryCost;
  const estimatedTotalCost = estimatedProductCost + estimatedPackagingCost + actualDeliveryCost + otherBatchCost;
  const estimatedGrossMargin = confirmedProductSales - estimatedProductCost - estimatedPackagingCost;
  const estimatedNetProfit = confirmedSales - estimatedTotalCost;

  return {
    batchId: batch.id,
    batchName: batch.name,
    confirmedSales,
    confirmedProductSales,
    pendingSales: pendingOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
    deliveryCollected,
    deliveryPending: pendingOrders.reduce((sum, order) => sum + getOrderDeliveryFee(order), 0),
    confirmedPacks: confirmedOrders.length,
    pendingPacks: pendingOrders.length,
    reservedPacks: batchOrders.length,
    confirmedBagels,
    estimatedProductCost,
    estimatedPackagingCost,
    actualDeliveryCost,
    otherBatchCost,
    estimatedTotalCost,
    estimatedGrossMargin,
    estimatedGrossMarginRate: confirmedProductSales ? Math.round((estimatedGrossMargin / confirmedProductSales) * 100) : 0,
    deliverySurplus,
    estimatedNetProfit,
    estimatedNetProfitRate: confirmedSales ? Math.round((estimatedNetProfit / confirmedSales) * 100) : 0,
    packMetrics,
    costs,
    costSchemaReady,
  };
}

function isDeliveryRouteOrder(order: Order) {
  return productionStatuses.includes(order.status as (typeof productionStatuses)[number]);
}

function sortOrdersForOps(orders: Order[]) {
  return [...orders].sort((a, b) =>
    a.pack_name.localeCompare(b.pack_name, "es")
      || a.customer_name.localeCompare(b.customer_name, "es")
      || a.order_code.localeCompare(b.order_code, "es"),
  );
}

function getProductionOrdersForBatch(batch: Pick<Batch, "id">, orders: Order[]) {
  return sortOrdersForOps(
    filterActiveOrders(orders).filter((order) =>
      order.batch_id === batch.id && productionStatuses.includes(order.status as (typeof productionStatuses)[number]),
    ),
  );
}

export function getProductionOpsPlan(batch: Pick<Batch, "id" | "name" | "delivery_date">, orders: Order[]): ProductionOpsPlan {
  const productionOrders = getProductionOrdersForBatch(batch, orders);
  const packingMap = new Map<string, ProductionPackingItem>();
  const packMap = new Map<string, ProductionPackItem>();

  for (const order of productionOrders) {
    const pack = packMap.get(order.pack_slug) ?? {
      packSlug: order.pack_slug,
      packName: order.pack_name,
      packs: 0,
      bagels: 0,
      orderCodes: [],
    };
    pack.packs += 1;
    pack.bagels += Number(order.pack_units);
    pack.orderCodes.push(order.order_code);
    packMap.set(order.pack_slug, pack);

    for (const item of order.order_items ?? []) {
      const current = packingMap.get(item.flavor_name) ?? {
        flavorName: item.flavor_name,
        quantity: 0,
        orderCodes: [],
        customers: [],
      };
      current.quantity += Number(item.quantity);
      current.orderCodes.push(order.order_code);
      current.customers.push(order.customer_name);
      packingMap.set(item.flavor_name, current);
    }
  }

  const makeStage = (
    key: ProductionStageKey,
    label: string,
    description: string,
    status: string,
    nextStatus: string | null,
    actionLabel: string | null,
  ): ProductionStage => {
    const stageOrders = productionOrders.filter((order) => order.status === status);
    return {
      key,
      label,
      description,
      status,
      nextStatus,
      actionLabel,
      orders: stageOrders,
      packs: stageOrders.length,
      bagels: stageOrders.reduce((sum, order) => sum + Number(order.pack_units), 0),
    };
  };

  return {
    batchId: batch.id,
    batchName: batch.name,
    deliveryDate: batch.delivery_date,
    orders: productionOrders,
    totalPacks: productionOrders.length,
    totalBagels: productionOrders.reduce((sum, order) => sum + Number(order.pack_units), 0),
    totalRevenue: productionOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
    packingList: Array.from(packingMap.values()).sort((a, b) => b.quantity - a.quantity || a.flavorName.localeCompare(b.flavorName, "es")),
    packList: Array.from(packMap.values()).sort((a, b) => b.bagels - a.bagels || a.packName.localeCompare(b.packName, "es")),
    stages: [
      makeStage("bake", "Bake", "Paid orders that can move into baking.", "payment_confirmed", "in_production", "Start baking"),
      makeStage("pack", "Pack", "Orders in production that need packing and final checks.", "in_production", "ready_for_delivery", "Mark packed"),
      makeStage("deliver", "Deliver", "Packs ready to leave for the delivery route.", "ready_for_delivery", "delivered", "Mark delivered"),
      makeStage("done", "Received", "Customers who already received their order.", "delivered", null, null),
    ],
  };
}

function sortDeliveryOrders(orders: Order[]) {
  return [...orders].sort((a, b) => {
    const aReceived = a.status === "delivered";
    const bReceived = b.status === "delivered";

    if (aReceived !== bReceived) return aReceived ? 1 : -1;

    return a.delivery_address.localeCompare(b.delivery_address, "es")
      || a.customer_name.localeCompare(b.customer_name, "es")
      || a.order_code.localeCompare(b.order_code, "es");
  });
}

export function getDeliveryRoutePlan(orders: Order[]) {
  const groups = new Map<string, Omit<DeliveryRouteStop, "stopNumber">>();

  for (const order of filterActiveOrders(orders)) {
    if (!isDeliveryRouteOrder(order)) continue;
    const current = groups.get(order.district) ?? {
      district: order.district,
      distanceKm: getDeliveryDistanceKm(order.district),
      deliveryFee: getDeliveryFee(order.district),
      orders: [],
      packs: 0,
      bagels: 0,
      received: 0,
      pendingHandoff: 0,
    };

    current.orders.push(order);
    current.packs += 1;
    current.bagels += Number(order.pack_units);
    if (order.status === "delivered") {
      current.received += 1;
    } else {
      current.pendingHandoff += 1;
    }
    groups.set(order.district, current);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.distanceKm - b.distanceKm || a.district.localeCompare(b.district, "es"))
    .map((group, index) => ({
      ...group,
      stopNumber: index + 1,
      orders: sortDeliveryOrders(group.orders),
    }));
}
