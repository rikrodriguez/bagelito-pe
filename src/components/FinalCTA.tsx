"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { RollingBagel } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";

export function FinalCTA() {
  const { copy } = useLanguage();

  return (
    <section className="final-cta-section">
      <div className="final-cta-card">
        <RollingBagel variant="rainbow" size="lg" className="final-rainbow" />
        <div>
          <h2>{copy.finalCta.title}</h2>
          <p>{copy.finalCta.text}</p>
        </div>
        <Link className="pill-button pink" href="/waitlist" onClick={() => trackBagelitoEvent("CTA Click", { location: "final_cta", target: "waitlist" })}><MessageCircle size={18} /> {copy.finalCta.cta}</Link>
        <RollingBagel variant="sesame" size="md" className="final-sesame" />
      </div>
    </section>
  );
}
