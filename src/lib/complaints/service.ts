import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { complaintPayloadSchema, type ComplaintPayload } from "./schema";

export type ComplaintRecord = {
  id: string;
  complaint_code: string;
  consumer_name: string;
  document_type: string;
  document_number: string;
  consumer_address: string;
  phone: string;
  email: string;
  is_minor: boolean;
  representative_name: string | null;
  representative_document: string | null;
  item_type: "product" | "service";
  amount: number | string;
  item_description: string;
  request_type: "reclamo" | "queja";
  detail: string;
  requested_action: string;
  privacy_accepted: boolean;
  status: "received" | "in_review" | "responded" | "closed";
  provider_actions: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

function isMissingComplaintsSchema(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("consumer_complaints") || message.includes("next_complaint_code");
}
async function nextComplaintCode(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase.rpc("next_complaint_code");

  if (error || typeof data !== "string") {
    if (isMissingComplaintsSchema(error)) {
      throw new Error("El Libro de Reclamaciones aún no está configurado.");
    }
    throw new Error("No se pudo generar la numeración de la hoja.");
  }

  return data;
}

export async function createComplaint(input: unknown) {
  const payload: ComplaintPayload = complaintPayloadSchema.parse(input);
  const supabase = createSupabaseAdminClient();
  const complaintCode = await nextComplaintCode(supabase);

  const { data, error } = await supabase
    .from("consumer_complaints")
    .insert({
      amount: payload.amount,
      complaint_code: complaintCode,
      consumer_address: payload.consumerAddress,
      consumer_name: payload.consumerName,
      detail: payload.detail,
      document_number: payload.documentNumber.toUpperCase(),
      document_type: payload.documentType,
      email: payload.email.toLowerCase(),
      is_minor: payload.isMinor,
      item_description: payload.itemDescription,
      item_type: payload.itemType,
      phone: payload.phone,
      privacy_accepted: payload.privacyAccepted,
      representative_document: payload.isMinor ? payload.representativeDocument.toUpperCase() : null,
      representative_name: payload.isMinor ? payload.representativeName : null,
      request_type: payload.requestType,
      requested_action: payload.requestedAction,
      status: "received",
    })
    .select("complaint_code, created_at")
    .single();

  if (error || !data) {
    if (isMissingComplaintsSchema(error)) {
      throw new Error("El Libro de Reclamaciones aún no está configurado.");
    }
    throw new Error("No se pudo guardar la hoja de reclamación.");
  }

  return data as { complaint_code: string; created_at: string };
}

export async function fetchComplaintsForAdmin() {
  const { data, error } = await createSupabaseAdminClient()
    .from("consumer_complaints")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingComplaintsSchema(error)) {
      return { complaints: [] as ComplaintRecord[], schemaReady: false };
    }
    throw new Error(error.message);
  }

  return { complaints: (data ?? []) as ComplaintRecord[], schemaReady: true };
}
