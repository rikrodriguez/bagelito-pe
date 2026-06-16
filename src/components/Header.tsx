"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "./LanguageToggle";
import { useLanguage } from "./LanguageProvider";

export function Header() {
  const { copy } = useLanguage();

  return (
    <header className="site-header">
      <Link href="/" className="logo-link" aria-label={copy.header.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} priority />
      </Link>
      <div className="header-actions">
        <LanguageToggle />
      </div>
    </header>
  );
}
