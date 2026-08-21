"use client";

import { flavors } from "@/data/flavors";
import { flavorCopy } from "@/lib/i18n";
import { RollingBagel, type BagelVariant } from "./RollingBagel";
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

export function FlavorStrip() {
  const { locale, copy } = useLanguage();

  return (
    <section id="flavors" className="flavor-section section-pad">
      <h2>{copy.flavors.title}</h2>
      <p className="section-intro">{copy.flavors.intro}</p>
      <div className="flavor-strip">
        {flavors.map((flavor) => (
          <article className="flavor-mini" key={flavor.slug}>
            <RollingBagel variant={flavor.variant as BagelVariant} size="sm" label={flavorCopy[locale][flavor.slug] ?? flavor.name} />
            <h3>{flavorCopy[locale][flavor.slug] ?? flavor.name}</h3>
            <p>{flavorDescriptions[locale][flavor.slug as keyof typeof flavorDescriptions.en]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
