"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, MessageCircle } from "lucide-react";
import { LanguageToggle } from "./LanguageToggle";
import { useLanguage } from "./LanguageProvider";

export function Header() {
  const { copy } = useLanguage();

  return (
    <header className="site-header">
      <Link href="/" className="logo-link" aria-label={copy.header.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} priority />
      </Link>
      <nav aria-label={copy.header.mainNav}>
        {copy.header.nav.map((item) => (
          <a key={item.label} href={item.href}>{item.label}</a>
        ))}
      </nav>
      <div className="header-actions">
        <LanguageToggle />
        <a className="pill-button pink" href="https://wa.me/51917547745" target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> {copy.header.joinWaitlist}
        </a>
        <a className="icon-button" href="https://www.instagram.com/bagelito.pe" target="_blank" rel="noreferrer" aria-label={copy.header.instagram}>
          <Camera size={25} />
        </a>
      </div>
    </header>
  );
}
