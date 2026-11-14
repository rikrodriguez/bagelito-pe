/**
 * P0 temporary hard stop for legacy Bagelito reservations.
 *
 * The current service computes shipping with distance-based V1 prices. Until
 * a trusted server verifies a Delivery V2 destination and fee and binds that
 * result to the order, neither manual-proof nor Culqi reservation creation
 * is allowed to reach storage, uploads, or payment initiation.
 *
 * This is intentionally unconditional. Do not introduce a browser flag,
 * environment bypass or a client-provided "verified" field to release it.
 * Replace this guard only together with an audited server-owned V2 quote.
 */
export class DeliveryV2VerificationRequired extends Error {
  constructor() {
    super("Delivery V2 verification is required before reservations or payments can be started.");
    this.name = "DeliveryV2VerificationRequired";
  }
}

export function requireVerifiedDeliveryV2Pricing(): void {
  throw new DeliveryV2VerificationRequired();
}
