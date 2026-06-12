"use client";

import { CalendarDays, LockKeyhole, PackageCheck, Truck, UsersRound } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const rowIcons = [CalendarDays, CalendarDays, CalendarDays, Truck, UsersRound, PackageCheck];

export function BatchInfo() {
  const { copy } = useLanguage();

  return (
    <section id="next-batch" className="batch-section section-pad">
      <div className="batch-card main-batch-card">
        <div>
          <h2>{copy.batch.title}</h2>
          <p>{copy.batch.intro}</p>
        </div>
        <div className="batch-grid">
          <div className="batch-list">
            {copy.batch.rows.map(([label, value], index) => {
              const Icon = rowIcons[index];
              return (
                <div className="batch-row" key={label}>
                  <Icon size={18} />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
          <div className="batch-gauge">
            <div className="gauge-ring"><LockKeyhole size={34} /></div>
            <strong>{copy.batch.gaugeTitle}</strong>
            <span>{copy.batch.gaugeText}</span>
          </div>
        </div>
      </div>
      <aside className="batch-card waitlist-card">
        <h2>{copy.batch.waitlistTitle}</h2>
        <p>{copy.batch.waitlistIntro}</p>
        <ul>
          {copy.batch.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
        <a className="pill-button purple" href="https://wa.me/51917547745" target="_blank" rel="noreferrer">{copy.batch.cta}</a>
        <small>{copy.batch.noSpam}</small>
      </aside>
    </section>
  );
}
