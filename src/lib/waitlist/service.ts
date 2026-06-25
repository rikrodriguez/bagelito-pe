import { getPackBySlug } from "@/lib/catalog";
import { getMissingReservationEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { waitlistPayloadSchema, type WaitlistPayload } from "./schema";

function getLimaListDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Lima",
    year: "numeric",
  }).format(new Date());
}

async function readCurrentBatchId() {
  const { data, error } = await createSupabaseAdminClient()
    .from("batches")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Could not read current batch: " + error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

export async function createWaitlistSignup(input: unknown) {
  const missing = getMissingReservationEnv();
  if (missing.length) throw new Error("Missing required environment variables: " + missing.join(", "));

  const payload: WaitlistPayload = waitlistPayloadSchema.parse(input);
  const preferredPack = payload.preferredPackSlug ? getPackBySlug(payload.preferredPackSlug) : null;
  const listDate = getLimaListDate();
  const supabase = createSupabaseAdminClient();
  const batchId = await readCurrentBatchId();

  const { data, error } = await supabase
    .from("waitlist_signups")
    .insert({
      batch_id: batchId,
      contact_preference: payload.contactPreference,
      consent_accepted: payload.consentAccepted,
      customer_name: payload.customerName,
      email: payload.email,
      list_date: listDate,
      list_label: `Waitlist ${listDate}`,
      locale: payload.locale,
      notes: payload.notes || null,
      preferred_pack_name: preferredPack?.name ?? null,
      preferred_pack_slug: preferredPack?.slug ?? null,
      source: payload.source || "waitlist_page",
      status: "new",
      whatsapp: payload.whatsapp,
    })
    .select("id, list_date, list_label")
    .single();

  if (error) {
    if (error.code === "42P01" || error.message.toLowerCase().includes("waitlist_signups")) {
      throw new Error("Waitlist storage is not configured yet. Run the Supabase waitlist SQL migration first.");
    }
    throw new Error("Could not join waitlist: " + error.message);
  }

  return data as { id: string; list_date: string; list_label: string };
}
