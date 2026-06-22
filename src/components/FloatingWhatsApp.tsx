"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { getWhatsAppHref } from "@/lib/whatsapp";
import { useLanguage } from "./LanguageProvider";

export function FloatingWhatsApp() {
  const { copy } = useLanguage();
  const [isHidden, setIsHidden] = useState(false);
  const href = getWhatsAppHref(copy.header.whatsappMessage);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    let observer: IntersectionObserver | null = null;

    const syncVisibility = () => {
      observer?.disconnect();
      observer = null;

      if (!mobileQuery.matches || !("IntersectionObserver" in window)) {
        setIsHidden(false);
        return;
      }

      const trackedSections = [document.getElementById("home"), document.getElementById("packs")].filter(Boolean) as HTMLElement[];

      if (!trackedSections.length) {
        setIsHidden(false);
        return;
      }

      const visibleSections = new Set<Element>();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleSections.add(entry.target);
            } else {
              visibleSections.delete(entry.target);
            }
          }
          setIsHidden(visibleSections.size > 0);
        },
        { rootMargin: "0px 0px -20% 0px" },
      );

      trackedSections.forEach((section) => observer?.observe(section));
    };

    syncVisibility();
    mobileQuery.addEventListener("change", syncVisibility);

    return () => {
      observer?.disconnect();
      mobileQuery.removeEventListener("change", syncVisibility);
    };
  }, []);

  if (isHidden) {
    return null;
  }

  return (
    <a className="floating-whatsapp" href={href} target="_blank" rel="noreferrer" aria-label={copy.header.whatsapp}>
      <MessageCircle size={30} strokeWidth={2.6} />
    </a>
  );
}
