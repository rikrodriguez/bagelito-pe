"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CalendarDays, PackageCheck, Truck, UsersRound } from "lucide-react";
import { packs } from "@/lib/catalog";
import { getPublicBatchDisplay } from "@/lib/public-batch-display";
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

  // Hide closed-batch dates on SSR; only show future dates after hydration.
  const publicDisplay = getPublicBatchDisplay(batch, currentTime);
  const nextOrderWindow = batch.accepting
    ? live.openNow
    : publicDisplay.nextOpeningAt
      ? formatBatchDate(publicDisplay.nextOpeningAt, locale, live.comingSoon)
      : live.comingSoon;
  const minimumOrder = Math.min(...packs.map(pack => pack.units));
  const visibleRows = [
    { index: 0, value: getStatusLabel() },
    { index: 1, value: nextOrderWindow },
    ...(batch.accepting ? [
      { index: 2, value: formatBatchDate(batch.ordersCloseAt, locale, live.comingSoon) },
      { index: 3, value: formatBatchDate(batch.deliveryDate, locale, live.scheduledDate) },
      { index: 4, value: getCapacityLabel() },
    ] : publicDisplay.showFutureDelivery ? [
      { index: 3, value: formatBatchDate(batch.deliveryDate, locale, live.scheduledDate) },
    ] : []),
    { index: 5, value: fillTemplate(live.minimumOrder, { count: minimumOrder }) },
  ];
  const gauge = batch.accepting ? getGauge() : null;
  const gaugeStyle = gauge ? {
    "--batch-progress": String(gauge.percent) + "%",
  } as CSSProperties : undefined;

  return (
    <section id="next-batch" className="batch-section section-pad">
      <div className="batch-card main-batch-card">
        <div>
          <h2>{copy.batch.title}</h2>
          <p>{batch.accepting ? copy.batch.introOpen : copy.batch.intro}</p>
        </div>
        <div className="batch-grid">
          <div className="batch-list">
            {visibleRows.map(({ index, value }) => {
              const Icon = rowIcons[index];
              const label = copy.batch.rows[index];
              if (!Icon || !label) return null;
              return (
                <div className="batch-row" key={index}>
                  <Icon aria-hidden="true" size={18} />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
          {gauge ? (
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
          ) : (
            <div className="batch-gauge">
              <strong>{copy.batch.waitlistTitle}</strong>
              <span>{copy.batch.waitlistIntro}</span>
              <Link className="pill-button pink" href="/waitlist">{copy.batch.cta}</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
