"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { useLanguage } from "./LanguageProvider";

export function MobileStickyReserveCTA() {
  const { copy, locale } = useLanguage();
  const { accepting: acceptingReservations, merchantReviewOnly } = useBatchAvailability();
  const review = merchantReviewCopy[locale];
  const [isVisible, setIsVisible] = useState(false);
  const href = merchantReviewOnly ? "/checkout" : acceptingReservations ? "/#packs" : "/waitlist";
  const label = merchantReviewOnly ? review.cta : acceptingReservations ? copy.stickyReserveCta.label : copy.stickyReserveCta.waitlistLabel;
  const ariaLabel = merchantReviewOnly ? review.cta : acceptingReservations ? copy.stickyReserveCta.aria : copy.stickyReserveCta.waitlistAria;

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
    <Link className="mobile-sticky-reserve-cta" href={href} aria-label={ariaLabel} onClick={() => trackBagelitoEvent("CTA Click", { location: "mobile_sticky", target: merchantReviewOnly ? "checkout_preview" : acceptingReservations ? "packs" : "waitlist" })}>
      <ShoppingBag size={18} />
      <span>{label}</span>
    </Link>
  );
}
