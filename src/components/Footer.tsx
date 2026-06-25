"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, FileText, MessageCircle } from "lucide-react";
import { siteInstagramUrl } from "@/lib/site";
import { getWhatsAppHref } from "@/lib/whatsapp";
import { useLanguage } from "./LanguageProvider";

export function Footer() {
  const { copy } = useLanguage();

  return (
    <footer className="site-footer">
      <Link href="/" className="footer-logo" aria-label={copy.footer.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} />
      </Link>
      <p>{copy.footer.tagline}</p>
      <a href={getWhatsAppHref()} target="_blank" rel="noreferrer"><MessageCircle size={21} /> +51 917 547 745</a>
      <a href={siteInstagramUrl} target="_blank" rel="noreferrer"><Camera size={21} /> @bagelito.pe</a>
      <Link href="/legal"><FileText size={21} /> {copy.footer.legal}</Link>
      <span>{copy.footer.made} <strong>{copy.footer.love}</strong></span>
    </footer>
  );
}
