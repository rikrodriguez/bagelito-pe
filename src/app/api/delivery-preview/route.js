import { NextResponse } from 'next/server';
import { buildDeliveryPreviewResponse } from '@/lib/delivery-v2-response.mjs';

// Read-only preview. Never accepts addresses, customer data, prices or payment proof.
// Not a payment quote; production reservations remain behind merchant review.
export const runtime = 'nodejs';
export async function GET(request) {
  const url = new URL(request.url);
  const district = url.searchParams.get('district');
  return NextResponse.json(buildDeliveryPreviewResponse(district), {
    headers: { 'Cache-Control': 'no-store' }
  });
}
