import { z } from "zod";
import { isPackSlug } from "@/lib/catalog";
import { defaultLocale } from "@/lib/i18n";

export const waitlistContactPreferences = ["whatsapp", "email", "both"] as const;

export const waitlistPayloadSchema = z.object({
  customerName: z.string().trim().min(2, "Full name is required."),
  whatsapp: z.string().trim().min(7, "WhatsApp number is required."),
  email: z.string().trim().email("Enter a valid email."),
  preferredPackSlug: z.string().trim().optional().default("").refine((value) => !value || isPackSlug(value), "Invalid pack selected."),
  contactPreference: z.enum(waitlistContactPreferences).default("whatsapp"),
  locale: z.enum(["en", "es"]).default(defaultLocale),
  notes: z.string().trim().max(500, "Notes must be 500 characters or less.").optional().default(""),
  source: z.string().trim().max(80).optional().default("waitlist_page"),
  consentAccepted: z.boolean().refine((value) => value, "Waitlist consent is required."),
});

export type WaitlistPayload = z.infer<typeof waitlistPayloadSchema>;
