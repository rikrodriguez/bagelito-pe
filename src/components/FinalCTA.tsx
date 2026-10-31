"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { RollingBagel } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";
import { usePacksCampaignHref, useReserveCampaignHref, useWaitlistCampaignHref } from "@/lib/waitlist/use-campaign-href";

export function FinalCTA() {
  const { copy, locale } = useLanguage();
  const { accepting, merchantReviewOnly } = useBatchAvailability();
  const waitlistHref = useWaitlistCampaignHref();
  const packsHref = usePacksCampaignHref();
  const reserveHref = useReserveCampaignHref();
  const review = merchantReviewCopy[locale];
  const title = merchantReviewOnly ? review.status : accepting ? copy.finalCta.openTitle : copy.finalCta.title;
  const text = merchantReviewOnly ? review.intro : accepting ? copy.finalCta.openText : copy.finalCta.text;
  const cta = merchantReviewOnly ? review.cta : accepting ? copy.finalCta.openCta : copy.finalCta.cta;
  const href = merchantReviewOnly ? reserveHref().replace("/reserve", "/checkout") : accepting ? packsHref : waitlistHref();
  const target = merchantReviewOnly ? "checkout_preview" : accepting ? "packs" : "waitlist";

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
