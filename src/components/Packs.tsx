import Image from "next/image";
import Link from "next/link";
import { MessageCircle, ShieldCheck, ShoppingCart } from "lucide-react";
import { packs, type Pack } from "@/data/packs";

type PackVisual = {
  src: string;
  alt: string;
};

const packImages: Record<Pack["slug"], PackVisual> = {
  "12-mixed": { src: "/images/pack-12-mixed.png", alt: "Tray with 12 mixed Bagelito bagels" },
  "6-mixed": { src: "/images/pack-6-mixed.png", alt: "Tray with 6 mixed Bagelito bagels" },
  "12-single": { src: "/images/pack-12-single.png", alt: "Tray with 12 plain Bagelito bagels" },
  "6-single": { src: "/images/pack-6-single.png", alt: "Tray with 6 plain Bagelito bagels" },
};

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
        {packs.map((pack) => {
          const visual = packImages[pack.slug];

          return (
            <article className={`pack-card ${pack.accent} ${pack.mostWanted ? "has-badge" : ""}`} key={pack.slug}>
              {pack.mostWanted ? <span className="most-wanted">Most wanted</span> : null}
              <div className="pack-title-block">
                <h3>{pack.name}</h3>
                <strong>S/{pack.amount}</strong>
              </div>
              <div className={`pack-visual pack-image-wrap pack-${pack.slug}`}>
                <Image
                  src={visual.src}
                  alt={visual.alt}
                  width={1600}
                  height={900}
                  sizes="(max-width: 760px) 88vw, (max-width: 1120px) 42vw, 300px"
                  className="pack-mockup-image"
                />
              </div>
              <p>{pack.description}</p>
              <Link className={`pill-button ${pack.accent}`} href={`/reserve?pack=${pack.slug}`}>
                <MessageCircle size={18} /> Reserve this pack
              </Link>
            </article>
          );
        })}
      </div>
      <div className="reservation-rules">
        <span><ShieldCheck size={19} /> Your reservation is confirmed only after payment.</span>
        <span><ShoppingCart size={19} /> We bake according to confirmed paid orders.</span>
        <span><ShoppingCart size={19} /> No extra stock is guaranteed after the batch closes.</span>
      </div>
    </section>
  );
}
