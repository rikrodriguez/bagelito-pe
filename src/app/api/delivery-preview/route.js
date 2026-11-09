import { NextResponse } from 'next/server';
import { previewDeliveryV2 } from '@/lib/delivery-v2-preview.mjs';

// Read-only preview. Never accepts addresses, customer data, prices or payment proof.
// Not a payment quote; production reservations remain behind merchant review.
export const runtime = 'nodejs';
export async function GET(request) {
  const url = new URL(request.url);
  const district = url.searchParams.get('district');
  const result = previewDeliveryV2(district);
  return NextResponse.json({
    ...result,
    quoteStatus: 'review_required',
    paymentStatus: 'not_requested',
    checkoutEnabled: false,
    disclaimer: 'Estimado referencial. Cobertura, dirección, disponibilidad y monto final sujetos a confirmación.'
  }, { headers: { 'Cache-Control': 'no-store' } });
}
