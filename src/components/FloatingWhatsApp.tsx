"use client";

import { MessageCircle } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function FloatingWhatsApp() {
  const { copy } = useLanguage();
  const href = "https://wa.me/51917547745?text=" + encodeURIComponent(copy.header.whatsappMessage);

  return (
    <a className="floating-whatsapp" href={href} target="_blank" rel="noreferrer" aria-label={copy.header.whatsapp}>
      <MessageCircle size={30} strokeWidth={2.6} />
    </a>
  );
}
