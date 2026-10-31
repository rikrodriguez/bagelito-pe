import { z } from "zod";

// Recovery contract v1 is frozen independently of the current catalog, delivery
// configuration and fresh-purchase rules. Keep field order, coercion, defaults
// and serialization compatible with the published v1 fingerprint vectors.
const districtV1 = [
  "Lince", "Jesus Maria", "San Isidro", "Miraflores", "San Borja", "Pueblo Libre",
  "Magdalena", "Surquillo", "La Victoria", "Cercado de Lima", "Brena", "Barranco",
  "San Miguel", "Surco", "Santiago de Surco", "San Luis", "Chorrillos", "La Molina",
  "Rimac", "San Juan de Miraflores", "Ate", "Los Olivos", "San Martin de Porres",
  "Villa El Salvador", "Villa Maria del Triunfo", "Other",
] as const;

const requestV1Schema = z.object({
  operationId: z.string().uuid("A stable reservation operation ID is required.")
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Use a random UUID v4 operation ID.")
    .transform((value) => value.toLowerCase()),
  packSlug: z.string().min(1),
  items: z.array(z.object({ flavorSlug: z.string().min(1), quantity: z.coerce.number().int().positive() })).min(1),
  customerName: z.string().trim().min(2, "Full name is required."),
  whatsapp: z.string().trim().min(7, "WhatsApp number is required."),
  email: z.string().trim().email("Enter a valid email."),
  website: z.string().trim().max(0, "Invalid submission.").optional().default(""),
  deliveryAddress: z.string().trim().min(5, "Delivery address is required."),
  district: z.enum(districtV1),
  addressReference: z.string().trim().optional().default(""),
  deliveryNotes: z.string().trim().optional().default(""),
  deliveryHandoff: z.enum(["self", "porteria"]).default("self"),
  marketingOptIn: z.boolean().default(false),
  paymentMethod: z.enum(["Yape", "Plin"]),
  paymentTransactionNumber: z.string().trim().min(3, "Payment transaction number is required."),
  paymentHolderName: z.string().trim().min(2, "Payment holder name is required."),
  paymentPhoneNumber: z.string().trim().min(7, "Payment phone number is required."),
  exactAmountConfirmed: z.boolean().refine((value) => value, "Exact payment amount must be confirmed."),
  termsAccepted: z.boolean().refine((value) => value, "Monthly batch terms must be accepted."),
});

export type ManualRequestV1 = z.infer<typeof requestV1Schema>;

export function manualRequestV1FromFormData(formData: FormData): ManualRequestV1 {
  let items: unknown = [];
  const serializedItems = formData.get("items");
  if (typeof serializedItems === "string") {
    try { items = JSON.parse(serializedItems); } catch { /* Invalid items fail the schema below. */ }
  }
  return requestV1Schema.parse({
    operationId: formData.get("operationId"), packSlug: formData.get("packSlug"), items,
    customerName: formData.get("customerName"), whatsapp: formData.get("whatsapp"), email: formData.get("email"),
    website: formData.get("website") ?? "", deliveryAddress: formData.get("deliveryAddress"), district: formData.get("district"),
    addressReference: formData.get("addressReference") ?? "", deliveryNotes: formData.get("deliveryNotes") ?? "",
    deliveryHandoff: formData.get("deliveryHandoff") ?? "self", marketingOptIn: formData.get("marketingOptIn") === "true",
    paymentMethod: formData.get("paymentMethod"), paymentTransactionNumber: formData.get("paymentTransactionNumber"),
    paymentHolderName: formData.get("paymentHolderName"), paymentPhoneNumber: formData.get("paymentPhoneNumber"),
    exactAmountConfirmed: formData.get("exactAmountConfirmed") === "true", termsAccepted: formData.get("termsAccepted") === "true",
  });
}

export function canonicalManualRequestV1(payload: ManualRequestV1) {
  // Explicit field order also freezes serialization for callers constructing a
  // typed object in another order. Never infer an operation from equal contents.
  return {
    packSlug: payload.packSlug,
    items: payload.items.map((item) => ({ flavorSlug: item.flavorSlug, quantity: item.quantity })),
    customerName: payload.customerName, whatsapp: payload.whatsapp, email: payload.email.toLowerCase(),
    website: payload.website, deliveryAddress: payload.deliveryAddress, district: payload.district,
    addressReference: payload.addressReference, deliveryNotes: payload.deliveryNotes,
    deliveryHandoff: payload.deliveryHandoff, marketingOptIn: payload.marketingOptIn,
    paymentMethod: payload.paymentMethod, paymentTransactionNumber: payload.paymentTransactionNumber,
    paymentHolderName: payload.paymentHolderName, paymentPhoneNumber: payload.paymentPhoneNumber,
    exactAmountConfirmed: payload.exactAmountConfirmed, termsAccepted: payload.termsAccepted,
  };
}

export function manualOwnerV1HashInput(payload: ManualRequestV1) {
  const normalized = canonicalManualRequestV1(payload);
  return JSON.stringify({ email: normalized.email, whatsapp: normalized.whatsapp });
}

export function manualRequestV1HashInput(payload: ManualRequestV1, proof: { sha256: string; type: string; size: number }) {
  return JSON.stringify({ version: 1, request: canonicalManualRequestV1(payload),
    proof: { sha256: proof.sha256, type: proof.type, size: proof.size } });
}
