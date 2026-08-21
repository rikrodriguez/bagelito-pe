"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Gauge, MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import type { BatchAvailability } from "@/lib/reservations/service";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { useLanguage } from "./LanguageProvider";

const initialTimeLeft = {
  days: "--",
  hours: "--",
  minutes: "--",
  seconds: "--",
};

function getTimeLeft(deadline: number | null) {
  if (!deadline) return initialTimeLeft;
  const diff = Math.max(0, deadline - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function getReservedPercent(batchAvailability: BatchAvailability) {
  if (batchAvailability.capacityPacks) {
    return Math.min(100, Math.round((batchAvailability.reservedPacks / batchAvailability.capacityPacks) * 100));
  }

  if (batchAvailability.capacityBagels) {
    return Math.min(100, Math.round((batchAvailability.reservedBagels / batchAvailability.capacityBagels) * 100));
  }

  return 0;
}

export function BatchDeadlineBanner() {
  const { locale, copy } = useLanguage();
  const batchAvailability = useBatchAvailability();
  const deadline = batchAvailability.accepting && batchAvailability.ordersCloseAt
    ? new Date(batchAvailability.ordersCloseAt).getTime()
    : null;
  const hasFixedCapacity = Boolean(batchAvailability.capacityPacks || batchAvailability.capacityBagels);
  const reservedPercent = getReservedPercent(batchAvailability);
  const availablePercent = batchAvailability.accepting ? 100 - reservedPercent : 0;
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  const closeLabel = batchAvailability.ordersCloseAt
    ? (locale === "es" ? "Pedidos cierran " : "Orders close ") + new Date(batchAvailability.ordersCloseAt).toLocaleDateString(locale === "es" ? "es-PE" : "en-US", { day: "numeric", month: "short", timeZone: "America/Lima" })
    : copy.deadline.close;
  const ctaLabel = batchAvailability.accepting ? copy.deadline.cta : copy.deadline.closedCta;
  const ctaHref = batchAvailability.accepting ? "/#packs" : "/waitlist";

  useEffect(() => {
    setTimeLeft(getTimeLeft(deadline));
    const interval = window.setInterval(() => setTimeLeft(getTimeLeft(deadline)), 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  return (
    <aside className="batch-deadline-banner" aria-label={copy.deadline.aria}>
      <div className="deadline-banner-copy">
        <span><CalendarClock size={17} /> {copy.deadline.title}</span>
        <strong>{batchAvailability.accepting ? closeLabel : locale === "es" ? "Batch cerrado" : "Batch closed"}</strong>
      </div>

      <div className="deadline-timer" aria-label={copy.deadline.timerAria}>
        <span><strong>{timeLeft.days}</strong><small>{copy.deadline.days}</small></span>
        <span><strong>{timeLeft.hours}</strong><small>{copy.deadline.hours}</small></span>
        <span><strong>{timeLeft.minutes}</strong><small>{copy.deadline.minutes}</small></span>
        <span><strong>{timeLeft.seconds}</strong><small>{copy.deadline.seconds}</small></span>
      </div>

      <div className="batch-availability">
        <div className="availability-label">
          <span>
            <Gauge size={17} />
            {batchAvailability.accepting
              ? hasFixedCapacity
                ? `${reservedPercent}% ${copy.deadline.reserved}`
                : `${batchAvailability.reservedPacks} ${copy.deadline.packsReserved}`
              : copy.deadline.closedStatus}
          </span>
          <strong>
            {batchAvailability.accepting
              ? hasFixedCapacity
                ? `${availablePercent}% ${copy.deadline.available}`
                : copy.deadline.noFixedLimit
              : copy.deadline.closedBody}
          </strong>
        </div>
        {hasFixedCapacity ? (
          <div className="availability-track" aria-hidden="true">
            <span style={{ width: `${reservedPercent}%` }} />
          </div>
        ) : null}
      </div>

      <Link className="deadline-cta" href={ctaHref} onClick={() => trackBagelitoEvent("CTA Click", { location: "deadline_banner", target: batchAvailability.accepting ? "packs" : "waitlist" })}>
        <MessageCircle size={17} />
        {ctaLabel}
      </Link>
    </aside>
  );
}
