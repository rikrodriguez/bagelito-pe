/**
 * PUBLIC / REVIEW-ONLY Delivery V2 preview. Never creates a payable quote.
 * Uses the owner-approved district and sector policy imported without edits.
 * Final delivery requires trusted server-verified CUSTOMER address + capacity.
 * Do not accept client-supplied "trusted evidence" or dispatch coordinates.
 */
import {previewDeliveryTier, TARIFF_VERSION} from './delivery-private-tiers.js';

export type DeliveryReviewOnly = Readonly<{
  district: string;
  province: 'Lima'|'Callao';
  tariffVersion: typeof TARIFF_VERSION;
  estimatedFeeMinor: number|null;
  deliveryMinor: null;
  totalMinor: null;
  payable: false;
  status: 'review_required';
  reason: 'ADDRESS_VERIFICATION_REQUIRED'|'MANUAL_DELIVERY_REVIEW';
}>;

export function previewDeliveryReview(district: unknown): DeliveryReviewOnly {
  const estimate = previewDeliveryTier(district);
  return Object.freeze({
    district: estimate.district,
    province: estimate.province,
    tariffVersion: TARIFF_VERSION,
    estimatedFeeMinor: estimate.estimatedFeeMinor,
    deliveryMinor: null,
    totalMinor: null,
    payable: false,
    status: 'review_required',
    reason: estimate.status === 'manual-review'
      ? 'MANUAL_DELIVERY_REVIEW'
      : 'ADDRESS_VERIFICATION_REQUIRED',
  });
}
