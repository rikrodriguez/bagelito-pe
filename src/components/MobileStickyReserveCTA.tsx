"use client";

import { ShoppingBag } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function MobileStickyReserveCTA() {
  const { copy } = useLanguage();

  return (
    <a className="mobile-sticky-reserve-cta" href="#packs" aria-label={copy.stickyReserveCta.aria}>
      <ShoppingBag size={18} />
      <span>{copy.stickyReserveCta.label}</span>
    </a>
  );
}
