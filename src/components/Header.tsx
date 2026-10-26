"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "./LanguageToggle";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { useLanguage } from "./LanguageProvider";

export function Header() {
  const { copy, locale } = useLanguage();
  const { accepting } = useBatchAvailability();

  return (
    <header className="site-header">
      <Link href="/" className="logo-link" aria-label={copy.header.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} priority />
      </Link>
      <div className="header-actions">
        {accepting ? (
          <Link className="header-checkout-link" href="/checkout?pack=6-mixed">
            {locale === "es" ? "Ver checkout" : "View checkout"}
          </Link>
        ) : null}
        <LanguageToggle />
      </div>
    </header>
  );
}
