import { z } from "zod";

export const trackLookupSchema = z.object({
  orderCode: z.string().trim().max(40, "Order number is too long.").default(""),
  contact: z.string().trim().max(254, "Email or WhatsApp is too long.").default(""),
  website: z.string().trim().max(0, "Invalid submission.").optional().default(""),
}).superRefine((payload, ctx) => {
  if (!/^BAG-[A-Z0-9_-]{1,36}$/.test(payload.orderCode.toUpperCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the order number from your reservation.",
      path: ["orderCode"],
    });
  }
  if (!payload.contact.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the email or WhatsApp number used for that order.",
      path: ["contact"],
    });
  }

  if (payload.contact) {
    const validEmail = payload.contact.includes("@") && z.string().email().safeParse(payload.contact).success;
    const digits = payload.contact.replace(/\D/g, "");
    const validWhatsApp = !payload.contact.includes("@") && /^(?:51)?9\d{8}$/.test(digits);

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
