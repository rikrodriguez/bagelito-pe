"use client";

import Image from "next/image";
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

      <article className="founder-note-card">
        <div className="founder-note-media">
          <Image
            src="/images/dawn-brookes-bagelito.jpg"
            alt="Dawn Brookes with handmade Bagelito bagels"
            width={1120}
            height={1400}
            sizes="(max-width: 760px) 100vw, 420px"
          />
        </div>
        <div className="founder-note-copy">
          <span>{copy.testimonials.feature.kicker}</span>
          <h3>{copy.testimonials.feature.title}</h3>
          <p>{copy.testimonials.feature.text}</p>
          <strong>{copy.testimonials.feature.name}</strong>
        </div>
      </article>
    </section>
  );
}
