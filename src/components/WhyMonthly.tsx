"use client";

import { Leaf, ShoppingCart, Smile, Trash2 } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const reasonMeta = [
  { Icon: Leaf, color: "mint" },
  { Icon: Trash2, color: "pink" },
  { Icon: ShoppingCart, color: "orange" },
  { Icon: Smile, color: "purple" },
] as const;

export function WhyMonthly() {
  const { copy } = useLanguage();

  return (
    <section id="about" className="why-section section-pad">
      <h2>{copy.why.title}</h2>
      <p className="section-intro">{copy.why.intro}</p>
      <div className="reason-grid">
        {copy.why.reasons.map((reason, index) => {
          const meta = reasonMeta[index];
          const Icon = meta.Icon;
          return (
            <article className={"reason-card " + meta.color} key={reason.title}>
              <Icon size={42} />
              <h3>{reason.title}</h3>
              <p>{reason.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
