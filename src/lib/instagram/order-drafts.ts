export type OrderDraftLine = {
  key: string;
  name: string;
  quantity: number;
  unitPrice?: number | null;
};

export type OrderDraft = {
  id?: string;
  version?: number;
  status?: string | null;
  salesStage?: string | null;
  packSlug?: string | null;
  packName?: string | null;
  units?: number | null;
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
  district?: string | null;
  address?: string | null;
  addressReference?: string | null;
  deliveryNotes?: string | null;
  requestedDate?: string | null;
  customRequest?: string | null;
  items?: OrderDraftLine[];
  schmears?: OrderDraftLine[];
  subtotal?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  currency?: "PEN" | null;
  paymentMethod?: string | null;
  paymentStatus?:
    | "none"
    | "pending"
    | "evidence_received"
    | "confirmed"
    | "failed"
    | null;
  paymentEvidencePath?: string | null;
  finalOrderId?: string | null;
};

export type OrderDraftPriceContext = {
  itemPrices: Record<string, number>;
  schmearPrices?: Record<string, number>;
  deliveryFee: number;
};

export type OrderDraftTotals = {
  itemsSubtotal: number;
  schmearsSubtotal: number;
  deliveryFee: number;
  total: number;
  currency: "PEN";
};

export type OrderDraftValidation = {
  valid: boolean;
  errors: string[];
  missingFields: string[];
  normalizedPaymentStatus: NonNullable<OrderDraft["paymentStatus"]>;
  requiresPaymentVerification: boolean;
};

export type ProductionDraft = Pick<
  OrderDraft,
  "status" | "paymentStatus" | "district" | "total" | "items"
>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("es").replace(/\s+/g, "-");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mergeLines(current: OrderDraftLine[] = [], patch: OrderDraftLine[] = []) {
  const map = new Map<string, OrderDraftLine>();
  const order: string[] = [];

  for (const line of current) {
    const key = normalizeKey(line.key || line.name);
    if (!key) continue;
    map.set(key, { ...line, key: line.key || key });
    order.push(key);
  }

  for (const line of patch) {
    const key = normalizeKey(line.key || line.name);
    if (!key || !Number.isFinite(line.quantity)) continue;

    if (line.quantity <= 0) {
      map.delete(key);
      continue;
    }

    if (!map.has(key)) order.push(key);
    map.set(key, {
      ...map.get(key),
      ...line,
      key: line.key || key,
      name: cleanString(line.name) || map.get(key)?.name || key,
      quantity: line.quantity,
    });
  }

  return order.filter((key) => map.has(key)).map((key) => map.get(key)!);
}

export function mergeOrderDraft(current: OrderDraft, patch: OrderDraft): OrderDraft {
  const merged: OrderDraft = { ...current };
  const scalarKeys: Array<keyof Omit<OrderDraft, "items" | "schmears">> = [
    "id",
    "version",
    "status",
    "salesStage",
    "packSlug",
    "packName",
    "units",
    "customerName",
    "phone",
    "email",
    "district",
    "address",
    "addressReference",
    "deliveryNotes",
    "requestedDate",
    "customRequest",
    "subtotal",
    "deliveryFee",
    "total",
    "currency",
    "paymentMethod",
    "paymentStatus",
    "paymentEvidencePath",
    "finalOrderId",
  ];

  for (const key of scalarKeys) {
    const value = patch[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    (merged as Record<string, unknown>)[key] = value;
  }

  if (patch.items) merged.items = mergeLines(current.items, patch.items);
  if (patch.schmears) merged.schmears = mergeLines(current.schmears, patch.schmears);

  return merged;
}

function lineSubtotal(lines: OrderDraftLine[], prices: Record<string, number>) {
  return roundMoney(
    lines.reduce((total, line) => {
      const key = normalizeKey(line.key || line.name);
      const price = prices[key] ?? line.unitPrice;
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new Error(`missing_live_price:${key}`);
      }
      return total + price * line.quantity;
    }, 0),
  );
}

export function calculateOrderDraftTotals(
  draft: OrderDraft,
  prices: OrderDraftPriceContext,
): OrderDraftTotals {
  if (!Number.isFinite(prices.deliveryFee) || prices.deliveryFee < 0) {
    throw new Error("invalid_delivery_fee");
  }

  const normalizedItemPrices = Object.fromEntries(
    Object.entries(prices.itemPrices).map(([key, value]) => [normalizeKey(key), value]),
  );
  const normalizedSchmearPrices = Object.fromEntries(
    Object.entries(prices.schmearPrices ?? {}).map(([key, value]) => [normalizeKey(key), value]),
  );

  const itemsSubtotal = lineSubtotal(draft.items ?? [], normalizedItemPrices);
  const schmearsSubtotal = lineSubtotal(draft.schmears ?? [], normalizedSchmearPrices);
  const deliveryFee = roundMoney(prices.deliveryFee);

  return {
    itemsSubtotal,
    schmearsSubtotal,
    deliveryFee,
    total: roundMoney(itemsSubtotal + schmearsSubtotal + deliveryFee),
    currency: "PEN",
  };
}

function normalizePaymentStatus(status: OrderDraft["paymentStatus"]) {
  return status ?? "none";
}

export function validateOrderDraft(draft: OrderDraft): OrderDraftValidation {
  const errors: string[] = [];
  const missingFields: string[] = [];
  const itemQuantity = (draft.items ?? []).reduce((total, item) => total + item.quantity, 0);

  if (!(draft.items ?? []).some((item) => item.quantity > 0)) missingFields.push("items");
  if (!cleanString(draft.customerName)) missingFields.push("customer_name");
  if (!cleanString(draft.phone)) missingFields.push("phone");
  if (!cleanString(draft.district)) missingFields.push("district");
  if (!cleanString(draft.address)) missingFields.push("address");

  if (typeof draft.units === "number" && itemQuantity !== draft.units) {
    errors.push("item_quantity_mismatch");
  }

  for (const line of [...(draft.items ?? []), ...(draft.schmears ?? [])]) {
    if (!cleanString(line.name) || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      errors.push("invalid_order_line");
      break;
    }
  }

  if (typeof draft.total === "number" && draft.total < 0) errors.push("invalid_total");
  if (draft.currency && draft.currency !== "PEN") errors.push("invalid_currency");

  const normalizedPaymentStatus = normalizePaymentStatus(draft.paymentStatus);
  const requiresPaymentVerification = normalizedPaymentStatus === "evidence_received";

  if (normalizedPaymentStatus === "confirmed" && !draft.finalOrderId) {
    errors.push("payment_confirmation_requires_operational_reference");
  }

  return {
    valid: errors.length === 0 && missingFields.length === 0,
    errors,
    missingFields,
    normalizedPaymentStatus,
    requiresPaymentVerification,
  };
}

export function getProductionSummary(drafts: ProductionDraft[]) {
  const bagelsByFlavor: Record<string, number> = {};
  const ordersByDistrict: Record<string, number> = {};
  let confirmedRevenue = 0;
  let pipelineValue = 0;
  let paymentPendingOrders = 0;

  for (const draft of drafts) {
    for (const item of draft.items ?? []) {
      const key = normalizeKey(item.key || item.name);
      bagelsByFlavor[key] = (bagelsByFlavor[key] ?? 0) + item.quantity;
    }

    const district = cleanString(draft.district);
    if (district) ordersByDistrict[district] = (ordersByDistrict[district] ?? 0) + 1;

    const total = typeof draft.total === "number" && Number.isFinite(draft.total)
      ? draft.total
      : 0;
    pipelineValue += total;

    if (draft.paymentStatus === "confirmed") confirmedRevenue += total;
    if (draft.paymentStatus === "pending" || draft.paymentStatus === "evidence_received") {
      paymentPendingOrders += 1;
    }
  }

  return {
    bagelsByFlavor: Object.fromEntries(
      Object.entries(bagelsByFlavor).sort(([left], [right]) => left.localeCompare(right)),
    ),
    ordersByDistrict: Object.fromEntries(
      Object.entries(ordersByDistrict).sort(([left], [right]) => left.localeCompare(right)),
    ),
    confirmedRevenue: roundMoney(confirmedRevenue),
    pipelineValue: roundMoney(pipelineValue),
    paymentPendingOrders,
  };
}

export function buildCrmIdempotencyKey(
  entityType: "contact" | "opportunity" | "order",
  entityId: string,
  version: number,
) {
  const cleanEntityId = entityId.trim();
  if (!cleanEntityId || !Number.isInteger(version) || version < 1) {
    throw new Error("invalid_crm_idempotency_input");
  }
  return `ghl:${entityType}:${cleanEntityId}:v${version}`;
}
