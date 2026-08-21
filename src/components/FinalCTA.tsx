"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { RollingBagel } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";

export function FinalCTA() {
  const { copy } = useLanguage();
  const { accepting } = useBatchAvailability();
  const title = accepting ? copy.finalCta.openTitle : copy.finalCta.title;
  const text = accepting ? copy.finalCta.openText : copy.finalCta.text;
  const cta = accepting ? copy.finalCta.openCta : copy.finalCta.cta;
  const href = accepting ? "/#packs" : "/waitlist";
  const target = accepting ? "packs" : "waitlist";

  return (
    <section className="final-cta-section">
      <div className="final-cta-card">
        <RollingBagel variant="rainbow" size="lg" className="final-rainbow" />
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        <Link className="pill-button pink" href={href} onClick={() => trackBagelitoEvent("CTA Click", { location: "final_cta", target })}><MessageCircle size={18} /> {cta}</Link>
        <RollingBagel variant="sesame" size="md" className="final-sesame" />
      </div>
    </section>
  );
}
