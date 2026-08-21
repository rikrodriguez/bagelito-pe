import { NextResponse } from "next/server";
import { getReservationBatchAvailability } from "@/lib/reservations/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const batch = await getReservationBatchAvailability();

  return NextResponse.json(batch, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
