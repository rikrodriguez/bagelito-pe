"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { packs } from "@/data/packs";
import { packCopy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

const ctaHotspots = [
  { slug: "12-mixed", tone: "pink", left: 3.75, top: 73.35, width: 21.1, height: 7.7 },
  { slug: "6-mixed", tone: "orange", left: 28.35, top: 73.35, width: 21.15, height: 7.7 },
  { slug: "12-single", tone: "mint", left: 52.45, top: 73.35, width: 21.15, height: 7.7 },
  { slug: "6-single", tone: "purple", left: 76.95, top: 73.35, width: 20.65, height: 7.7 },
] as const;

export function Packs() {
  const { locale, copy } = useLanguage();

  return (
    <section id="packs" className="packs-section official-packs-section" aria-labelledby="packs-title">
      <h2 id="packs-title" className="sr-only">{copy.packs.title}</h2>
      <div className="official-packs-scroll" aria-label={copy.packs.title}>
        <div className="official-packs-frame">
          <Image
            src="/images/official-packs-section.png"
            alt={copy.packs.title}
            width={1659}
            height={948}
            sizes="(max-width: 760px) 980px, 100vw"
            className="official-packs-image"
            priority={false}
          />
          {ctaHotspots.map((spot) => {
            const pack = packs.find((item) => item.slug === spot.slug);
            const label = pack ? packCopy[locale][pack.slug].name : spot.slug;

            return (
              <Link
                key={spot.slug}
                href={`/reserve?pack=${spot.slug}`}
                className={`official-pack-hotspot ${spot.tone}`}
                style={{
                  left: `${spot.left}%`,
                  top: `${spot.top}%`,
                  width: `${spot.width}%`,
                  height: `${spot.height}%`,
                }}
                aria-label={`${copy.packs.button}: ${label}`}
              >
                <MessageCircle size={18} strokeWidth={2.6} aria-hidden="true" />
                <span>{copy.packs.button}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
