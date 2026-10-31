"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "./LanguageToggle";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { useLanguage } from "./LanguageProvider";
import { useReserveCampaignHref } from "@/lib/waitlist/use-campaign-href";

export function Header() {
  const { copy, locale } = useLanguage();
  const { accepting, merchantReviewOnly } = useBatchAvailability();
  const reserveHref = useReserveCampaignHref();
  const review = merchantReviewCopy[locale];

  return (
    <header className={`site-header${merchantReviewOnly ? " merchant-review-header" : ""}`}>
      <Link href="/" className="logo-link" aria-label={copy.header.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} priority />
      </Link>
      <div className="header-actions">
        {merchantReviewOnly || accepting ? (
          <Link className="header-checkout-link" href={reserveHref("6-mixed").replace("/reserve", "/checkout")}>
            {merchantReviewOnly ? review.cta : locale === "es" ? "Ver checkout" : "View checkout"}
          </Link>
        ) : null}
        <LanguageToggle />
      </div>
    </header>
  );
}
