/**
 * SERVER-ONLY Delivery V2 quotation gate.
 *
 * IMPORTANT: The default destination verifier is intentionally unconfigured.
 * No customer/browser JSON may impersonate trusted geocoding, operator review,
 * inventory authorization or a provider payment event.
 *
 * The live API stays review-required until the owner authorizes a verifiable
 * server-side customer-address/sector checker. No private kitchen location.
 */
import {
  quoteDeliveryTier,
  TARIFF_VERSION,
  type TrustedDestinationEvidence,
} from "./delivery-private-tiers";

export type CustomerDeliveryRequest = Readonly<{
  district: string;
  deliveryAddress: string;
  addressReference?: string;
}>;

export type VerifiedDestinationResolver = (
  request: CustomerDeliveryRequest,
) => Promise<TrustedDestinationEvidence | null>;

export class DeliveryV2ReviewRequiredError extends Error {
  readonly code = "DELIVERY_V2_REVIEW_REQUIRED";
  readonly statusCode = 409;

  constructor() {
    super("Delivery address verification is pending. No payment can be requested.");
    this.name = "DeliveryV2ReviewRequiredError";
  }
}

export type VerifiedDeliveryV2Charge = Readonly<{
  district: string;
  tier: "adjacent" | "regular" | "distant" | "very-distant";
  tariffVersion: typeof TARIFF_VERSION;
  feeMinor: 800 | 1000 | 1500 | 2000;
  feeSoles: number;
}>;

/** For server dependency injection and isolated tests, never a public endpoint. */
export function createVerifiedDeliveryV2Service(
  verifyDestination: VerifiedDestinationResolver,
): (request: CustomerDeliveryRequest) => Promise<VerifiedDeliveryV2Charge> {
  if (typeof verifyDestination !== "function") {
    throw new TypeError("Trusted destination resolver is required.");
  }

  return async (request) => {
    if (
      !request || typeof request !== "object" ||
      typeof request.district !== "string" ||
      typeof request.deliveryAddress !== "string" ||
      request.deliveryAddress.trim().length < 8
    ) {
      throw new DeliveryV2ReviewRequiredError();
    }

    // Verification MUST be performed by private server-only geocoding or a
    // genuinely authorized operator. Never copy request.verifiedDestination.
    const verifiedDestination = await verifyDestination({
      district: request.district,
      deliveryAddress: request.deliveryAddress,
      addressReference: request.addressReference,
    });

    const quote = quoteDeliveryTier({
      district: request.district,
      fullAddress: request.deliveryAddress,
      verifiedDestination,
    });
    if (
      quote.status !== "quoted" || quote.payable !== true ||
      quote.feeMinor === null ||
      !([800, 1000, 1500, 2000] as number[]).includes(quote.feeMinor)
    ) {
      throw new DeliveryV2ReviewRequiredError();
    }
    return {
      district: quote.district,
      tier: quote.tier as VerifiedDeliveryV2Charge["tier"],
      tariffVersion: TARIFF_VERSION,
      feeMinor: quote.feeMinor as VerifiedDeliveryV2Charge["feeMinor"],
      feeSoles: quote.feeMinor / 100,
    };
  };
}

/**
 * CURRENT TARGET: NO trusted resolver installed, so all reservation payment
 * paths fail closed. This is deliberately separate from a district estimate.
 */
export const requireVerifiedDeliveryV2 = createVerifiedDeliveryV2Service(
  async () => null,
);
