"use client";

import Link from "next/link";
import { Clock3, MessageCircle } from "lucide-react";
import { packCopy } from "@/lib/i18n";
import { getWhatsAppHref } from "@/lib/whatsapp";
import type { PackSlug } from "@/data/packs";
import { useLanguage } from "@/components/LanguageProvider";

type Props = {
  name: string;
  pack: string;
};

function isPackSlug(pack: string): pack is PackSlug {
  return pack === "mixed-12" || pack === "mixed-6" || pack === "single-12" || pack === "single-6";
}

export function ReservationSuccessContent({ name, pack }: Props) {
  const { lang, copy } = useLanguage();
  const s = copy.success;
  const packLabel = isPackSlug(pack) ? packCopy[lang][pack].title : s.packFallback;

  return (
    <main className="success-page">
      <section className="success-card">
        <span className="success-eyebrow">{s.eyebrow}</span>
        <h1>{s.title.replace("{name}", name)}</h1>
        <p>{s.subtitle.replace("{pack}", packLabel)}</p>
        <div className="success-next">
          <Clock3 size={20} />
          <span>{s.next}</span>
        </div>
        <div className="success-actions">
          <Link className="pill-button pink" href="/#packs">{s.back}</Link>
          <a className="pill-button pink" href={getWhatsAppHref()} target="_blank" rel="noreferrer"><MessageCircle size={18} /> {s.message}</a>
        </div>
      </section>
    </main>
  );
}
