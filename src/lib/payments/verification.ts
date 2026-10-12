export type CulqiPaymentResource = {
  amount?: number;
  currency?: string;
  currency_code?: string;
  id?: string;
};

/** Culqi's event API documents data as a serialized JSON resource. */
export function parseCulqiEventResource(value: unknown): Record<string, unknown> | null {
  let resource = value;
  if (typeof resource === "string") {
    try { resource = JSON.parse(resource); } catch { return null; }
  }
  return resource !== null && typeof resource === "object" && !Array.isArray(resource)
    ? resource as Record<string, unknown>
    : null;
}

/** Only fields returned by the authenticated Culqi event lookup may be used. */
export function verifyCulqiEventIdentity(
  requestedId: string,
  event: { id?: string; type?: string },
): string {
  if (event.id !== requestedId || typeof event.type !== "string" || !event.type.trim()) {
    throw new Error("Culqi returned an invalid event identity or type.");
  }
  return event.type;
}

/** Missing payment fields fail closed just like mismatched payment fields. */
export function verifyCulqiPaymentAmount(
  resource: CulqiPaymentResource,
  expectedAmount: number,
): void {
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    throw new Error("The Bagelito order has an invalid payment amount.");
  }
  if (!Number.isSafeInteger(resource.amount) || resource.amount !== expectedAmount) {
    throw new Error("Webhook amount does not match the Bagelito order.");
  }
  const currency = resource.currency_code ?? resource.currency;
  if (currency !== "PEN"
    || (resource.currency_code !== undefined && resource.currency_code !== "PEN")
    || (resource.currency !== undefined && resource.currency !== "PEN")) {
    throw new Error("Unexpected or missing payment currency.");
  }
}

export function nextCulqiOrderStatus(
  currentStatus: string,
  paymentStatus: "expired" | "failed" | "paid" | "pending",
): string {
  // A second successful event must not reset an order already in fulfillment.
  if (paymentStatus === "paid") {
    const fulfillmentStatuses = new Set([
      "payment_confirmed", "in_production", "ready_for_delivery", "delivered",
    ]);
    return fulfillmentStatuses.has(currentStatus) ? currentStatus : "payment_confirmed";
  }
  if (paymentStatus === "expired") return "cancelled";
  if (paymentStatus === "failed") return "needs_correction";
  return currentStatus;
}
