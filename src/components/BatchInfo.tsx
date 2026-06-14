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
    </section>
  );
}
