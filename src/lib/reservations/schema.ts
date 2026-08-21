import { z } from "zod";
import { getFlavorBySlug, getPackBySlug, isPackSlug } from "@/lib/catalog";
import { districtOptions } from "@/lib/delivery-pricing";

export { districtOptions };

export const paymentMethodOptions = ["Yape", "Plin"] as const;

const itemSchema = z.object({
  flavorSlug: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

const reservationBaseShape = {
  packSlug: z.string().refine(isPackSlug, "Invalid pack selected."),
  items: z.array(itemSchema).min(1),
  customerName: z.string().trim().min(2, "Full name is required."),
  whatsapp: z.string().trim().min(7, "WhatsApp number is required."),
  email: z.string().trim().email("Enter a valid email."),
  website: z.string().trim().max(0, "Invalid submission.").optional().default(""),
  deliveryAddress: z.string().trim().min(5, "Delivery address is required."),
  district: z.enum(districtOptions as [string, ...string[]]),
  addressReference: z.string().trim().optional().default(""),
  deliveryNotes: z.string().trim().optional().default(""),
  deliveryHandoff: z.enum(["self", "porteria"]).default("self"),
  marketingOptIn: z.boolean().default(false),
};

function validatePackItems(
  payload: {
    extraPack?: boolean;
    items: Array<{ flavorSlug: string; quantity: number }>;
    packSlug: string;
  },
  ctx: z.RefinementCtx,
) {
  const pack = getPackBySlug(payload.packSlug);

  if (!pack) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["packSlug"], message: "Invalid pack selected." });
    return;
  }

  const expectedUnits = pack.units * (payload.extraPack ? 2 : 1);

  for (const item of payload.items) {
    if (!getFlavorBySlug(item.flavorSlug)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Invalid flavor selected." });
    }
  }

  if (pack.packType === "mixed") {
    const total = payload.items.reduce((sum, item) => sum + item.quantity, 0);
    if (total !== expectedUnits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: `Select exactly ${expectedUnits} bagels.` });
    }
    return;
  }

  if (payload.items.length !== 1 || payload.items[0]?.quantity !== expectedUnits) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: `Choose one flavor for all ${expectedUnits} bagels.` });
  }
}

export const reservationPayloadSchema = z.object({
  ...reservationBaseShape,
  paymentMethod: z.enum(paymentMethodOptions),
  paymentTransactionNumber: z.string().trim().min(3, "Payment transaction number is required."),
  paymentHolderName: z.string().trim().min(2, "Payment holder name is required."),
  paymentPhoneNumber: z.string().trim().min(7, "Payment phone number is required."),
  exactAmountConfirmed: z.boolean().refine((value) => value, "Exact payment amount must be confirmed."),
  termsAccepted: z.boolean().refine((value) => value, "Monthly batch terms must be accepted."),
}).superRefine(validatePackItems);

export const culqiReservationPayloadSchema = z.object({
  ...reservationBaseShape,
  checkoutSessionId: z.string().uuid("Invalid checkout session."),
  extraPack: z.boolean().default(false),
  termsAccepted: z.boolean().refine((value) => value, "Monthly batch terms must be accepted."),
}).superRefine(validatePackItems);

export type ReservationPayload = z.infer<typeof reservationPayloadSchema>;
export type CulqiReservationPayload = z.infer<typeof culqiReservationPayloadSchema>;

export function parseItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}
