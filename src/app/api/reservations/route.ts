import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createReservation } from "@/lib/reservations/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { orderCode } = await createReservation(formData);
    return NextResponse.json({ ok: true, orderCode });
  } catch (error) {
    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not submit reservation.";

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
