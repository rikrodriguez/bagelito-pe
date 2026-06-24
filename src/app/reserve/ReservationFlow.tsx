"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus, Upload } from "lucide-react";
import type { Flavor } from "@/data/flavors";
import type { Pack, PackSlug } from "@/data/packs";
import { RollingBagel, type BagelVariant } from "@/components/RollingBagel";
import { useLanguage } from "@/components/LanguageProvider";
import { trackBagelitoEvent } from "@/lib/analytics";
import { getDeliveryFee } from "@/lib/delivery-pricing";
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
  deliveryHandoff: "self" | "porteria";
  marketingOptIn: boolean;
};

type PaymentDetails = {
  paymentMethod: "Yape" | "Plin";
  paymentTransactionNumber: string;
  paymentHolderName: string;
  paymentPhoneNumber: string;
  exactAmountConfirmed: boolean;
};

const initialDetails: Details = {
  customerName: "",
  whatsapp: "",
  email: "",
  deliveryAddress: "",
  district: "Miraflores",
  addressReference: "",
  deliveryNotes: "",
  deliveryHandoff: "self",
  marketingOptIn: false,
};

const initialPaymentDetails: PaymentDetails = {
  paymentMethod: "Yape",
  paymentTransactionNumber: "",
  paymentHolderName: "",
  paymentPhoneNumber: "",
  exactAmountConfirmed: false,
};

const allowedPaymentTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const maxPaymentFileSize = 5 * 1024 * 1024;
const paymentRecipient = {
  yapeNumber: "917 547 745",
  plinNumber: "917 547 745",
  holder: "Dawn Brookes",
};

export function ReservationFlow({ packs, flavors, initialPackSlug }: Props) {
  const { locale, copy } = useLanguage();
  const r = copy.reserve;
  const [step, setStep] = useState(1);
  const [packSlug, setPackSlug] = useState<PackSlug>(initialPackSlug);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [details, setDetails] = useState<Details>(initialDetails);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>(initialPaymentDetails);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasMountedRef = useRef(false);

  const selectedPack = packs.find((pack) => pack.slug === packSlug) ?? packs[0];
  const localizedSelectedPack = packCopy[locale][selectedPack.slug];
  const deliveryFee = getDeliveryFee(details.district);
  const totalAmount = selectedPack.amount + deliveryFee;
  const selectedTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const paymentConfig = {
    yapeNumber: paymentRecipient.yapeNumber,
    plinNumber: paymentRecipient.plinNumber,
    holder: paymentRecipient.holder,
  };
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

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    const timeout = window.setTimeout(scrollToTop, 90);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [step]);

  useEffect(() => {
    document.body.classList.toggle("reservation-review-active", step === 5);
    return () => document.body.classList.remove("reservation-review-active");
  }, [step]);

  useEffect(() => {
    trackBagelitoEvent("Reserve Step Viewed", { step, pack: selectedPack.slug });
  }, [selectedPack.slug, step]);

  function getFlavorLabel(flavorSlug: string) {
    const flavor = flavors.find((candidate) => candidate.slug === flavorSlug);
    return flavorCopy[locale][flavorSlug] ?? flavor?.name ?? flavorSlug;
  }

  function selectPack(nextSlug: PackSlug) {
    const nextPack = packs.find((pack) => pack.slug === nextSlug);
    trackBagelitoEvent("Reserve Pack Selected", { pack: nextSlug, amount: nextPack?.amount });
    setPackSlug(nextSlug);
    setQuantities({});
    setSingleFlavor("");
    setError("");
  }

  function goToStep(nextStep: number) {
    setStep(Math.max(1, Math.min(5, nextStep)));
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

  function getPaymentValidationError() {
    if (!paymentDetails.paymentTransactionNumber.trim() || !paymentDetails.paymentHolderName.trim() || !paymentDetails.paymentPhoneNumber.trim()) {
      return r.errors.paymentRequired;
    }

    if (!paymentScreenshot) return r.errors.paymentScreenshotRequired;
    if (!allowedPaymentTypes.has(paymentScreenshot.type)) return r.errors.paymentScreenshotType;
    if (paymentScreenshot.size > maxPaymentFileSize) return r.errors.paymentScreenshotSize;
    if (!paymentDetails.exactAmountConfirmed) return r.errors.exactAmount;

    return "";
  }

  function goNext() {
    setError("");
    if (step === 2 && !validateFlavorStep()) {
      trackBagelitoEvent("Reserve Validation Error", {
        step,
        reason: selectedPack.packType === "mixed" ? "exact_bagel_count" : "choose_flavor",
      });
      setError(selectedPack.packType === "mixed" ? r.errors.exactBagels.replace("{units}", String(selectedPack.units)) : r.errors.chooseFlavor);
      return;
    }

    if (step === 3 && !validateDeliveryStep()) {
      trackBagelitoEvent("Reserve Validation Error", { step, reason: "delivery_required" });
      setError(r.errors.deliveryRequired);
      return;
    }

    if (step === 4) {
      const paymentError = getPaymentValidationError();
      if (paymentError) {
        trackBagelitoEvent("Reserve Validation Error", { step, reason: "payment_required" });
        setError(paymentError);
        return;
      }
    }

    trackBagelitoEvent("Reserve Continue", { step, pack: selectedPack.slug });
    goToStep(step + 1);
  }

  function handlePaymentScreenshotChange(file: File | null) {
    setError("");
    setPaymentScreenshot(null);
    if (!file) return;

    if (!allowedPaymentTypes.has(file.type)) {
      setError(r.errors.paymentScreenshotType);
      return;
    }

    if (file.size > maxPaymentFileSize) {
      setError(r.errors.paymentScreenshotSize);
      return;
    }

    setPaymentScreenshot(file);
  }

  async function submitReservation() {
    setError("");
    const paymentError = getPaymentValidationError();
    if (paymentError) {
      trackBagelitoEvent("Reserve Validation Error", { step: 5, reason: "payment_required" });
      setError(paymentError);
      goToStep(4);
      return;
    }

    if (!termsAccepted) {
      trackBagelitoEvent("Reserve Validation Error", { step: 5, reason: "terms_required" });
      setError(r.errors.terms);
      return;
    }

    const formData = new FormData();
    formData.set("packSlug", selectedPack.slug);
    formData.set("items", JSON.stringify(selectedItems));
    Object.entries(details).forEach(([key, value]) => formData.set(key, String(value)));
    Object.entries(paymentDetails).forEach(([key, value]) => formData.set(key, String(value)));
    if (paymentScreenshot) formData.set("paymentScreenshot", paymentScreenshot);
    formData.set("termsAccepted", String(termsAccepted));

    setSubmitting(true);
    trackBagelitoEvent("Reservation Submit Attempt", { pack: selectedPack.slug, amount: totalAmount });
    try {
      const response = await fetch("/api/reservations", { method: "POST", body: formData });
      const result = await response.json() as { ok?: boolean; orderCode?: string; error?: string };
      if (!response.ok || !result.ok || !result.orderCode) {
        throw new Error(result.error ?? r.errors.submit);
      }
      trackBagelitoEvent("Reservation Submitted", { pack: selectedPack.slug, amount: totalAmount });
      window.location.href = "/reserve/success?order=" + encodeURIComponent(result.orderCode) + "&pack=" + encodeURIComponent(selectedPack.name) + "&packSlug=" + encodeURIComponent(selectedPack.slug) + "&amount=" + totalAmount;
    } catch (submitError) {
      trackBagelitoEvent("Reservation Submit Error", { pack: selectedPack.slug, step: 5 });
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
        {r.steps.map((label, index) => {
          const targetStep = index + 1;
          return (
            <button key={label} type="button" className={step === targetStep ? "active" : ""} disabled={targetStep > step} onClick={() => goToStep(targetStep)}>
              {targetStep}. {label}
            </button>
          );
        })}
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
            <div className="handoff-box wide" role="radiogroup" aria-label={r.deliveryHandoff.label}>
              <span>{r.deliveryHandoff.label}</span>
              <div className="handoff-options">
                <button type="button" className={"handoff-option " + (details.deliveryHandoff === "self" ? "active" : "")} onClick={() => setDetails({ ...details, deliveryHandoff: "self" })}>
                  {details.deliveryHandoff === "self" ? <Check size={16} /> : null}
                  <strong>{r.deliveryHandoff.receive}</strong>
                </button>
                <button type="button" className={"handoff-option " + (details.deliveryHandoff === "porteria" ? "active" : "")} onClick={() => setDetails({ ...details, deliveryHandoff: "porteria" })}>
                  {details.deliveryHandoff === "porteria" ? <Check size={16} /> : null}
                  <strong>{r.deliveryHandoff.porter}</strong>
                </button>
              </div>
            </div>
            <label>{r.fields.addressReference}<input value={details.addressReference} onChange={(event) => setDetails({ ...details, addressReference: event.target.value })} /></label>
            <label className="wide">{r.fields.deliveryNotes}<textarea rows={4} value={details.deliveryNotes} onChange={(event) => setDetails({ ...details, deliveryNotes: event.target.value })} /></label>
            <label className="marketing-box wide">
              <input type="checkbox" checked={details.marketingOptIn} onChange={(event) => setDetails({ ...details, marketingOptIn: event.target.checked })} />
              <span>{r.marketingOptIn}</span>
            </label>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="reserve-card form-card payment-card">
          <div className="reserve-step-title">
            <h2>{r.payment.title}</h2>
            <span>{r.payment.total}: S/{totalAmount}</span>
          </div>
          <p className="payment-intro">{r.payment.instruction}</p>
          <div className="payment-summary-grid">
            <div><span>{r.payment.packSubtotal}</span><strong>S/{selectedPack.amount}</strong></div>
            <div><span>{r.payment.deliveryFee}</span><strong>S/{deliveryFee}</strong></div>
            <div><span>{r.payment.total}</span><strong>S/{totalAmount}</strong></div>
            <div><span>{r.payment.yapeNumber}</span><strong>{paymentConfig.yapeNumber}</strong></div>
            <div><span>{r.payment.plinNumber}</span><strong>{paymentConfig.plinNumber}</strong></div>
            <div><span>{r.payment.holder}</span><strong>{paymentConfig.holder}</strong></div>
          </div>
          <div className="payment-method-box" role="radiogroup" aria-label={r.payment.method}>
            <span>{r.payment.method}</span>
            <div className="payment-method-options">
              {(["Yape", "Plin"] as const).map((method) => (
                <button key={method} type="button" className={"payment-method-option " + (paymentDetails.paymentMethod === method ? "active" : "")} onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: method })}>
                  {paymentDetails.paymentMethod === method ? <Check size={16} /> : null}
                  <strong>{method}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid payment-form-grid">
            <label>{r.payment.transactionNumber}<input required value={paymentDetails.paymentTransactionNumber} onChange={(event) => setPaymentDetails({ ...paymentDetails, paymentTransactionNumber: event.target.value })} /></label>
            <label>{r.payment.paymentHolderName}<input required value={paymentDetails.paymentHolderName} onChange={(event) => setPaymentDetails({ ...paymentDetails, paymentHolderName: event.target.value })} /></label>
            <label>{r.payment.paymentPhoneNumber}<input required value={paymentDetails.paymentPhoneNumber} onChange={(event) => setPaymentDetails({ ...paymentDetails, paymentPhoneNumber: event.target.value })} /></label>
            <label className="upload-box wide">
              <span><Upload size={18} /> {r.payment.screenshot}</span>
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => handlePaymentScreenshotChange(event.target.files?.[0] ?? null)} />
              <small>{paymentScreenshot ? paymentScreenshot.name : r.payment.screenshotHint}</small>
            </label>
          </div>
          <label className="terms-box payment-confirmation">
            <input type="checkbox" checked={paymentDetails.exactAmountConfirmed} onChange={(event) => setPaymentDetails({ ...paymentDetails, exactAmountConfirmed: event.target.checked })} />
            {r.payment.exactAmount}
          </label>
          <p className="payment-note">{r.payment.officialSeparation}</p>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="reserve-card review-card">
          <h2>{r.reviewTitle}</h2>
          <div className="review-grid">
            <div><span>{r.reviewLabels.pack}</span><strong>{localizedSelectedPack.name}</strong></div>
            <div><span>{r.reviewLabels.packSubtotal}</span><strong>S/{selectedPack.amount}</strong></div>
            <div><span>{r.reviewLabels.deliveryFee}</span><strong>S/{deliveryFee}</strong></div>
            <div><span>{r.reviewLabels.totalAmount}</span><strong>S/{totalAmount}</strong></div>
            <div><span>{r.reviewLabels.statusAfterSubmit}</span><strong>{r.statusPending}</strong></div>
            <div><span>{r.reviewLabels.customer}</span><strong>{details.customerName}</strong></div>
            <div><span>{r.reviewLabels.whatsapp}</span><strong>{details.whatsapp}</strong></div>
            <div><span>{r.reviewLabels.email}</span><strong>{details.email}</strong></div>
            <div><span>{r.reviewLabels.paymentMethod}</span><strong>{paymentDetails.paymentMethod}</strong></div>
            <div><span>{r.reviewLabels.paymentTransaction}</span><strong>{paymentDetails.paymentTransactionNumber}</strong></div>
            <div><span>{r.reviewLabels.paymentHolder}</span><strong>{paymentDetails.paymentHolderName}</strong></div>
            <div><span>{r.reviewLabels.paymentPhone}</span><strong>{paymentDetails.paymentPhoneNumber}</strong></div>
            <div><span>{r.reviewLabels.paymentScreenshot}</span><strong>{paymentScreenshot?.name ?? r.payment.screenshot}</strong></div>
            <div><span>{r.reviewLabels.deliveryHandoff}</span><strong>{details.deliveryHandoff === "porteria" ? r.deliveryHandoff.porter : r.deliveryHandoff.receive}</strong></div>
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
        <button className="pill-button outline" type="button" onClick={() => goToStep(step - 1)} disabled={step === 1}><ArrowLeft size={17} /> {r.back}</button>
        {step < 5 ? <button className="pill-button pink" type="button" onClick={goNext}>{r.continue} <ArrowRight size={17} /></button> : null}
      </div>
    </section>
  );
}
