"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function MobileStickyReserveCTA() {
  const { copy } = useLanguage();

  return (
    <Link className="mobile-sticky-reserve-cta" href="/#packs" aria-label={copy.stickyReserveCta.aria}>
      <ShoppingBag size={18} />
      <span>{copy.stickyReserveCta.label}</span>
    </Link>
  );
}
