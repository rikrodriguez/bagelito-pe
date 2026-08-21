"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, Camera, FileText, Mail, MessageCircle } from "lucide-react";
import { siteContactEmail, siteInstagramUrl, siteLegalName, siteRuc } from "@/lib/site";
import { getWhatsAppHref } from "@/lib/whatsapp";
import { useLanguage } from "./LanguageProvider";

export function Footer() {
  const { copy } = useLanguage();

  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <Link href="/" className="footer-logo" aria-label={copy.footer.homeLabel}>
          <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} />
        </Link>
        <p>{copy.footer.tagline}</p>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <a href={getWhatsAppHref()} target="_blank" rel="noreferrer"><MessageCircle size={19} /> +51 917 547 745</a>
        <a href={`mailto:${siteContactEmail}`}><Mail size={19} /> {siteContactEmail}</a>
        <a href={siteInstagramUrl} target="_blank" rel="noreferrer"><Camera size={19} /> @bagelito.pe</a>
        <Link href="/legal"><FileText size={19} /> {copy.footer.legal}</Link>
        <Link href="/libro-de-reclamaciones"><BookOpenCheck size={19} /> Libro de Reclamaciones</Link>
      </nav>
      <div className="footer-meta">
        <span className="footer-ruc">{siteLegalName} · RUC {siteRuc}</span>
        <span>{copy.footer.made} <strong>{copy.footer.love}</strong></span>
      </div>
    </footer>
  );
}
