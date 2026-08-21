import { z } from "zod";

export const trackLookupSchema = z.object({
  orderCode: z.string().trim().max(40, "Order number is too long.").default(""),
  contact: z.string().trim().max(254, "Email or WhatsApp is too long.").default(""),
  website: z.string().trim().max(0, "Invalid submission.").optional().default(""),
}).superRefine((payload, ctx) => {
  if (!payload.orderCode && !payload.contact) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter an email, WhatsApp number, or order number.",
      path: ["contact"],
    });
  }

  if (payload.orderCode && payload.orderCode.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid order number.",
      path: ["orderCode"],
    });
  }

  if (payload.contact) {
    const validEmail = payload.contact.includes("@") && z.string().email().safeParse(payload.contact).success;
    const validWhatsApp = !payload.contact.includes("@") && payload.contact.replace(/\D/g, "").length >= 7;

    if (!validEmail && !validWhatsApp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email or WhatsApp number.",
        path: ["contact"],
      });
    }
  }
}).transform((payload) => ({
  ...payload,
  orderCode: payload.orderCode.toUpperCase(),
}));

export type TrackLookupInput = z.infer<typeof trackLookupSchema>;
