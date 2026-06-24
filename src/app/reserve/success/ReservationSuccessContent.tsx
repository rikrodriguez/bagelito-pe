"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Clock3, MessageCircle } from "lucide-react";
import { packCopy } from "@/lib/i18n";
import { trackBagelitoEvent } from "@/lib/analytics";
import { getWhatsAppHref } from "@/lib/whatsapp";
import type { PackSlug } from "@/data/packs";
import { useLanguage } from "@/components/LanguageProvider";

type Props = {
  order: string;
  pack: string;
  packSlug?: string;
  amount?: string;
};

function isPackSlug(value: string | undefined): value is PackSlug {
  return value === "12-mixed" || value === "6-mixed" || value === "12-single" || value === "6-single";
}

export function ReservationSuccessContent({ order, pack, packSlug, amount }: Props) {
  const { locale, copy } = useLanguage();
  const s = copy.success;
  const displayPack = isPackSlug(packSlug) ? packCopy[locale][packSlug].name : pack || s.fallbackPack;

  useEffect(() => {
    trackBagelitoEvent("Reservation Success Viewed", {
      pack: packSlug ?? "unknown",
      amount: amount ? Number(amount) : undefined,
    });
  }, [amount, packSlug]);

  return (
    <section className="success-card">
      <p className="kicker">{s.kicker}</p>
      <h1>{s.title}</h1>
      <p>{s.text}</p>
      <div className="success-summary">
        <div><span>{s.labels.orderCode}</span><strong>{order}</strong></div>
        <div><span>{s.labels.pack}</span><strong>{displayPack}</strong></div>
        {amount ? <div><span>{s.labels.totalAmount}</span><strong>S/{amount}</strong></div> : null}
        <div><span>{s.labels.status}</span><strong>{s.kicker}</strong></div>
      </div>
      <div className="next-step"><Clock3 size={20} /> {s.nextStep} <strong>{s.coordination}</strong></div>
      <a className="pill-button pink" href={getWhatsAppHref()} target="_blank" rel="noreferrer" onClick={() => trackBagelitoEvent("WhatsApp Click", { location: "success", target: "coordination" })}><MessageCircle size={18} /> {s.message}</a>
      <Link className="mini-link" href="/" onClick={() => trackBagelitoEvent("CTA Click", { location: "success", target: "home" })}>{s.backHome}</Link>
    </section>
  );
}
