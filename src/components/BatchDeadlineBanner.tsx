"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Gauge, MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { useLanguage } from "./LanguageProvider";

const deadline = new Date("2026-06-30T23:59:00-05:00").getTime();
const reservedPercent = 68;
const availablePercent = 100 - reservedPercent;
const initialTimeLeft = {
  days: "--",
  hours: "--",
  minutes: "--",
  seconds: "--",
};

function getTimeLeft() {
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

export function BatchDeadlineBanner() {
  const { copy } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const interval = window.setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <aside className="batch-deadline-banner" aria-label={copy.deadline.aria}>
      <div className="deadline-banner-copy">
        <span><CalendarClock size={17} /> {copy.deadline.title}</span>
        <strong>{copy.deadline.close}</strong>
      </div>

      <div className="deadline-timer" aria-label={copy.deadline.timerAria}>
        <span><strong>{timeLeft.days}</strong><small>{copy.deadline.days}</small></span>
        <span><strong>{timeLeft.hours}</strong><small>{copy.deadline.hours}</small></span>
        <span><strong>{timeLeft.minutes}</strong><small>{copy.deadline.minutes}</small></span>
        <span><strong>{timeLeft.seconds}</strong><small>{copy.deadline.seconds}</small></span>
      </div>

      <div className="batch-availability">
        <div className="availability-label">
          <span><Gauge size={17} /> {reservedPercent}% {copy.deadline.reserved}</span>
          <strong>{availablePercent}% {copy.deadline.available}</strong>
        </div>
        <div className="availability-track" aria-hidden="true">
          <span style={{ width: `${reservedPercent}%` }} />
        </div>
      </div>

      <Link className="deadline-cta" href="/#packs" onClick={() => trackBagelitoEvent("CTA Click", { location: "deadline_banner", target: "packs" })}>
        <MessageCircle size={17} />
        {copy.deadline.cta}
      </Link>
    </aside>
  );
}
