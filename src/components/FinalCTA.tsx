"use client";

import { MessageCircle } from "lucide-react";
import { RollingBagel } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";

const waitingListMessage = encodeURIComponent("Hello Bagelito! I want to be part of the waiting list for the next batch please 🥯!");
const waitingListHref = `https://wa.me/51917547745?text=${waitingListMessage}`;

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
        <a className="pill-button pink" href={waitingListHref} target="_blank" rel="noreferrer"><MessageCircle size={18} /> {copy.finalCta.cta}</a>
        <RollingBagel variant="sesame" size="md" className="final-sesame" />
      </div>
    </section>
  );
}
