"use client";

import { merchantReviewCopy } from "@/lib/merchant-review";

import { CheckCircle2, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useBatchAvailability } from "./BatchAvailabilityProvider";

const trustIcons = [ReceiptText, ShieldCheck, CheckCircle2, Truck];

export function ConversionTrustStrip({ compact = false }: { compact?: boolean }) {
  const { copy, locale } = useLanguage();
  const { merchantReviewOnly } = useBatchAvailability();
  const review = merchantReviewCopy[locale];

  return (
    <section className={`conversion-trust-strip ${compact ? "compact" : ""}`} aria-label={merchantReviewOnly ? review.trustAria : copy.conversion.trustAria}>
      {(merchantReviewOnly ? review.trust : copy.conversion.trust).map((item, index) => {
        const Icon = trustIcons[index];
        return (
          <article key={item.title}>
            <span><Icon size={compact ? 17 : 20} /></span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </div>
          </article>
        );
      })}
    </section>
  );
}
