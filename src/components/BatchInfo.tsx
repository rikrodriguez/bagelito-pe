"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CalendarDays, PackageCheck, Truck, UsersRound } from "lucide-react";
import { packs } from "@/lib/catalog";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { useLanguage } from "./LanguageProvider";

const rowIcons = [CalendarDays, CalendarDays, CalendarDays, Truck, UsersRound, PackageCheck];

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (copy, [key, value]) => copy.replace(`{${key}}`, String(value)),
    template,
  );
}

function formatBatchDate(value: string | null, locale: "en" | "es", fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale === "es" ? "es-PE" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(date);
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function BatchInfo() {
  const { locale, copy } = useLanguage();
  const batch = useBatchAvailability();
  const [currentTime, setCurrentTime] = useState(0);
  const live = copy.batch.live;

  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  function getStatusLabel() {
    if (batch.status === "orders_open") return batch.accepting ? live.statuses.open : live.statuses.closed;
    if (batch.status === "waitlist_open") return live.statuses.waitlist;
    if (batch.status === "in_production") return live.statuses.production;
    if (batch.status === "delivered") return live.statuses.delivered;
    return live.statuses.closed;
  }

  function getCapacityLabel() {
    if (batch.capacityPacks) {
      return fillTemplate(live.packsAvailable, {
        remaining: batch.remainingPacks ?? 0,
        total: batch.capacityPacks,
      });
    }

    if (batch.capacityBagels) {
      return fillTemplate(live.bagelsAvailable, {
        remaining: batch.remainingBagels ?? 0,
        total: batch.capacityBagels,
      });
    }

    return live.noFixedLimit;
  }

  function getGauge() {
    if (batch.capacityPacks) {
      return {
        percent: clampPercent((batch.reservedPacks / batch.capacityPacks) * 100),
        title: live.capacityProgressTitle,
        text: fillTemplate(live.capacityProgressText, {
          reserved: batch.reservedPacks,
          total: batch.capacityPacks,
          unit: live.packsUnit,
        }),
      };
    }

    if (batch.capacityBagels) {
      return {
        percent: clampPercent((batch.reservedBagels / batch.capacityBagels) * 100),
        title: live.capacityProgressTitle,
        text: fillTemplate(live.capacityProgressText, {
          reserved: batch.reservedBagels,
          total: batch.capacityBagels,
          unit: live.bagelsUnit,
        }),
      };
    }

    const opensAt = batch.ordersOpenAt ? new Date(batch.ordersOpenAt).getTime() : 0;
    const closesAt = batch.ordersCloseAt ? new Date(batch.ordersCloseAt).getTime() : 0;
    if (currentTime && opensAt && closesAt && closesAt > opensAt) {
      return {
        percent: clampPercent(((currentTime - opensAt) / (closesAt - opensAt)) * 100),
        title: live.windowProgressTitle,
        text: live.windowProgressText,
      };
    }

    return {
      percent: 0,
      title: live.liveReservationsTitle,
      text: fillTemplate(live.liveReservationsText, { reserved: batch.reservedPacks }),
    };
  }

  const nextOrderWindow = batch.accepting
    ? live.openNow
    : batch.status === "waitlist_open"
      ? formatBatchDate(batch.ordersOpenAt, locale, live.comingSoon)
      : live.comingSoon;
  const minimumOrder = Math.min(...packs.map((pack) => pack.units));
  const values = [
    getStatusLabel(),
    nextOrderWindow,
    formatBatchDate(batch.ordersCloseAt, locale, live.comingSoon),
    formatBatchDate(batch.deliveryDate, locale, live.scheduledDate),
    getCapacityLabel(),
    fillTemplate(live.minimumOrder, { count: minimumOrder }),
  ];
  const gauge = getGauge();
  const gaugeStyle = {
    "--batch-progress": `${gauge.percent}%`,
  } as CSSProperties;

  return (
    <section id="next-batch" className="batch-section section-pad">
      <div className="batch-card main-batch-card">
        <div>
          <h2>{copy.batch.title}</h2>
          <p>{batch.accepting ? copy.batch.introOpen : copy.batch.intro}</p>
        </div>
        <div className="batch-grid">
          <div className="batch-list">
            {copy.batch.rows.map((label, index) => {
              const Icon = rowIcons[index];
              return (
                <div className="batch-row" key={label}>
                  <Icon aria-hidden="true" size={18} />
                  <span>{label}</span>
                  <strong>{values[index]}</strong>
                </div>
              );
            })}
          </div>
          <div className="batch-gauge">
            <div
              aria-label={gauge.title}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={gauge.percent}
              className="gauge-ring"
              role="progressbar"
              style={gaugeStyle}
            >
              <span className="gauge-ring-value">{gauge.percent}%</span>
            </div>
            <strong>{gauge.title}</strong>
            <span>{gauge.text}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
