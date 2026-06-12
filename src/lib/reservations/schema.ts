import { z } from "zod";
import { getFlavorBySlug, getPackBySlug, isPackSlug } from "@/lib/catalog";

export const districtOptions = [
  "Miraflores",
  "San Isidro",
  "Barranco",
  "Surco",
  "San Borja",
  "La Molina",
  "Magdalena",
  "San Miguel",
  "Jesus Maria",
  "Lince",
  "Pueblo Libre",
  "Surquillo",
  "Other",
] as const;

const itemSchema = z.object({
  flavorSlug: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const reservationPayloadSchema = z.object({
  packSlug: z.string().refine(isPackSlug, "Invalid pack selected."),
  items: z.array(itemSchema).min(1),
  customerName: z.string().trim().min(2, "Full name is required."),
  whatsapp: z.string().trim().min(7, "WhatsApp number is required."),
  email: z.string().trim().email("Enter a valid email."),
  deliveryAddress: z.string().trim().min(5, "Delivery address is required."),
  district: z.enum(districtOptions),
  addressReference: z.string().trim().optional().default(""),
  deliveryNotes: z.string().trim().optional().default(""),
  deliveryHandoff: z.enum(["self", "porteria"]).default("self"),
  termsAccepted: z.boolean().refine((value) => value, "Monthly batch terms must be accepted."),
}).superRefine((payload, ctx) => {
  const pack = getPackBySlug(payload.packSlug);

  if (!pack) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["packSlug"], message: "Invalid pack selected." });
    return;
  }

  for (const item of payload.items) {
    if (!getFlavorBySlug(item.flavorSlug)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Invalid flavor selected." });
    }
  }

  if (pack.packType === "mixed") {
    const total = payload.items.reduce((sum, item) => sum + item.quantity, 0);
    if (total !== pack.units) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: `Select exactly ${pack.units} bagels.` });
    }
    return;
  }

  if (payload.items.length !== 1 || payload.items[0]?.quantity !== pack.units) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: `Choose one flavor for all ${pack.units} bagels.` });
  }
});

export type ReservationPayload = z.infer<typeof reservationPayloadSchema>;

export function parseItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}
