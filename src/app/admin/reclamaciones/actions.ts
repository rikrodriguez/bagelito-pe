"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { complaintStatuses } from "@/lib/complaints/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const updateComplaintSchema = z.object({
  complaintId: z.string().uuid(),
  providerActions: z.string().trim().max(4_000),
  status: z.enum(complaintStatuses),
}).superRefine((payload, context) => {
  if ((payload.status === "responded" || payload.status === "closed") && payload.providerActions.length < 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Registra las acciones o la respuesta antes de marcar el caso como respondido.",
      path: ["providerActions"],
    });
  }
});

export async function updateComplaint(formData: FormData) {
  await requireAdmin();

  const parsed = updateComplaintSchema.safeParse({
    complaintId: String(formData.get("complaintId") ?? ""),
    providerActions: String(formData.get("providerActions") ?? ""),
    status: String(formData.get("status") ?? ""),
  });

  if (!parsed.success) {
    redirect(`/admin/reclamaciones?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos.")}`);
  }

  const { complaintId, providerActions, status } = parsed.data;
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("consumer_complaints")
    .select("responded_at")
    .eq("id", complaintId)
    .maybeSingle();

  if (readError || !existing) {
    redirect(`/admin/reclamaciones?error=${encodeURIComponent("No se encontró la hoja para actualizar.")}`);
  }

  const { data: updated, error } = await supabase
    .from("consumer_complaints")
    .update({
      provider_actions: providerActions || null,
      responded_at: status === "responded" || status === "closed"
        ? existing.responded_at ?? new Date().toISOString()
        : null,
      status,
    })
    .eq("id", complaintId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    redirect(`/admin/reclamaciones?error=${encodeURIComponent("No se pudo guardar la actualización.")}`);
  }

  revalidatePath("/admin/reclamaciones");
  redirect("/admin/reclamaciones?updated=1");
}
