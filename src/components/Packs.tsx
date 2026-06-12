import Link from "next/link";
import { MessageCircle, ShieldCheck, ShoppingCart } from "lucide-react";
import { packs, type Pack } from "@/data/packs";
import { RollingBagel, type BagelVariant } from "./RollingBagel";

type PackVisual = {
  variants: BagelVariant[];
  label: string;
};

const packVisuals: Record<Pack["slug"], PackVisual> = {
  "12-mixed": {
    label: "Twelve mixed handmade Bagelito bagels in a tray",
    variants: ["everything", "jalapeno", "rainbow", "plain", "cheddar", "blueberry", "sesame", "onion", "cinnamon", "snickerdoodle", "everything", "rainbow"],
  },
  "6-mixed": {
    label: "Six mixed handmade Bagelito bagels in a tray",
    variants: ["jalapeno", "plain", "rainbow", "cheddar", "sesame", "blueberry"],
  },
  "12-single": {
    label: "Twelve single flavor handmade Bagelito bagels in a tray",
    variants: Array.from({ length: 12 }, () => "plain" as BagelVariant),
  },
  "6-single": {
    label: "Six single flavor handmade Bagelito bagels in a tray",
    variants: Array.from({ length: 6 }, () => "plain" as BagelVariant),
  },
};

function PackTray({ pack }: { pack: Pack }) {
  const visual = packVisuals[pack.slug];

  return (
    <div className={`pack-tray-stage pack-tray-${pack.units}`} aria-label={visual.label} role="img">
      <div className="pack-tray-base" aria-hidden="true">
        <span>Bagelito.pe</span>
      </div>
      <div className="pack-tray-grid" aria-hidden="true">
        {visual.variants.map((variant, index) => (
          <RollingBagel
            key={`${pack.slug}-${variant}-${index}`}
            variant={variant}
            size="sm"
            className="pack-tray-bagel"
          />
        ))}
      </div>
    </div>
  );
}

export function Packs() {
  return (
    <section id="packs" className="packs-section section-pad">
      <div className="section-heading split-heading">
        <h2>Packs to reserve</h2>
        <div className="note-pills">
          <span>Minimum order: 6-pack</span>
          <span>Premium and seasonal flavors may vary.</span>
        </div>
      </div>
      <div className="pack-grid">
        {packs.map((pack) => (
          <article className={`pack-card ${pack.accent} ${pack.mostWanted ? "has-badge" : ""}`} key={pack.slug}>
            {pack.mostWanted ? <span className="most-wanted">Most wanted</span> : null}
            <div className="pack-title-block">
              <h3>{pack.name}</h3>
              <strong>S/{pack.amount}</strong>
            </div>
            <PackTray pack={pack} />
            <p>{pack.description}</p>
            <Link className={`pill-button ${pack.accent}`} href={`/reserve?pack=${pack.slug}`}>
              <MessageCircle size={18} /> Reserve this pack
            </Link>
          </article>
        ))}
      </div>
      <div className="reservation-rules">
        <span><ShieldCheck size={19} /> Your reservation is confirmed only after payment.</span>
        <span><ShoppingCart size={19} /> We bake according to confirmed paid orders.</span>
        <span><ShoppingCart size={19} /> No extra stock is guaranteed after the batch closes.</span>
      </div>
    </section>
  );
}
