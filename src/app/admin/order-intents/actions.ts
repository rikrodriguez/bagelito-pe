"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertReviewTransition, normalizeReviewNote } from "@/lib/order-intents/review-state";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateOrderIntentReview(formData: FormData) {
  await requireAdmin();
  if (process.env.BAGELITO_ORDER_INTENTS_ADMIN_ENABLED !== "true") {
    redirect("/admin/order-intents?error=disabled");
  }
  const id = String(formData.get("intentId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "");
  const note = normalizeReviewNote(String(formData.get("reviewNote") ?? ""));
  if (!UUID.test(id)) throw new Error("Invalid order request identifier");

  const db = createSupabaseAdminClient();
  const { data: existing, error: readError } = await db.from("order_intents")
    .select("status").eq("store_id", "bagelito-01").eq("source", "web")
    .eq("id", id).maybeSingle();
  if (readError || !existing) throw new Error("Order request not found or database unavailable");

  // Only human-review statuses: never payment_status, customer/order totals,
  // delivery commitment, inventory or message/send fields.
  assertReviewTransition(existing.status, nextStatus);
  const { data: updated, error: updateError } = await db.from("order_intents")
    .update({ status: nextStatus, review_note: note, reviewed_at: new Date().toISOString() })
    .eq("id", id).eq("store_id", "bagelito-01").eq("source", "web")
    .eq("status", existing.status).select("id").maybeSingle();

  if (updateError) throw new Error("Could not save human review");
  if (!updated?.id) throw new Error("Request changed during review; refresh and try again");

  revalidatePath("/admin/order-intents");
  redirect("/admin/order-intents?updated=1");
}
