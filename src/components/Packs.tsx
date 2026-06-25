"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { packs, type PackSlug } from "@/data/packs";
import { trackBagelitoEvent } from "@/lib/analytics";
import { packCopy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

const packImages: Record<PackSlug, string> = {
  "12-mixed": "/images/pack-12-mixed.webp",
  "6-mixed": "/images/pack-6-mixed.webp",
  "12-single": "/images/pack-12-single.webp",
  "6-single": "/images/pack-6-single.webp",
};

export function Packs({ acceptingReservations = true }: { acceptingReservations?: boolean }) {
  const { locale, copy } = useLanguage();

  return (
    <section id="packs" className="packs-section section-pad" aria-labelledby="packs-title">
      <div className="section-heading">
        <h2 id="packs-title">{copy.packs.title}</h2>
        <p className="section-intro">{copy.packs.premiumNote}</p>
      </div>

      <div className="pack-grid clean-pack-grid" aria-label={copy.packs.title}>
        {packs.map((pack) => {
          const localizedPack = packCopy[locale][pack.slug];
          const ctaHref = acceptingReservations ? `/reserve?pack=${pack.slug}` : `/waitlist?pack=${pack.slug}`;
          const ctaLabel = acceptingReservations ? copy.packs.button : copy.packs.waitlistButton;

          return (
            <article key={pack.slug} className={`pack-card clean-pack-card ${pack.accent} ${pack.mostWanted ? "has-badge" : ""}`}>
              {pack.mostWanted ? <span className="most-wanted">{copy.packs.mostWanted}</span> : null}

              <div className="pack-title-block">
                <h3>{localizedPack.name}</h3>
                <strong>S/{pack.amount}</strong>
              </div>

              <div className="clean-pack-image-wrap">
                <Image
                  src={packImages[pack.slug]}
                  alt={localizedPack.trayLabel}
                  width={960}
                  height={540}
                  sizes="(max-width: 760px) 84vw, (max-width: 1120px) 42vw, (max-width: 1540px) 23vw, 360px"
                  quality={72}
                  className="clean-pack-image"
                />
              </div>

              <p>{localizedPack.description}</p>

              <Link
                className={`pill-button ${pack.accent}`}
                href={ctaHref}
                aria-label={`${ctaLabel}: ${localizedPack.name}`}
                onClick={() => trackBagelitoEvent("Pack CTA Click", { pack: pack.slug, amount: pack.amount, target: acceptingReservations ? "reserve" : "waitlist" })}
              >
                <MessageCircle size={18} strokeWidth={2.6} aria-hidden="true" />
                <span>{ctaLabel}</span>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
