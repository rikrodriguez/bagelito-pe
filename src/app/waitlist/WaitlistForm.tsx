"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Send, UsersRound } from "lucide-react";
import { packs, type PackSlug } from "@/data/packs";
import { trackBagelitoEvent } from "@/lib/analytics";
import { isPackSlug } from "@/lib/catalog";
import { packCopy } from "@/lib/i18n";
import { useBatchAvailability } from "@/components/BatchAvailabilityProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { RollingBagel } from "@/components/RollingBagel";

type WaitlistFormProps = {
  initialPackSlug?: PackSlug;
};

type ContactPreference = "whatsapp" | "email" | "both";

function getTodayLabel(locale: "en" | "es") {
  return new Date().toLocaleDateString(locale === "es" ? "es-PE" : "en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Lima",
    year: "numeric",
  });
}

export function WaitlistForm({ initialPackSlug }: WaitlistFormProps) {
  const { locale, copy } = useLanguage();
  const batchAvailability = useBatchAvailability();
  const w = copy.waitlist;
  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [preferredPackSlug, setPreferredPackSlug] = useState(initialPackSlug ?? "");
  const [contactPreference, setContactPreference] = useState<ContactPreference>("whatsapp");
  const [notes, setNotes] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ listDate: string; listLabel: string } | null>(null);

  const selectedPackName = useMemo(() => {
    if (!preferredPackSlug) return w.noPreference;
    return isPackSlug(preferredPackSlug) ? packCopy[locale][preferredPackSlug].name : preferredPackSlug;
  }, [locale, preferredPackSlug, w.noPreference]);

  async function submitWaitlist() {
    setError("");

    if (!customerName.trim() || !whatsapp.trim() || !email.trim() || !consentAccepted) {
      setError(locale === "es" ? "Completa nombre, WhatsApp, email y consentimiento." : "Complete name, WhatsApp, email, and consent.");
      return;
    }

    setSubmitting(true);
    trackBagelitoEvent("Waitlist Submit Attempt", { preferredPack: preferredPackSlug || "none" });

    try {
      const response = await fetch("/api/waitlist", {
        body: JSON.stringify({
          consentAccepted,
          contactPreference,
          customerName,
          email,
          locale,
          notes,
          preferredPackSlug,
          source: "waitlist_page",
          website,
          whatsapp,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as { ok?: boolean; error?: string; signup?: { list_date: string; list_label: string } };

      if (!response.ok || !result.ok || !result.signup) {
        throw new Error(result.error ?? w.error);
      }

      trackBagelitoEvent("Waitlist Submitted", { preferredPack: preferredPackSlug || "none" });
      setSuccess({ listDate: result.signup.list_date, listLabel: result.signup.list_label });
    } catch (submitError) {
      trackBagelitoEvent("Waitlist Submit Error", { preferredPack: preferredPackSlug || "none" });
      setError(submitError instanceof Error ? submitError.message : w.error);
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="waitlist-shell">
        <div className="waitlist-success-card">
          <CheckCircle2 size={42} />
          <p className="kicker">{success.listLabel}</p>
          <h1>{w.successTitle}</h1>
          <p>{w.successText}</p>
          <div className="waitlist-success-grid">
            <div><span>{w.fields.preferredPack}</span><strong>{selectedPackName}</strong></div>
            <div><span>{w.listDate}</span><strong>{success.listDate}</strong></div>
          </div>
          <Link className="pill-button pink" href="/">{w.backHome}</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="waitlist-shell">
      <div className="waitlist-hero">
        <div>
          <p className="kicker">{w.kicker}</p>
          <h1>{w.title}</h1>
          <p>{w.intro}</p>
          <div className="waitlist-status-row">
            <span><UsersRound size={16} /> {w.currentStatus}</span>
            <strong>{batchAvailability.accepting ? w.openStatus : w.closedStatus}</strong>
          </div>
        </div>
        <RollingBagel variant="rainbow" size="md" />
      </div>

      <div className="waitlist-form-card">
        <div className="waitlist-date-badge">
          <span>{w.listDate}</span>
          <strong>{getTodayLabel(locale)}</strong>
        </div>

        {error ? <div className="reserve-alert">{error}</div> : null}

        <div className="form-grid">
          <label className="bot-trap-field" aria-hidden="true">
            Website
            <input autoComplete="off" name="website" tabIndex={-1} value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          <label>{w.fields.fullName}<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          <label>{w.fields.whatsapp}<input required value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label>
          <label>{w.fields.email}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>{w.fields.preferredPack}
            <select value={preferredPackSlug} onChange={(event) => setPreferredPackSlug(event.target.value)}>
              <option value="">{w.noPreference}</option>
              {packs.map((pack) => <option key={pack.slug} value={pack.slug}>{packCopy[locale][pack.slug].name}</option>)}
            </select>
          </label>
          <label>{w.fields.contactPreference}
            <select value={contactPreference} onChange={(event) => setContactPreference(event.target.value as ContactPreference)}>
              <option value="whatsapp">{w.contactOptions.whatsapp}</option>
              <option value="email">{w.contactOptions.email}</option>
              <option value="both">{w.contactOptions.both}</option>
            </select>
          </label>
          <label className="wide">{w.fields.notes}<textarea rows={4} value={notes} placeholder={w.notesPlaceholder} onChange={(event) => setNotes(event.target.value)} /></label>
          <label className="marketing-box wide">
            <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
            <span>{w.consent}</span>
          </label>
        </div>

        <button className="pill-button pink submit-button" type="button" disabled={submitting} onClick={submitWaitlist}>
          <Send size={17} />
          {submitting ? w.submitting : w.submit}
        </button>
        <p className="waitlist-privacy-note"><MessageCircle size={15} /> {copy.batch.noSpam}</p>
      </div>
    </section>
  );
}
