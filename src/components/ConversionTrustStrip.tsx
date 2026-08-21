"use client";

import { CheckCircle2, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const trustIcons = [ReceiptText, ShieldCheck, CheckCircle2, Truck];

export function ConversionTrustStrip({ compact = false }: { compact?: boolean }) {
  const { copy } = useLanguage();

  return (
    <section className={`conversion-trust-strip ${compact ? "compact" : ""}`} aria-label={copy.conversion.trustAria}>
      {copy.conversion.trust.map((item, index) => {
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
