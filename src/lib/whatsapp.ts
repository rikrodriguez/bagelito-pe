const bagelitoWhatsappNumber = "51917547745";

export function getWhatsAppHref(message?: string) {
  const params = new URLSearchParams({ phone: bagelitoWhatsappNumber });

  if (message) {
    params.set("text", message);
  }

  return `https://api.whatsapp.com/send?${params.toString()}`;
}
