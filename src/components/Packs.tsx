"use client";

import Link from "next/link";
import { MessageCircle, ShieldCheck, ShoppingCart } from "lucide-react";
import type { CSSProperties } from "react";
import { packs, type Pack } from "@/data/packs";
import { packCopy } from "@/lib/i18n";
import { RollingBagel, type BagelVariant } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";

type PackVisual = {
  variants: BagelVariant[];
};

type PackSlot = {
  x: number;
  y: number;
};

const packVisuals: Record<Pack["slug"], PackVisual> = {
  "12-mixed": {
    variants: ["everything", "jalapeno", "rainbow", "plain", "cheddar", "blueberry", "sesame", "onion", "cinnamon", "snickerdoodle", "everything", "rainbow"],
  },
  "6-mixed": {
    variants: ["jalapeno", "plain", "rainbow", "cheddar", "sesame", "blueberry"],
  },
  "12-single": {
    variants: Array.from({ length: 12 }, () => "plain" as BagelVariant),
  },
  "6-single": {
    variants: Array.from({ length: 6 }, () => "plain" as BagelVariant),
  },
};

const slotsByUnits: Record<6 | 12, PackSlot[]> = {
  6: [
    { x: 17, y: 32 },
    { x: 50, y: 29 },
    { x: 83, y: 32 },
    { x: 24, y: 63 },
    { x: 50, y: 66 },
    { x: 76, y: 63 },
  ],
  12: [
    { x: 16, y: 27 },
    { x: 39, y: 24 },
    { x: 62, y: 24 },
    { x: 84, y: 27 },
    { x: 18, y: 50 },
    { x: 39, y: 48 },
    { x: 61, y: 48 },
    { x: 82, y: 50 },
    { x: 17, y: 73 },
    { x: 39, y: 71 },
    { x: 61, y: 71 },
    { x: 83, y: 73 },
  ],
};

function PackTray({ pack, label }: { pack: Pack; label: string }) {
  const visual = packVisuals[pack.slug];
  const slots = slotsByUnits[pack.units as 6 | 12];

  return (
    <div className={"pack-display pack-display-" + pack.units} aria-label={label} role="img">
      <div className="pack-platter" aria-hidden="true">
        <span>Bagelito.pe</span>
      </div>
      <div className="pack-bagel-group" aria-hidden="true">
        {visual.variants.map((variant, index) => (
          <RollingBagel
            key={pack.slug + "-" + variant + "-" + index}
            variant={variant}
            size="sm"
            className="pack-bagel-item"
            style={{
              "--slot-x": slots[index]?.x + "%",
              "--slot-y": slots[index]?.y + "%",
            } as CSSProperties}
            spin={2.6}
            spinOffset={index * 18}
          />
        ))}
      </div>
    </div>
  );
}

export function Packs() {
  const { locale, copy } = useLanguage();

  return (
    <section id="packs" className="packs-section section-pad">
      <div className="section-heading split-heading">
        <h2>{copy.packs.title}</h2>
        <div className="note-pills">
          <span>{copy.packs.minOrder}</span>
          <span>{copy.packs.premiumNote}</span>
        </div>
      </div>
      <div className="pack-grid">
        {packs.map((pack) => {
          const localizedPack = packCopy[locale][pack.slug];
          return (
            <article className={"pack-card " + pack.accent + (pack.mostWanted ? " has-badge" : "")} key={pack.slug}>
              {pack.mostWanted ? <span className="most-wanted">{copy.packs.mostWanted}</span> : null}
              <div className="pack-title-block">
                <h3>{localizedPack.name}</h3>
                <strong>S/{pack.amount}</strong>
              </div>
              <PackTray pack={pack} label={localizedPack.trayLabel} />
              <p>{localizedPack.description}</p>
              <Link className={"pill-button " + pack.accent} href={"/reserve?pack=" + pack.slug}>
                <MessageCircle size={18} /> {copy.packs.button}
              </Link>
            </article>
          );
        })}
      </div>
      <div className="reservation-rules">
        <span><ShieldCheck size={19} /> {copy.packs.rules[0]}</span>
        <span><ShoppingCart size={19} /> {copy.packs.rules[1]}</span>
        <span><ShoppingCart size={19} /> {copy.packs.rules[2]}</span>
      </div>
    </section>
  );
}
