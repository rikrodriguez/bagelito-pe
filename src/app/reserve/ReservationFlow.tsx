"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import type { Flavor } from "@/data/flavors";
import type { Pack, PackSlug } from "@/data/packs";
import { RollingBagel, type BagelVariant } from "@/components/RollingBagel";
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

const steps = ["Pack", "Flavors", "Delivery", "Review"] as const;
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
  const [step, setStep] = useState(1);
  const [packSlug, setPackSlug] = useState<PackSlug>(initialPackSlug);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [details, setDetails] = useState<Details>(initialDetails);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPack = packs.find((pack) => pack.slug === packSlug) ?? packs[0];
  const selectedTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const selectedItems = useMemo(() => {
    if (selectedPack.packType === "single") {
      return singleFlavor ? [{ flavorSlug: singleFlavor, quantity: selectedPack.units }] : [];
    }

    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([flavorSlug, quantity]) => ({ flavorSlug, quantity }));
  }, [quantities, selectedPack, singleFlavor]);

  const flavorSummary = selectedItems.map((item) => ({
    ...item,
    flavorName: flavors.find((flavor) => flavor.slug === item.flavorSlug)?.name ?? item.flavorSlug,
  }));

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
      setError(selectedPack.packType === "mixed" ? `Select exactly ${selectedPack.units} bagels.` : "Choose one flavor.");
      return;
    }

    if (step === 3 && !validateDeliveryStep()) {
      setError("Please complete all required delivery fields.");
      return;
    }

    setStep((current) => Math.min(4, current + 1));
  }

  async function submitReservation() {
    setError("");
    if (!termsAccepted) {
      setError("Please accept the monthly batch terms before submitting.");
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
        throw new Error(result.error ?? "Could not submit reservation.");
      }
      window.location.href = `/reserve/success?order=${encodeURIComponent(result.orderCode)}&pack=${encodeURIComponent(selectedPack.name)}&amount=${selectedPack.amount}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit reservation.");
      setSubmitting(false);
    }
  }

  return (
    <section className="reserve-shell">
      <div className="reserve-herolet">
        <div>
          <p className="kicker">Monthly pre-order batch</p>
          <h1>Reserve your Bagelito pack</h1>
          <p>Choose your pack and delivery details now. Bagelito will coordinate payment details via WhatsApp before production closes.</p>
        </div>
        <RollingBagel variant="rainbow" size="md" />
      </div>

      <div className="reserve-progress">
        {steps.map((label, index) => (
          <button key={label} type="button" className={step === index + 1 ? "active" : ""} onClick={() => setStep(index + 1)}>
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {error ? <div className="reserve-alert">{error}</div> : null}

      {step === 1 ? (
        <div className="reserve-card-grid">
          {packs.map((pack) => (
            <button key={pack.slug} type="button" className={`reserve-pack-option ${packSlug === pack.slug ? "selected" : ""}`} onClick={() => selectPack(pack.slug)}>
              <span>{pack.units} bagels</span>
              <strong>{pack.name}</strong>
              <b>S/{pack.amount}</b>
              <small>{pack.packType === "mixed" ? "Mixed flavors" : "One flavor only"}</small>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="reserve-card">
          <div className="reserve-step-title">
            <h2>Choose flavors</h2>
            <span>{selectedPack.packType === "mixed" ? `${selectedTotal} / ${selectedPack.units} selected` : singleFlavor ? `${selectedPack.units} x ${flavors.find((flavor) => flavor.slug === singleFlavor)?.name}` : "Choose one flavor"}</span>
          </div>
          <div className="flavor-select-grid">
            {flavors.map((flavor) => {
              const quantity = quantities[flavor.slug] ?? 0;
              const isSingleSelected = singleFlavor === flavor.slug;
              return (
                <article className={`flavor-select-card ${isSingleSelected ? "selected" : ""}`} key={flavor.slug}>
                  <RollingBagel variant={flavor.variant as BagelVariant} size="sm" />
                  <h3>{flavor.name}</h3>
                  <p>{flavor.category === "premium" ? "Premium / seasonal" : "Classic"} S/{flavor.price}</p>
                  {selectedPack.packType === "mixed" ? (
                    <div className="quantity-control">
                      <button type="button" onClick={() => changeQuantity(flavor.slug, -1)} aria-label={`Remove ${flavor.name}`}><Minus size={15} /></button>
                      <strong>{quantity}</strong>
                      <button type="button" onClick={() => changeQuantity(flavor.slug, 1)} aria-label={`Add ${flavor.name}`}><Plus size={15} /></button>
                    </div>
                  ) : (
                    <button type="button" className="select-flavor-button" onClick={() => setSingleFlavor(flavor.slug)}>{isSingleSelected ? <Check size={16} /> : null} Select</button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="reserve-card form-card">
          <h2>Delivery details</h2>
          <div className="form-grid">
            <label>Full name<input required value={details.customerName} onChange={(event) => setDetails({ ...details, customerName: event.target.value })} /></label>
            <label>WhatsApp number<input required value={details.whatsapp} onChange={(event) => setDetails({ ...details, whatsapp: event.target.value })} /></label>
            <label>Email<input type="email" required value={details.email} onChange={(event) => setDetails({ ...details, email: event.target.value })} /></label>
            <label>District<select value={details.district} onChange={(event) => setDetails({ ...details, district: event.target.value })}>{districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
            <label className="wide">Delivery address<input required value={details.deliveryAddress} onChange={(event) => setDetails({ ...details, deliveryAddress: event.target.value })} /></label>
            <label>Address reference<input value={details.addressReference} onChange={(event) => setDetails({ ...details, addressReference: event.target.value })} /></label>
            <label className="wide">Delivery notes<textarea rows={4} value={details.deliveryNotes} onChange={(event) => setDetails({ ...details, deliveryNotes: event.target.value })} /></label>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="reserve-card review-card">
          <h2>Review reservation</h2>
          <div className="review-grid">
            <div><span>Pack</span><strong>{selectedPack.name}</strong></div>
            <div><span>Total amount</span><strong>S/{selectedPack.amount}</strong></div>
            <div><span>Status after submit</span><strong>Payment pending review</strong></div>
            <div><span>Customer</span><strong>{details.customerName}</strong></div>
            <div><span>WhatsApp</span><strong>{details.whatsapp}</strong></div>
            <div><span>Email</span><strong>{details.email}</strong></div>
            <div className="wide"><span>Address</span><strong>{details.deliveryAddress}, {details.district}</strong></div>
            <div className="wide"><span>Flavors</span><strong>{flavorSummary.map((item) => `${item.quantity} x ${item.flavorName}`).join(", ")}</strong></div>
          </div>
          <label className="terms-box">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            I understand that Bagelito works as a monthly pre-order batch. My reservation is received after submitting this form, and Bagelito will coordinate payment details via WhatsApp before production closes. Production only starts for orders that complete the manual payment follow-up.
          </label>
          <button className="pill-button pink submit-button" type="button" disabled={submitting} onClick={submitReservation}>{submitting ? "Submitting..." : "Submit reservation"}</button>
        </div>
      ) : null}

      <div className="reserve-nav">
        <button className="pill-button outline" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft size={17} /> Back</button>
        {step < 4 ? <button className="pill-button pink" type="button" onClick={goNext}>Continue <ArrowRight size={17} /></button> : null}
      </div>
    </section>
  );
}
