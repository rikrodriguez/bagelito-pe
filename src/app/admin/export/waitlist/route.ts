import { requireAdmin } from "@/lib/admin/auth";
import { fetchWaitlistSignups } from "@/lib/admin/queries";

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
    ],
  ];

  for (const signup of signups) {
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
