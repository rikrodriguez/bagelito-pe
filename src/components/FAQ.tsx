"use client";

import { ChevronDown, CircleHelp } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "./LanguageProvider";

export function FAQ() {
  const { copy } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="faq-section section-pad">
      <div className="section-heading">
        <h2>{copy.faq.title}</h2>
        <p className="section-intro">{copy.faq.intro}</p>
      </div>
      <div className="faq-grid" role="list">
        {copy.faq.items.map((item, index) => {
          const isOpen = openIndex === index;
          const panelId = "faq-panel-" + index;

          return (
            <article className={"faq-card" + (isOpen ? " is-open" : "")} key={item.question} role="listitem">
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                className="faq-question"
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                <span className="faq-icon" aria-hidden="true"><CircleHelp size={18} /></span>
                <span className="faq-title">
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <strong>{item.question}</strong>
                </span>
                <ChevronDown className="faq-chevron" size={22} aria-hidden="true" />
              </button>
              <div className="faq-answer" id={panelId} hidden={!isOpen}>
                <p>{item.answer}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
