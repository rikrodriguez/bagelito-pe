"use client";

import Image from "next/image";
import { Quote } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function Testimonials() {
  const { copy } = useLanguage();

  return (
    <section className="testimonials-section" aria-label={copy.testimonials.aria}>
      <div className="section-heading compact">
        <span>{copy.testimonials.eyebrow}</span>
        <h2>{copy.testimonials.title}</h2>
        <p>{copy.testimonials.subtitle}</p>
      </div>
      <div className="testimonials-grid">
        {copy.testimonials.items.map((item) => (
          <article className="testimonial-card" key={item.name}>
            <Quote size={22} />
            <p>{item.quote}</p>
            <strong>{item.name}</strong>
          </article>
        ))}
        <article className="founder-note">
          <Image src="/images/dawn-brookes.jpeg" alt="Dawn Brookes" width={220} height={220} />
          <div>
            <span>{copy.testimonials.founderLabel}</span>
            <h3>{copy.testimonials.founderTitle}</h3>
            <p>{copy.testimonials.founderText}</p>
          </div>
        </article>
      </div>
    </section>
  );
}
