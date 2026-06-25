const bagelitoWhatsappNumber = "51917547745";

function normalizeWhatsAppPhone(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("51")) return digits;
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

export function getWhatsAppHrefForPhone(phoneNumber: string, message?: string) {
  const params = new URLSearchParams({ phone: normalizeWhatsAppPhone(phoneNumber) });

  if (message) {
    params.set("text", message);
  }

  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function getWhatsAppHref(message?: string) {
  return getWhatsAppHrefForPhone(bagelitoWhatsappNumber, message);
}
