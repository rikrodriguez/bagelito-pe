"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function MobileStickyReserveCTA() {
  const { copy } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const trackedSections = [document.getElementById("home"), document.getElementById("packs")].filter(Boolean) as HTMLElement[];

    if (!trackedSections.length || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const visibleSections = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target);
          } else {
            visibleSections.delete(entry.target);
          }
        }
        setIsVisible(visibleSections.size === 0);
      },
      { rootMargin: "0px 0px -20% 0px" },
    );

    trackedSections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <Link className="mobile-sticky-reserve-cta" href="/#packs" aria-label={copy.stickyReserveCta.aria}>
      <ShoppingBag size={18} />
      <span>{copy.stickyReserveCta.label}</span>
    </Link>
  );
}
