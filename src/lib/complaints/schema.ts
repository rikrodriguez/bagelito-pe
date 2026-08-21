import { z } from "zod";

export const complaintDocumentTypes = ["DNI", "CE", "PASSPORT", "RUC"] as const;
export const complaintItemTypes = ["product", "service"] as const;
export const complaintRequestTypes = ["reclamo", "queja"] as const;
export const complaintStatuses = ["received", "in_review", "responded", "closed"] as const;

const amountSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number({ invalid_type_error: "Ingresa el monto del producto o servicio." })
  .min(0, "El monto no puede ser negativo.")
  .max(9_999_999, "El monto ingresado es demasiado alto."));

export const complaintPayloadSchema = z.object({
  consumerName: z.string().trim().min(3, "Ingresa tus nombres y apellidos.").max(160),
  documentType: z.enum(complaintDocumentTypes),
  documentNumber: z.string().trim().min(5, "Ingresa un documento válido.").max(20),
  consumerAddress: z.string().trim().min(6, "Ingresa tu domicilio.").max(260),
  phone: z.string().trim().min(7, "Ingresa un teléfono válido.").max(30),
  email: z.string().trim().email("Ingresa un email válido.").max(254),
  isMinor: z.boolean().default(false),
  representativeName: z.string().trim().max(160).optional().default(""),
  representativeDocument: z.string().trim().max(20).optional().default(""),
  itemType: z.enum(complaintItemTypes),
  amount: amountSchema,
  itemDescription: z.string().trim().min(5, "Describe el producto o servicio.").max(2_000),
  requestType: z.enum(complaintRequestTypes),
  detail: z.string().trim().min(20, "Describe lo ocurrido con un poco más de detalle.").max(4_000),
  requestedAction: z.string().trim().min(5, "Indica qué solución solicitas.").max(2_000),
  privacyAccepted: z.boolean().refine((value) => value, "Debes confirmar que la información es correcta."),
  website: z.string().trim().max(0, "Envío inválido.").optional().default(""),
}).superRefine((payload, context) => {
  if (!payload.isMinor) return;

  if (payload.representativeName.length < 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ingresa el nombre del padre, madre o representante.",
      path: ["representativeName"],
    });
  }

  if (payload.representativeDocument.length < 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ingresa el documento del representante.",
      path: ["representativeDocument"],
    });
  }
});

export type ComplaintPayload = z.infer<typeof complaintPayloadSchema>;
export type ComplaintStatus = (typeof complaintStatuses)[number];
