"use client";

import { CircleHelp } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function FAQ() {
  const { copy } = useLanguage();

  return (
    <section id="faq" className="faq-section section-pad">
      <div className="section-heading">
        <h2>{copy.faq.title}</h2>
        <p className="section-intro">{copy.faq.intro}</p>
      </div>
      <div className="faq-grid">
        {copy.faq.items.map((item, index) => (
          <article className="faq-card" key={item.question}>
            <span aria-hidden="true"><CircleHelp size={18} /></span>
            <div>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
