/**
 * Read-only Delivery V2 preview. No address geocoding, order creation, PII
 * storage, route origins, tracking links, payment intents or charge amounts.
 */
import { previewDeliveryReview } from "../../../../lib/delivery-v2/review-only.js";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function failure(status: number, reason: string) {
  return Response.json({ ok: false, error: reason }, { status, headers });
}

export async function POST(request: Request) {
  const type = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") {
    return failure(415, "JSON request required.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 1024)) {
    return failure(413, "Request too large.");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return failure(413, "Request too large.");
    body = JSON.parse(raw);
  } catch {
    return failure(400, "Invalid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "district") ||
      typeof (body as { district: unknown }).district !== "string") {
    return failure(400, "Only a delivery district is accepted.");
  }

  try {
    const delivery = previewDeliveryReview((body as { district: string }).district);
    return Response.json({ ok: true, delivery }, { status: 200, headers });
  } catch {
    return failure(422, "Delivery district requires manual verification.");
  }
}
