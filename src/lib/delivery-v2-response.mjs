import { previewDeliveryV2 } from './delivery-v2-preview.mjs';

/** Public response contract. Never expose a payable amount or a verified address. */
export function buildDeliveryPreviewResponse(district) {
  return Object.freeze({
    ...previewDeliveryV2(district),
    quoteStatus: 'review_required',
    paymentStatus: 'not_requested',
    checkoutEnabled: false,
    disclaimer: 'Estimado referencial. Cobertura, dirección, disponibilidad y monto final sujetos a confirmación.'
  });
}
