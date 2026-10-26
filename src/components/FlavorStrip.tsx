"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import Image from "next/image";
import Link from "next/link";
import { flavors } from "@/data/flavors";
import { packs } from "@/data/packs";
import { flavorImages } from "@/data/flavor-images";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { flavorCopy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

const flavorDescriptions = {
  en: {
    "jalapeno-cheddar": "Cheddar-forward with a gentle jalapeño kick.",
    cheddar: "Savory, golden, and finished with melted cheddar.",
    sesame: "A classic chewy bagel with a toasted sesame crust.",
    "everything-bagel": "Sesame, onion, garlic, and a savory everything finish.",
    "cinnamon-raisin": "Warm cinnamon with raisins and a lightly sweet finish.",
    blueberry: "Fruity blueberry flavor in a soft, chewy crumb.",
    plain: "The clean classic: golden outside and chewy inside.",
    "classic-onion": "Savory onion flavor with a toasted aromatic crust.",
    "rainbow-custom-colors": "A premium colorful bagel made for celebrations.",
    snickerdoodle: "A seasonal cinnamon-sugar inspired bagel.",
  },
  es: {
    "jalapeno-cheddar": "Sabor intenso a cheddar con un toque suave de jalapeño.",
    cheddar: "Sabroso, dorado y terminado con cheddar derretido.",
    sesame: "El clásico bagel de mordida elástica con costra de ajonjolí.",
    "everything-bagel": "Ajonjolí, cebolla, ajo y el acabado salado del everything.",
    "cinnamon-raisin": "Canela cálida, pasas y un acabado ligeramente dulce.",
    blueberry: "Sabor frutal a blueberry en una miga suave y elástica.",
    plain: "El clásico limpio: dorado por fuera y elástico por dentro.",
    "classic-onion": "Cebolla sabrosa con una costra tostada y aromática.",
    "rainbow-custom-colors": "Bagel premium de colores para celebraciones.",
    snickerdoodle: "Bagel de temporada inspirado en canela y azúcar.",
  },
} as const;

const singlePackPrice: number = (() => {
  const pack = packs.find((item) => item.slug === "6-single");
  if (!pack) throw new Error("Bagelito single-flavor pack is not configured.");
  return pack.amount;
})();

export function FlavorStrip() {
  const { locale, copy } = useLanguage();
  const { accepting, merchantReviewOnly } = useBatchAvailability();
  const review = merchantReviewCopy[locale];
  const destination = merchantReviewOnly ? "/checkout?pack=6-single" : accepting ? "/checkout?pack=6-single" : "/waitlist?pack=6-single";

  return (
    <section id="flavors" className="flavor-section section-pad">
      <h2>{copy.flavors.title}</h2>
      <p className="section-intro">{copy.flavors.intro}</p>
      <p className="flavor-catalog-note">
        {merchantReviewOnly ? review.flavorNote : locale === "es"
          ? "Elige tu sabor al comprar un pack. Pedido mínimo: 6 bagels. Los precios del pack y delivery se muestran antes de pagar."
          : "Choose your flavor when ordering a pack. Minimum: 6 bagels. Full pack and delivery prices are shown before payment."}
      </p>
      <div className="flavor-strip">
        {flavors.map((flavor) => {
          const name = flavorCopy[locale][flavor.slug] ?? flavor.name;
          return (
            <article className="flavor-mini flavor-product-card" key={flavor.slug}>
              <div className="flavor-product-photo">
                <Image
                  src={flavorImages[flavor.slug]}
                  alt={locale === "es" ? `Bagel artesanal sabor ${name} de Bagelito` : `Bagelito handmade ${name} bagel`}
                  width={320}
                  height={320}
                  sizes="(max-width: 650px) 43vw, (max-width: 1050px) 28vw, 200px"
                  quality={75}
                  loading="lazy"
                />
              </div>
              <h3>{name}</h3>
              <p>{flavorDescriptions[locale][flavor.slug as keyof typeof flavorDescriptions.en]}</p>
              <strong className="flavor-product-price">
                {locale === "es" ? "Pack de 6 desde" : "6-pack from"} S/{singlePackPrice}
              </strong>
              <Link className="flavor-product-cta" href={destination} aria-label={
                merchantReviewOnly ? `${review.cta}: ${name}` : locale === "es" ? `${accepting ? "Elegir pack" : "Avisarme de apertura"}: ${name}`
                  : `${accepting ? "Choose pack" : "Notify me when open"}: ${name}`
              }>
                {merchantReviewOnly ? review.cta : accepting
                  ? locale === "es" ? "Elegir pack" : "Choose pack"
                  : locale === "es" ? "Avisarme" : "Notify me"}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
