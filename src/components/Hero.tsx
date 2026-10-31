"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import { Archive, CalendarDays, LockKeyhole, MessageCircle, Truck } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { RollingBagel } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";
import { useReserveCampaignHref, useWaitlistCampaignHref } from "@/lib/waitlist/use-campaign-href";

const badgeIcons = [CalendarDays, LockKeyhole, Archive, Truck];

export function Hero() {
  const { copy, locale } = useLanguage();
  const { accepting: acceptingReservations, merchantReviewOnly } = useBatchAvailability();
  const waitlistHref = useWaitlistCampaignHref();
  const reserveHref = useReserveCampaignHref();
  const review = merchantReviewCopy[locale];
  const primaryHref = merchantReviewOnly ? reserveHref().replace("/reserve", "/checkout") : acceptingReservations ? "#packs" : waitlistHref();
  const primaryLabel = merchantReviewOnly ? review.cta : acceptingReservations ? copy.hero.primaryCta : copy.hero.waitlistCta;

  return (
    <section id="home" className="hero-section">
      <div className="hero-copy">
        <p className="kicker">{merchantReviewOnly ? review.status : copy.hero.kicker}</p>
        <h1>{copy.hero.titleLine1} <span>{copy.hero.titleHighlight}</span> {copy.hero.titleLine3}</h1>
        <p className="hero-subcopy">{merchantReviewOnly ? review.intro : copy.hero.subcopy}</p>
        <div className="hero-buttons">
          <a className="pill-button pink" href={primaryHref} onClick={() => trackBagelitoEvent("CTA Click", { location: "hero", target: merchantReviewOnly ? "checkout_preview" : acceptingReservations ? "packs" : "waitlist" })}><MessageCircle size={18} /> {primaryLabel}</a>
        </div>
        <div className="hero-badges">
          {(merchantReviewOnly ? review.badges : copy.hero.badges).map((text, index) => {
            const Icon = badgeIcons[index];
            return (
              <div className="mini-badge" key={text}>
                <span><Icon size={19} /></span>
                <strong>{text}</strong>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="dotted-path path-one" />
        <div className="dotted-path path-two" />
        <RollingBagel variant="sesame" size="lg" className="hero-bagel sesame-float" sizes="(max-width: 760px) 43vw, 292px" />
        <RollingBagel variant="jalapeno" size="lg" className="hero-bagel jalapeno-float" sizes="(max-width: 760px) 43vw, 292px" />
        <RollingBagel variant="rainbow" size="xl" className="hero-bagel rainbow-float" sizes="(max-width: 760px) 64vw, 420px" />
        <RollingBagel variant="everything" size="lg" className="hero-bagel everything-float" sizes="(max-width: 760px) 43vw, 292px" />
        <div className="purple-sticker">{copy.hero.sticker}</div>
      </div>
    </section>
  );
}
