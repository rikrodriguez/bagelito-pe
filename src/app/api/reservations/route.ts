import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { trackBagelitoServerEvent } from "@/lib/server-analytics";
import { createReservation } from "@/lib/reservations/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { amount, orderCode, packSlug } = await createReservation(formData);
    await trackBagelitoServerEvent("Reservation Created", { pack: packSlug, amount }, request);
    return NextResponse.json({ ok: true, orderCode });
  } catch (error) {
    await trackBagelitoServerEvent("Reservation API Error", {
      status: 400,
      type: error instanceof ZodError ? "validation" : "server",
    }, request);

    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : error instanceof Error
        ? error.message
        : "Could not submit reservation.";

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
