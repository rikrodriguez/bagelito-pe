"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Gauge, MessageCircle } from "lucide-react";
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
  const difference = Math.max(deadline - Date.now(), 0);
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((difference / (1000 * 60)) % 60);
  const seconds = Math.floor((difference / 1000) % 60);

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
    <section className="batch-deadline" aria-label={copy.deadline.aria}>
      <div className="deadline-copy">
        <div className="mini-badge"><CalendarClock size={18} /> {copy.deadline.badge}</div>
        <h2>{copy.deadline.title}</h2>
        <p>{copy.deadline.text}</p>
      </div>
      <div className="countdown-grid" aria-label={copy.deadline.countdownLabel}>
        <span><strong>{timeLeft.days}</strong>{copy.deadline.days}</span>
        <span><strong>{timeLeft.hours}</strong>{copy.deadline.hours}</span>
        <span><strong>{timeLeft.minutes}</strong>{copy.deadline.minutes}</span>
        <span><strong>{timeLeft.seconds}</strong>{copy.deadline.seconds}</span>
      </div>
      <div className="batch-progress" aria-label={copy.deadline.progressLabel}>
        <div className="batch-progress-top">
          <span><Gauge size={17} /> {copy.deadline.progressTitle}</span>
          <strong>{copy.deadline.available.replace("{percent}", String(availablePercent))}</strong>
        </div>
        <div className="batch-progress-bar"><span style={{ width: `${reservedPercent}%` }} /></div>
        <p>{copy.deadline.progressText}</p>
      </div>
      <a className="pill-button pink deadline-button" href="#packs"><MessageCircle size={18} /> {copy.deadline.cta}</a>
    </section>
  );
}
