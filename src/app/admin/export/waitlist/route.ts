import { requireAdmin } from "@/lib/admin/auth";
import { fetchWaitlistSignups } from "@/lib/admin/queries";
import { campaignFromWaitlistSource } from "@/lib/waitlist/attribution";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  await requireAdmin();
  const { signups } = await fetchWaitlistSignups();
  const rows = [
    [
      "Waitlist ID",
      "List date",
      "List label",
      "Created at",
      "Status",
      "Customer",
      "WhatsApp",
      "Email",
      "Preferred pack slug",
      "Preferred pack",
      "Contact preference",
      "Language",
      "Source",
      "Notes",
      "Contacted at",
      "Batch ID",
      "UTM source",
      "UTM medium",
      "UTM campaign",
      "UTM content",
      "UTM term",
    ],
  ];

  for (const signup of signups) {
    const campaign = campaignFromWaitlistSource(signup.source);
    rows.push([
      signup.id,
      signup.list_date,
      signup.list_label,
      signup.created_at,
      signup.status,
      signup.customer_name,
      signup.whatsapp,
      signup.email,
      signup.preferred_pack_slug ?? "",
      signup.preferred_pack_name ?? "",
      signup.contact_preference,
      signup.locale,
      signup.source,
      signup.notes ?? "",
      signup.contacted_at ?? "",
      signup.batch_id ?? "",
      campaign?.utm_source ?? "",
      campaign?.utm_medium ?? "",
      campaign?.utm_campaign ?? "",
      campaign?.utm_content ?? "",
      campaign?.utm_term ?? "",
    ]);
  }

  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename=bagelito-waitlist-${date}.csv`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
