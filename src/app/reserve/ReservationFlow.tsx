"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import type { Flavor } from "@/data/flavors";
import type { Pack, PackSlug } from "@/data/packs";
import { RollingBagel, type BagelVariant } from "@/components/RollingBagel";
import { useLanguage } from "@/components/LanguageProvider";
import { flavorCopy, packCopy } from "@/lib/i18n";
import { districtOptions } from "@/lib/reservations/schema";

type Props = {
  packs: Pack[];
  flavors: Flavor[];
  initialPackSlug: PackSlug;
};

type Details = {
  customerName: string;
  whatsapp: string;
  email: string;
  deliveryAddress: string;
  district: string;
  addressReference: string;
  deliveryNotes: string;
};

const initialDetails: Details = {
  customerName: "",
  whatsapp: "",
  email: "",
  deliveryAddress: "",
  district: "Miraflores",
  addressReference: "",
  deliveryNotes: "",
};

export function ReservationFlow({ packs, flavors, initialPackSlug }: Props) {
  const { locale, copy } = useLanguage();
  const r = copy.reserve;
  const [step, setStep] = useState(1);
  const [packSlug, setPackSlug] = useState<PackSlug>(initialPackSlug);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [details, setDetails] = useState<Details>(initialDetails);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPack = packs.find((pack) => pack.slug === packSlug) ?? packs[0];
  const localizedSelectedPack = packCopy[locale][selectedPack.slug];
  const selectedTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const selectedItems = useMemo(() => {
    if (selectedPack.packType === "single") {
      return singleFlavor ? [{ flavorSlug: singleFlavor, quantity: selectedPack.units }] : [];
    }

    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([flavorSlug, quantity]) => ({ flavorSlug, quantity }));
  }, [quantities, selectedPack, singleFlavor]);

  const flavorSummary = selectedItems.map((item) => {
    const flavor = flavors.find((candidate) => candidate.slug === item.flavorSlug);
    return {
      ...item,
      flavorName: flavorCopy[locale][item.flavorSlug] ?? flavor?.name ?? item.flavorSlug,
    };
  });

  function getFlavorLabel(flavorSlug: string) {
    const flavor = flavors.find((candidate) => candidate.slug === flavorSlug);
    return flavorCopy[locale][flavorSlug] ?? flavor?.name ?? flavorSlug;
  }

  function selectPack(nextSlug: PackSlug) {
    setPackSlug(nextSlug);
    setQuantities({});
    setSingleFlavor("");
    setError("");
  }

  function changeQuantity(flavorSlug: string, delta: number) {
    setQuantities((current) => {
      const currentQuantity = current[flavorSlug] ?? 0;
      const otherTotal = selectedTotal - currentQuantity;
      const next = Math.max(0, Math.min(selectedPack.units - otherTotal, currentQuantity + delta));
      return { ...current, [flavorSlug]: next };
    });
  }

  function validateFlavorStep() {
    return selectedPack.packType === "mixed" ? selectedTotal === selectedPack.units : Boolean(singleFlavor);
  }

  function validateDeliveryStep() {
    return Boolean(details.customerName && details.whatsapp && details.email && details.deliveryAddress && details.district);
  }

  function goNext() {
    setError("");
    if (step === 2 && !validateFlavorStep()) {
      setError(selectedPack.packType === "mixed" ? r.errors.exactBagels.replace("{units}", String(selectedPack.units)) : r.errors.chooseFlavor);
      return;
    }

    if (step === 3 && !validateDeliveryStep()) {
      setError(r.errors.deliveryRequired);
      return;
    }

    setStep((current) => Math.min(4, current + 1));
  }

  async function submitReservation() {
    setError("");
    if (!termsAccepted) {
      setError(r.errors.terms);
      return;
    }

    const formData = new FormData();
    formData.set("packSlug", selectedPack.slug);
    formData.set("items", JSON.stringify(selectedItems));
    Object.entries(details).forEach(([key, value]) => formData.set(key, value));
    formData.set("termsAccepted", String(termsAccepted));

    setSubmitting(true);
    try {
      const response = await fetch("/api/reservations", { method: "POST", body: formData });
      const result = await response.json() as { ok?: boolean; orderCode?: string; error?: string };
      if (!response.ok || !result.ok || !result.orderCode) {
        throw new Error(result.error ?? r.errors.submit);
      }
      window.location.href = "/reserve/success?order=" + encodeURIComponent(result.orderCode) + "&pack=" + encodeURIComponent(selectedPack.name) + "&packSlug=" + encodeURIComponent(selectedPack.slug) + "&amount=" + selectedPack.amount;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : r.errors.submit);
      setSubmitting(false);
    }
  }

  return (
    <section className="reserve-shell">
      <div className="reserve-herolet">
        <div>
          <p className="kicker">{r.heroKicker}</p>
          <h1>{r.heroTitle}</h1>
          <p>{r.heroText}</p>
        </div>
        <RollingBagel variant="rainbow" size="md" />
      </div>

      <div className="reserve-progress">
        {r.steps.map((label, index) => (
          <button key={label} type="button" className={step === index + 1 ? "active" : ""} onClick={() => setStep(index + 1)}>
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {error ? <div className="reserve-alert">{error}</div> : null}

      {step === 1 ? (
        <div className="reserve-card-grid">
          {packs.map((pack) => {
            const localizedPack = packCopy[locale][pack.slug];
            return (
              <button key={pack.slug} type="button" className={"reserve-pack-option " + (packSlug === pack.slug ? "selected" : "")} onClick={() => selectPack(pack.slug)}>
                <span>{pack.units} {r.bagels}</span>
                <strong>{localizedPack.name}</strong>
                <b>S/{pack.amount}</b>
                <small>{localizedPack.typeLabel}</small>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="reserve-card">
          <div className="reserve-step-title">
            <h2>{r.chooseFlavors}</h2>
            <span>{selectedPack.packType === "mixed" ? selectedTotal + " / " + selectedPack.units + " " + r.selected : singleFlavor ? selectedPack.units + " x " + getFlavorLabel(singleFlavor) : r.chooseOneFlavor}</span>
          </div>
          <div className="flavor-select-grid">
            {flavors.map((flavor) => {
              const quantity = quantities[flavor.slug] ?? 0;
              const isSingleSelected = singleFlavor === flavor.slug;
              const flavorLabel = flavorCopy[locale][flavor.slug] ?? flavor.name;
              return (
                <article className={"flavor-select-card " + (isSingleSelected ? "selected" : "")} key={flavor.slug}>
                  <RollingBagel variant={flavor.variant as BagelVariant} size="sm" label={flavorLabel} />
                  <h3>{flavorLabel}</h3>
                  <p>{flavor.category === "premium" ? r.premiumSeasonal : r.classic} S/{flavor.price}</p>
                  {selectedPack.packType === "mixed" ? (
                    <div className="quantity-control">
                      <button type="button" onClick={() => changeQuantity(flavor.slug, -1)} aria-label={r.remove + " " + flavorLabel}><Minus size={15} /></button>
                      <strong>{quantity}</strong>
                      <button type="button" onClick={() => changeQuantity(flavor.slug, 1)} aria-label={r.add + " " + flavorLabel}><Plus size={15} /></button>
                    </div>
                  ) : (
                    <button type="button" className="select-flavor-button" onClick={() => setSingleFlavor(flavor.slug)}>{isSingleSelected ? <Check size={16} /> : null} {r.select}</button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="reserve-card form-card">
          <h2>{r.deliveryDetails}</h2>
          <div className="form-grid">
            <label>{r.fields.fullName}<input required value={details.customerName} onChange={(event) => setDetails({ ...details, customerName: event.target.value })} /></label>
            <label>{r.fields.whatsapp}<input required value={details.whatsapp} onChange={(event) => setDetails({ ...details, whatsapp: event.target.value })} /></label>
            <label>{r.fields.email}<input type="email" required value={details.email} onChange={(event) => setDetails({ ...details, email: event.target.value })} /></label>
            <label>{r.fields.district}<select value={details.district} onChange={(event) => setDetails({ ...details, district: event.target.value })}>{districtOptions.map((district) => <option key={district} value={district}>{district === "Other" ? r.otherDistrict : district}</option>)}</select></label>
            <label className="wide">{r.fields.deliveryAddress}<input required value={details.deliveryAddress} onChange={(event) => setDetails({ ...details, deliveryAddress: event.target.value })} /></label>
            <label>{r.fields.addressReference}<input value={details.addressReference} onChange={(event) => setDetails({ ...details, addressReference: event.target.value })} /></label>
            <label className="wide">{r.fields.deliveryNotes}<textarea rows={4} value={details.deliveryNotes} onChange={(event) => setDetails({ ...details, deliveryNotes: event.target.value })} /></label>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="reserve-card review-card">
          <h2>{r.reviewTitle}</h2>
          <div className="review-grid">
            <div><span>{r.reviewLabels.pack}</span><strong>{localizedSelectedPack.name}</strong></div>
            <div><span>{r.reviewLabels.totalAmount}</span><strong>S/{selectedPack.amount}</strong></div>
            <div><span>{r.reviewLabels.statusAfterSubmit}</span><strong>{r.statusPending}</strong></div>
            <div><span>{r.reviewLabels.customer}</span><strong>{details.customerName}</strong></div>
            <div><span>{r.reviewLabels.whatsapp}</span><strong>{details.whatsapp}</strong></div>
            <div><span>{r.reviewLabels.email}</span><strong>{details.email}</strong></div>
            <div className="wide"><span>{r.reviewLabels.address}</span><strong>{details.deliveryAddress}, {details.district === "Other" ? r.otherDistrict : details.district}</strong></div>
            <div className="wide"><span>{r.reviewLabels.flavors}</span><strong>{flavorSummary.map((item) => item.quantity + " x " + item.flavorName).join(", ")}</strong></div>
          </div>
          <label className="terms-box">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            {r.terms}
          </label>
          <button className="pill-button pink submit-button" type="button" disabled={submitting} onClick={submitReservation}>{submitting ? r.submitting : r.submit}</button>
        </div>
      ) : null}

      <div className="reserve-nav">
        <button className="pill-button outline" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft size={17} /> {r.back}</button>
        {step < 4 ? <button className="pill-button pink" type="button" onClick={goNext}>{r.continue} <ArrowRight size={17} /></button> : null}
      </div>
    </section>
  );
}
