"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Gauge, MessageCircle } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const deadline = new Date("2026-06-30T23:59:00-05:00").getTime();
const reservedPercent = 68;
const availablePercent = 100 - reservedPercent;

function getTimeLeft() {
  const diff = Math.max(0, deadline - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
}

export function BatchDeadlineBanner() {
  const { copy } = useLanguage();
  const [timeLeft, setTimeLeft] = useState({ days: "--", hours: "--", minutes: "--" });

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const interval = window.setInterval(() => setTimeLeft(getTimeLeft()), 60_000);
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

      <a className="deadline-banner-cta" href="https://wa.me/51917547745" target="_blank" rel="noreferrer">
        <MessageCircle size={16} /> {copy.deadline.cta}
      </a>
    </aside>
  );
}
