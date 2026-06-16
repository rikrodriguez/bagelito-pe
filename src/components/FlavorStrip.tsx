"use client";

import { flavors } from "@/data/flavors";
import { flavorCopy } from "@/lib/i18n";
import { RollingBagel, type BagelVariant } from "./RollingBagel";
import { useLanguage } from "./LanguageProvider";

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
          </article>
        ))}
      </div>
    </section>
  );
}
