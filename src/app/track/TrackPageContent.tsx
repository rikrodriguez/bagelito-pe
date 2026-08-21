"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, LoaderCircle, MapPin, MessageCircle, Package2, ReceiptText, RefreshCcw, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trackBagelitoEvent } from "@/lib/analytics";
import type { PublicTrackedOrder } from "@/lib/tracking/service";
import { getWhatsAppHref } from "@/lib/whatsapp";

type Props = {
  initialOrderCode?: string;
};

type TrackApiResponse = {
  error?: string;
  ok?: boolean;
  order?: PublicTrackedOrder;
};

const terminalStatuses = new Set(["cancelled", "delivered"]);
const timelineOrder = [
  "payment_pending_review",
  "payment_confirmed",
  "in_production",
  "ready_for_delivery",
  "delivered",
] as const;

function isTimelineStatus(value: string): value is (typeof timelineOrder)[number] {
  return timelineOrder.includes(value as (typeof timelineOrder)[number]);
}

function formatDate(value: string | null | undefined, locale: "en" | "es") {
  if (!value) return locale === "es" ? "Por definir" : "To be announced";
  return new Date(value).toLocaleString(locale === "es" ? "es-PE" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

export function TrackPageContent({ initialOrderCode = "" }: Props) {
  const { copy, locale } = useLanguage();
  const t = copy.track;
  const [orderCode, setOrderCode] = useState(initialOrderCode);
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [result, setResult] = useState<PublicTrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const lookupRef = useRef<{ contact: string; orderCode: string } | null>(null);

  const statusCopy = useMemo(() => ({
    cancelled: t.status.cancelled,
    delivered: t.status.delivered,
    in_production: t.status.inProduction,
    needs_correction: t.status.needsCorrection,
    payment_confirmed: t.status.paymentConfirmed,
    payment_pending_review: t.status.paymentPending,
    ready_for_delivery: t.status.readyForDelivery,
  }), [t.status]);

  const helperCopy = useMemo(() => ({
    cancelled: t.helpers.cancelled,
    delivered: t.helpers.delivered,
    in_production: t.helpers.inProduction,
    needs_correction: t.helpers.needsCorrection,
    payment_confirmed: t.helpers.paymentConfirmed,
    payment_pending_review: t.helpers.paymentPending,
    ready_for_delivery: t.helpers.readyForDelivery,
  }), [t.helpers]);

  const performLookup = useCallback(async ({
    nextContact,
    nextOrderCode,
    silent = false,
  }: {
    nextContact: string;
    nextOrderCode: string;
    silent?: boolean;
  }) => {
    const trimmedContact = nextContact.trim();
    const trimmedOrderCode = nextOrderCode.trim().toUpperCase();

    if (!trimmedContact && !trimmedOrderCode) {
      if (!silent) setError(t.errors.required);
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setSubmitting(true);
      setError("");
    }

    try {
      const response = await fetch("/api/track", {
        body: JSON.stringify({
          contact: trimmedContact,
          orderCode: trimmedOrderCode,
          website,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as TrackApiResponse;

      if (!response.ok || !payload.ok || !payload.order) {
        throw new Error(payload.error ?? t.errors.generic);
      }

      lookupRef.current = { contact: trimmedContact, orderCode: trimmedOrderCode };
      setResult(payload.order);
      setLastCheckedAt(new Date().toISOString());

      if (!silent) {
        trackBagelitoEvent("Track Lookup Success", { orderCode: trimmedOrderCode || "contact", status: payload.order.status });
      }
    } catch (lookupError) {
      if (!silent) {
        trackBagelitoEvent("Track Lookup Error", { orderCode: trimmedOrderCode || "contact" });
        setResult(null);
        setError(lookupError instanceof Error ? lookupError.message : t.errors.generic);
      }
    } finally {
      setSubmitting(false);
      setRefreshing(false);
    }
  }, [t.errors.generic, t.errors.required, website]);

  useEffect(() => {
    if (!result || terminalStatuses.has(result.status) || !lookupRef.current) return;

    const interval = window.setInterval(() => {
      if (document.hidden || !lookupRef.current) return;
      void performLookup({
        nextContact: lookupRef.current.contact,
        nextOrderCode: lookupRef.current.orderCode,
        silent: true,
      });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [performLookup, result]);

  const currentStatusLabel = result ? statusCopy[result.status as keyof typeof statusCopy] ?? result.status : "";
  const culqiPendingHelper = locale === "es"
    ? "Culqi está confirmando el pago automáticamente. No necesitas enviar ni subir un voucher."
    : "Culqi is confirming payment automatically. You do not need to send or upload a voucher.";
  const culqiFailedHelper = locale === "es"
    ? "Culqi no pudo confirmar este intento. Vuelve al checkout o escríbenos para ayudarte."
    : "Culqi could not confirm this attempt. Return to checkout or message us for help.";
  const currentHelper = result
    ? result.paymentProvider === "culqi" && result.status === "payment_pending_review"
      ? culqiPendingHelper
      : result.paymentProvider === "culqi" && result.status === "needs_correction"
        ? culqiFailedHelper
        : helperCopy[result.status as keyof typeof helperCopy] ?? t.helpers.generic
    : "";
  const progressStatus: (typeof timelineOrder)[number] = result && isTimelineStatus(result.status)
    ? result.status
    : "payment_pending_review";
  const timelineProgressIndex = result ? timelineOrder.indexOf(progressStatus) : 0;

  return (
    <section className="track-shell">
      <div className="track-hero">
        <div>
          <p className="kicker">{t.kicker}</p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="track-badge">
          <ShieldCheck size={24} />
          <strong>{t.safeLookup}</strong>
          <span>{t.safeLookupNote}</span>
        </div>
      </div>

      <div className="track-form-card">
        {error ? <div className="reserve-alert">{error}</div> : null}
        <div className="form-grid track-form-grid">
          <label className="bot-trap-field" aria-hidden="true">
            Website
            <input autoComplete="off" name="website" tabIndex={-1} value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          <label>
            {t.fields.contact}
            <input autoCapitalize="off" autoCorrect="off" placeholder={t.fields.contactPlaceholder} value={contact} onChange={(event) => setContact(event.target.value)} />
          </label>
          <label>
            {t.fields.orderCode}
            <input autoCapitalize="characters" autoCorrect="off" placeholder="BAG-000001" value={orderCode} onChange={(event) => setOrderCode(event.target.value.toUpperCase())} />
          </label>
        </div>

        <div className="track-form-actions">
          <button
            className="pill-button pink"
            type="button"
            disabled={submitting}
            onClick={() => {
              trackBagelitoEvent("Track Lookup Attempt", { orderCode: orderCode.trim().toUpperCase() || "contact" });
              void performLookup({ nextContact: contact, nextOrderCode: orderCode });
            }}
          >
            {submitting ? <LoaderCircle className="spin" size={18} /> : <ReceiptText size={18} />}
            {submitting ? t.submitting : t.submit}
          </button>
          <p>{t.helper}</p>
        </div>
      </div>

      {result ? (
        <div className="track-results">
          <div className="track-status-card">
            <div className="track-status-top">
              <div>
                <p className="kicker">{t.currentStatus}</p>
                <h2>{currentStatusLabel}</h2>
                <p>{currentHelper}</p>
              </div>
              <span className={`status-pill ${result.status === "delivered" ? "received" : result.status === "needs_correction" ? "pending" : ""}`}>{currentStatusLabel}</span>
            </div>

            <div className="track-timeline">
              {timelineOrder.map((status, index) => {
                const done = index <= timelineProgressIndex;
                const timestamp = result.history.find((item) => item.status === status)?.createdAt ?? (status === "payment_pending_review" ? result.createdAt : null);
                return (
                  <div className={`track-step ${done ? "done" : ""}`} key={status}>
                    <span className="track-step-dot" />
                    <div>
                      <strong>{statusCopy[status]}</strong>
                      <small>{timestamp ? formatDate(timestamp, locale) : t.pendingStep}</small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="track-meta-grid">
              <div><span>{t.labels.orderCode}</span><strong>{result.orderCode}</strong></div>
              <div><span>{t.labels.customer}</span><strong>{result.customerName}</strong></div>
              <div><span>{t.labels.pack}</span><strong>{result.packName}</strong></div>
              <div><span>{t.labels.total}</span><strong>S/{result.totalAmount}</strong></div>
              <div><span>{t.labels.district}</span><strong>{result.district}</strong></div>
              <div><span>{t.labels.batch}</span><strong>{result.batchName ?? t.toBeAnnounced}</strong></div>
              <div><span>{t.labels.deliveryDate}</span><strong>{formatDate(result.deliveryDate, locale)}</strong></div>
              <div><span>{t.labels.submittedAt}</span><strong>{formatDate(result.createdAt, locale)}</strong></div>
            </div>

            <div className="track-refresh-row">
              <span><Clock3 size={15} /> {t.lastChecked}: {formatDate(lastCheckedAt, locale)}</span>
              {!terminalStatuses.has(result.status) ? <span>{refreshing ? t.refreshing : t.autoRefresh}</span> : null}
            </div>
          </div>

          <div className="track-detail-grid">
            <div className="track-side-card">
              <div className="track-card-title"><Package2 size={18} /><h3>{t.itemsTitle}</h3></div>
              <ul className="track-item-list">
                {result.items.map((item) => (
                  <li key={`${item.flavorSlug}-${item.flavorName}`}>
                    <span>{item.flavorName}</span>
                    <strong>{item.quantity}x</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="track-side-card">
              <div className="track-card-title"><MapPin size={18} /><h3>{t.nextStepTitle}</h3></div>
              <p>{currentHelper}</p>
              <div className="track-actions">
                <a
                  className="pill-button outline"
                  href={getWhatsAppHref(`${locale === "es" ? "Hola Bagelito.pe, quiero ayuda con mi pedido " : "Hi Bagelito.pe, I need help with my order "}${result.orderCode}.`)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackBagelitoEvent("WhatsApp Click", { location: "track", target: "support" })}
                >
                  <MessageCircle size={18} />
                  {t.messageBagelito}
                </a>
                <button
                  className="pill-button outline"
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setError("");
                    setContact("");
                    setLastCheckedAt(null);
                    lookupRef.current = null;
                  }}
                >
                  <RefreshCcw size={18} />
                  {t.checkAnother}
                </button>
              </div>
              <p className="track-support-note">{t.supportNote}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="track-return-row">
        <Link className="mini-link" href="/">{t.backHome}</Link>
      </div>
    </section>
  );
}
