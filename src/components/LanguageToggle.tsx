"use client";

import { useLanguage } from "./LanguageProvider";

export function LanguageToggle() {
  const { locale, setLocale, copy } = useLanguage();

  return (
    <div className="language-toggle" role="group" aria-label={copy.language.label}>
      <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>
        {copy.language.english}
      </button>
      <button type="button" className={locale === "es" ? "active" : ""} onClick={() => setLocale("es")} aria-pressed={locale === "es"}>
        {copy.language.spanish}
      </button>
    </div>
  );
}
