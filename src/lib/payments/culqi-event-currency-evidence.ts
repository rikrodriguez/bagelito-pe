/**
 * Culqi may omit currency in a verified charge.creation.succeeded event.
 * Fetch the independently authenticated charge and complete ONLY that field.
 * Never overwrite a present currency (valid, contradictory or null).
 */
type JsonRecord = Record<string, unknown>;
type ChargeGetter = (chargeId: string) => Promise<unknown>;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function reject(): never {
  throw new Error("Authenticated Culqi charge evidence is incomplete or inconsistent.");
}

export async function resolveVerifiedCulqiChargeCurrency(
  eventType: string,
  eventResource: JsonRecord,
  getCharge: ChargeGetter,
): Promise<JsonRecord> {
  if (eventType !== "charge.creation.succeeded" || !record(eventResource)
    || eventResource.object !== "charge"
    || Object.hasOwn(eventResource, "currency_code") || Object.hasOwn(eventResource, "currency")) {
    return eventResource;
  }
  const id = eventResource.id;
  const amount = eventResource.amount;
  const source = eventResource.source;
  const metadata = eventResource.metadata;
  if (typeof id !== "string" || !/^chr_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(id)
    || !Number.isSafeInteger(amount) || (amount as number) <= 0
    || !record(source) || typeof source.id !== "string"
    || !/^(?:tkn|ype)_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(source.id)
    || id.split("_")[1] !== source.id.split("_")[1]
    || !record(metadata) || typeof metadata.bagelito_order_code !== "string"
    || !/^BAG-[A-Z0-9_-]{1,80}$/.test(metadata.bagelito_order_code)) reject();

  // fetchCulqiCharge checks the configured key/environment, exact URL and
  // requested charge ID, deadline, and forbids redirects. It issues GET only.
  const charge = await getCharge(id);
  if (!record(charge) || charge.object !== "charge" || charge.id !== id
    || !Number.isSafeInteger(charge.amount) || charge.amount !== amount
    || !Object.hasOwn(charge, "currency_code") || charge.currency_code !== "PEN"
    || (Object.hasOwn(charge, "currency") && charge.currency !== "PEN")
    || !record(charge.metadata)
    || charge.metadata.bagelito_order_code !== metadata.bagelito_order_code
    || !record(charge.source) || charge.source.id !== source.id
    || charge.capture !== true
    || !Number.isSafeInteger(charge.current_amount) || charge.current_amount !== amount
    || charge.amount_refunded !== 0 || charge.dispute !== false) reject();

  // Do not modify the authenticated event stored in p_verified_payload.
  // SQL independently binds the enriched event amount/currency to the order.
  return { ...eventResource, currency_code: "PEN" };
}
