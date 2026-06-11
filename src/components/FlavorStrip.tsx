import { flavors } from "@/data/flavors";
import { RollingBagel, type BagelVariant } from "./RollingBagel";

export function FlavorStrip() {
  return (
    <section id="flavors" className="flavor-section section-pad">
      <h2>This month&apos;s batch (flavors)</h2>
      <p className="section-intro">These are the flavors we prepare across our monthly batches. Availability may rotate depending on the month.</p>
      <div className="flavor-strip">
        {flavors.map((flavor) => (
          <article className="flavor-mini" key={flavor.slug}>
            <RollingBagel variant={flavor.variant as BagelVariant} size="sm" />
            <h3>{flavor.name}</h3>
            {flavor.seasonal ? <span>Seasonal</span> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
