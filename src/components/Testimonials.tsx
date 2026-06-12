"use client";

import { useLanguage } from "./LanguageProvider";

export function Testimonials() {
  const { copy } = useLanguage();

  return (
    <section className="testimonials-section section-pad">
      <h2>{copy.testimonials.title}</h2>
      <p className="section-intro">{copy.testimonials.intro}</p>
      <div className="review-grid">
        {copy.testimonials.reviews.map((review, index) => (
          <article className={"review-card " + review.source.toLowerCase()} key={review.name + "-" + index}>
            <div className="review-top"><strong>{review.source}</strong><span>{review.lang}</span></div>
            <p>{review.text}</p>
            <small>{review.name}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
