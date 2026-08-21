"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag, X } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import type { PublicPurchaseActivity } from "@/lib/conversion/purchase-activity";
import { packCopy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

const irregularDelaysMs = [3_000, 10_000, 5_000, 8_000, 20_000, 12_000, 6_000, 15_000];
const visibleDurationMs = 4_600;
const dismissedStorageKey = "bagelito-purchase-activity-dismissed";

function randomDelay() {
  return irregularDelaysMs[Math.floor(Math.random() * irregularDelaysMs.length)];
}

export function PurchaseActivityToast({ events }: { events: PublicPurchaseActivity[] }) {
  const pathname = usePathname();
  const { locale, copy } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastIndexRef = useRef(-1);
  const eligiblePath = pathname === "/" || pathname === "/reserve";
  const activeEvent = events[activeIndex];

  useEffect(() => {
    setDismissed(window.sessionStorage.getItem(dismissedStorageKey) === "true");
  }, []);

  useEffect(() => {
    if (!eligiblePath || dismissed || events.length === 0) return;

    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    let cancelled = false;

    const showNext = () => {
      if (cancelled || document.hidden) {
        showTimer = window.setTimeout(showNext, randomDelay());
        return;
      }

      let nextIndex = Math.floor(Math.random() * events.length);
      if (events.length > 1 && nextIndex === lastIndexRef.current) {
        nextIndex = (nextIndex + 1) % events.length;
      }
      lastIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      setVisible(true);
      trackBagelitoEvent("Purchase Activity Viewed", {
        district: events[nextIndex]?.district,
        pack: events[nextIndex]?.packSlug ?? "custom",
      });

      hideTimer = window.setTimeout(() => {
        setVisible(false);
        showTimer = window.setTimeout(showNext, randomDelay());
      }, visibleDurationMs);
    };

    showTimer = window.setTimeout(showNext, randomDelay());
    return () => {
      cancelled = true;
      if (showTimer) window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [dismissed, eligiblePath, events]);

  if (!eligiblePath || dismissed || !activeEvent) return null;

  const localizedPack = activeEvent.packSlug
    ? packCopy[locale][activeEvent.packSlug].name
    : activeEvent.packName;
  const message = locale === "es"
    ? `Alguien de ${activeEvent.district} reservó ${localizedPack}.`
    : `Someone in ${activeEvent.district} reserved ${localizedPack}.`;

  function dismiss() {
    window.sessionStorage.setItem(dismissedStorageKey, "true");
    setVisible(false);
    setDismissed(true);
  }

  return (
    <aside
      className={`purchase-activity-toast ${visible ? "visible" : ""}`}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <span className="purchase-activity-icon"><ShoppingBag size={19} /></span>
      <div>
        <small>{copy.conversion.activityLabel}</small>
        <strong>{message}</strong>
      </div>
      <button type="button" onClick={dismiss} aria-label={copy.conversion.dismissActivity}>
        <X size={16} />
      </button>
    </aside>
  );
}
