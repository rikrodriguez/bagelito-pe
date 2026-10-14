"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgePercent, BookOpenCheck, Check, CreditCard, Gift, MessageCircle, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import type { Flavor } from "@/data/flavors";
import type { Pack, PackSlug } from "@/data/packs";
import { RollingBagel, type BagelVariant } from "@/components/RollingBagel";
import { ConversionTrustStrip } from "@/components/ConversionTrustStrip";
import { useBatchAvailability } from "@/components/BatchAvailabilityProvider";
import { useLanguage } from "@/components/LanguageProvider";
import {
  CulqiCheckoutButton,
  type CulqiCheckoutSession,
  type CulqiTokenSubmission,
} from "@/components/payments/CulqiCheckoutButton";
import { trackBagelitoEvent } from "@/lib/analytics";
import { getDeliveryFee } from "@/lib/delivery-pricing";
import { checkoutExtraPackDiscountPercent, getCheckoutExtraPackOffer } from "@/lib/checkout-upsell";
import { flavorCopy, packCopy } from "@/lib/i18n";
import type { CulqiAuthentication3DS, PublicPaymentConfig } from "@/lib/payments";
import {
  beginCheckoutPayment, checkoutRecoveryOutcome, checkoutRecoveryRetryDelay, CheckoutReviewError,
  clearCheckoutRecovery, markCheckoutPaymentReview, readCheckoutRecovery,
  CHECKOUT_RECOVERY_STORAGE_KEY, type CheckoutRecovery,
} from "@/lib/payments/checkout-recovery";
import { districtOptions } from "@/lib/reservations/schema";
import { siteServiceArea } from "@/lib/site";
import { getWhatsAppHref } from "@/lib/whatsapp";

type Props = {
  packs: Pack[];
  flavors: Flavor[];
  initialPackSlug: PackSlug;
  paymentConfig: PublicPaymentConfig;
  checkoutPage?: boolean;
};

const packImages: Record<PackSlug, string> = {
  "12-mixed": "/images/pack-12-mixed.webp",
  "6-mixed": "/images/pack-6-mixed.webp",
  "12-single": "/images/pack-12-single.webp",
  "6-single": "/images/pack-6-single.webp",
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

const initialBotTrap = "";

export function ReservationFlow({
  packs,
  flavors,
  initialPackSlug,
  paymentConfig,
  checkoutPage = false,
}: Props) {
  const { locale, copy } = useLanguage();
  const batchAvailability = useBatchAvailability();
  const r = copy.reserve;
  const [step, setStep] = useState(1);
  const [packSlug, setPackSlug] = useState<PackSlug>(initialPackSlug);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [details, setDetails] = useState<Details>(initialDetails);
  const [extraPackAdded, setExtraPackAdded] = useState(false);
  // The legal copy is available from the checkout summary. Keeping this
  // internal flag true lets the payment control render without a duplicate
  // terms card in the final step.
  const termsAccepted = true;
  const [website, setWebsite] = useState(initialBotTrap);
  const [error, setError] = useState("");
  const hasMountedRef = useRef(false);
  const checkoutSessionRef = useRef({ fingerprint: "", id: "" });
  const recoveryRef = useRef<CheckoutRecovery | null>(null);
  const activePaymentRef = useRef<{
    checkoutSessionId: string; orderCode: string; sourceId: string; deviceId?: string; awaiting3DS: boolean;
  } | null>(null);
  const [recovery, setRecovery] = useState<CheckoutRecovery | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryLoadFailed, setRecoveryLoadFailed] = useState(false);
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [resolvedRecovery, setResolvedRecovery] = useState<{ orderCode: string; paid: boolean } | null>(null);

  const selectedPack = packs.find((pack) => pack.slug === packSlug) ?? packs[0];
  const upgradePackSlug: PackSlug | null = selectedPack.slug === "6-mixed"
    ? "12-mixed"
    : selectedPack.slug === "6-single"
      ? "12-single"
      : null;
  const upgradePack = upgradePackSlug
    ? packs.find((pack) => pack.slug === upgradePackSlug) ?? null
    : null;
  const upgradeExtra = upgradePack ? upgradePack.amount - selectedPack.amount : 0;
  const upgradeSavings = upgradePack ? Math.max(0, selectedPack.amount * 2 - upgradePack.amount) : 0;
  const localizedSelectedPack = packCopy[locale][selectedPack.slug];
  const deliveryFee = getDeliveryFee(details.district);
  const extraPackOffer = getCheckoutExtraPackOffer(selectedPack.amount);
  const productSubtotal = selectedPack.amount + (extraPackAdded ? extraPackOffer.discountedAmount : 0);
  const totalAmount = productSubtotal + deliveryFee;
  const checkoutPackCount = extraPackAdded ? 2 : 1;
  const checkoutBagelCount = selectedPack.units * checkoutPackCount;
  const selectedTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const batchText = locale === "es"
    ? {
      closed: "Este batch está cerrado",
      delivery: "Delivery",
      joinWaitlist: "Unirme a la lista",
      limit: "Capacidad",
      noLimit: "Sin límite definido",
      open: "Batch abierto",
      ordersClose: "Cierre",
      remaining: "cupos restantes",
      unavailable: "Estamos cerrando o produciendo este batch. Únete a la lista y te avisaremos cuando abra el próximo drop.",
    }
    : {
      closed: "This batch is closed",
      delivery: "Delivery",
      joinWaitlist: "Join waitlist",
      limit: "Capacity",
      noLimit: "No limit set",
      open: "Batch open",
      ordersClose: "Orders close",
      remaining: "spots left",
      unavailable: "We are closing or producing this batch. Join the waitlist and we will notify you when the next drop opens.",
    };
  const localizedBatchName = batchAvailability.batchName === "Next Bagelito Batch"
    ? locale === "es" ? "Próximo batch Bagelito" : batchAvailability.batchName
    : batchAvailability.batchName;
  const culqiText = locale === "es"
    ? {
      hero: "Elige tu pack, sabores y delivery. Al final pagarás de forma segura y tu reserva se confirmará automáticamente.",
      intro: "Revisa el total, agrega el pack extra si lo deseas y confirma los datos de tu pedido antes de continuar al checkout.",
      method: "Checkout online",
      pending: "Confirmación automática del pago",
      reviewTitle: "Revisa tu pedido",
      secureTitle: "Pago online seguro",
      unavailable: "Los pagos online están temporalmente fuera de servicio.",
    }
    : {
      hero: "Choose your pack, flavors, and delivery. At the end you will pay securely and your reservation will be confirmed automatically.",
      intro: "Review the total, add the extra pack if you want it, and confirm your order details before continuing to checkout.",
      method: "Online checkout",
      pending: "Automatic payment confirmation",
      reviewTitle: "Review your order",
      secureTitle: "Secure online payment",
      unavailable: "Online payments are temporarily unavailable.",
    };
  const checkoutText = locale === "es"
    ? {
      address: `Zona de atención: ${siteServiceArea}`,
      complaints: "Libro de Reclamaciones",
      contact: "Ayuda por WhatsApp",
      delivery: "Delivery",
      edit: "Editar pack",
      eyebrow: "Checkout seguro",
      intro: "Compra como invitado, sin crear una cuenta. Elige tu pack, sabores y delivery; revisa el total completo antes de pagar.",
      pack: "Pack",
      policy: "Términos, delivery y devoluciones",
      secure: "Bagelito.pe no almacena datos de tarjeta; el proveedor de pagos los maneja en su entorno seguro.",
      summary: "Tu pedido",
      title: "Completa tu pedido Bagelito",
      total: "Total",
    }
    : {
      address: "Service area: Lima, Peru",
      complaints: "Complaints Book",
      contact: "WhatsApp support",
      delivery: "Delivery",
      edit: "Edit pack",
      eyebrow: "Secure checkout",
      intro: "Check out as a guest, with no account required. Choose your pack, flavors, and delivery, then review the full total before payment.",
      pack: "Pack",
      policy: "Terms, delivery, and refunds",
      secure: "Bagelito.pe does not store card data; the payment provider handles it in its secure environment.",
      summary: "Your order",
      title: "Complete your Bagelito order",
      total: "Total",
    };
  const extraPackText = locale === "es"
    ? {
      add: `Agregar pack por S/${extraPackOffer.discountedAmount}`,
      added: "Pack extra agregado",
      badge: `${checkoutExtraPackDiscountPercent}% DSCTO.`,
      basePack: "Pack principal",
      body: "Recibe un segundo pack con los mismos sabores. El delivery se cobra una sola vez.",
      extraPack: `Pack extra (-${checkoutExtraPackDiscountPercent}%)`,
      kicker: "Oferta exclusiva del checkout",
      locked: "El pago ya fue iniciado. Edita el pedido para cambiar esta oferta.",
      newTotal: "Nuevo total",
      packsSubtotal: "Subtotal de packs",
      remove: "Quitar pack extra",
      savings: `Ahorras S/${extraPackOffer.savingsAmount}`,
      title: "Duplica este pack",
    }
    : {
      add: `Add pack for S/${extraPackOffer.discountedAmount}`,
      added: "Extra pack added",
      badge: `${checkoutExtraPackDiscountPercent}% OFF`,
      basePack: "Main pack",
      body: "Get a second pack with the same flavors. Delivery is charged only once.",
      extraPack: `Extra pack (-${checkoutExtraPackDiscountPercent}%)`,
      kicker: "Checkout-only offer",
      locked: "Payment has started. Edit the order to change this offer.",
      newTotal: "New total",
      packsSubtotal: "Packs subtotal",
      remove: "Remove extra pack",
      savings: `Save S/${extraPackOffer.savingsAmount}`,
      title: "Double this pack",
    };
  const selectedItems = useMemo(() => {
    if (selectedPack.packType === "single") {
      return singleFlavor ? [{ flavorSlug: singleFlavor, quantity: selectedPack.units }] : [];
    }

    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([flavorSlug, quantity]) => ({ flavorSlug, quantity }));
  }, [quantities, selectedPack, singleFlavor]);

  const checkoutItems = useMemo(() => selectedItems.map((item) => ({
    ...item,
    quantity: item.quantity * checkoutPackCount,
  })), [checkoutPackCount, selectedItems]);

  const flavorSummary = checkoutItems.map((item) => {
    const flavor = flavors.find((candidate) => candidate.slug === item.flavorSlug);
    return {
      ...item,
      flavorName: flavorCopy[locale][item.flavorSlug] ?? flavor?.name ?? item.flavorSlug,
    };
  });

  useEffect(() => {
    function restorePendingPayment() {
      try {
        const stored = readCheckoutRecovery(window.localStorage);
        if (stored) {
          recoveryRef.current = stored;
          checkoutSessionRef.current.id = stored.checkoutSessionId;
          setRecovery(stored);
        }
        setRecoveryLoadFailed(false);
      } catch { setRecoveryLoadFailed(paymentConfig.enabled); }
      setRecoveryReady(true);
    }
    restorePendingPayment();
    function onStorage(event: StorageEvent) {
      if (event.key === CHECKOUT_RECOVERY_STORAGE_KEY || event.key === null) restorePendingPayment();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [paymentConfig.enabled]);

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
    document.body.classList.toggle("reservation-review-active", step === 4);
    document.body.classList.toggle("reservation-payment-active", step >= 4);
    return () => {
      document.body.classList.remove("reservation-review-active");
      document.body.classList.remove("reservation-payment-active");
    };
  }, [step]);

  useEffect(() => {
    trackBagelitoEvent("Reserve Step Viewed", { step, pack: selectedPack.slug });
  }, [selectedPack.slug, step]);

  function getFlavorLabel(flavorSlug: string) {
    const flavor = flavors.find((candidate) => candidate.slug === flavorSlug);
    return flavorCopy[locale][flavorSlug] ?? flavor?.name ?? flavorSlug;
  }

  function formatPublicDate(value: string | null) {
    if (!value) return locale === "es" ? "Por definir" : "To be set";
    return new Date(value).toLocaleString(locale === "es" ? "es-PE" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Lima",
    });
  }

  function selectPack(nextSlug: PackSlug) {
    if (checkoutIsLocked()) return;
    const nextPack = packs.find((pack) => pack.slug === nextSlug);
    trackBagelitoEvent("Reserve Pack Selected", { pack: nextSlug, amount: nextPack?.amount });
    setPackSlug(nextSlug);
    setQuantities({});
    setSingleFlavor("");
    setExtraPackAdded(false);
    setError("");
  }

  function goToStep(nextStep: number) {
    if (checkoutIsLocked()) return;
    setStep(Math.max(1, Math.min(4, nextStep)));
  }

  function changeQuantity(flavorSlug: string, delta: number) {
    if (checkoutIsLocked()) return;
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
    if (checkoutIsLocked()) return;
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

    trackBagelitoEvent("Reserve Continue", { step, pack: selectedPack.slug });
    goToStep(step + 1);
  }

  function getCulqiReservationPayload(checkoutSessionId: string) {
    return {
      ...details,
      checkoutSessionId,
      extraPack: extraPackAdded,
      items: checkoutItems,
      packSlug: selectedPack.slug,
      termsAccepted,
      website,
    };
  }

  function getCheckoutSessionId() {
    if (checkoutIsLocked()) throw new CheckoutReviewError();
    const fingerprint = JSON.stringify({
      details,
      extraPack: extraPackAdded,
      items: checkoutItems,
      packSlug: selectedPack.slug,
    });

    if (
      !checkoutSessionRef.current.id
      || checkoutSessionRef.current.fingerprint !== fingerprint
    ) {
      checkoutSessionRef.current = {
        fingerprint,
        id: window.crypto.randomUUID(),
      };
    }

    return checkoutSessionRef.current.id;
  }

  function toggleExtraPack() {
    if (checkoutIsLocked()) return;
    const nextValue = !extraPackAdded;
    setExtraPackAdded(nextValue);
    setError("");
    trackBagelitoEvent(nextValue ? "Checkout Upsell Accepted" : "Checkout Upsell Removed", {
      extraPackAmount: extraPackOffer.discountedAmount,
      pack: selectedPack.slug,
      savingsAmount: extraPackOffer.savingsAmount,
    });
  }

  function redirectToSuccess(orderCode: string, payment: "paid" | "pending") {
    const params = new URLSearchParams({
      amount: String(totalAmount),
      order: orderCode,
      pack: extraPackAdded ? `2 x ${selectedPack.name}` : selectedPack.name,
      packSlug: selectedPack.slug,
      payment,
    });
    window.location.href = `/reserve/success?${params.toString()}`;
  }

  async function prepareCulqiCheckout(): Promise<CulqiCheckoutSession> {
    if (checkoutIsLocked()) throw new CheckoutReviewError();
    if (!termsAccepted) {
      throw new Error(r.errors.terms);
    }
    if (!paymentConfig.enabled) {
      throw new Error(culqiText.unavailable);
    }

    const checkoutSessionId = getCheckoutSessionId();
    const reservationResponse = await fetch("/api/reservations/culqi", {
      body: JSON.stringify(getCulqiReservationPayload(checkoutSessionId)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const reservation = await reservationResponse.json() as {
      amount?: number;
      error?: string;
      expiresAt?: string;
      ok?: boolean;
      orderCode?: string;
    };

    if (!reservationResponse.ok || !reservation.ok || !reservation.orderCode) {
      throw new Error(reservation.error ?? r.errors.submit);
    }

    const orderResponse = await fetch("/api/payments/culqi/order", {
      body: JSON.stringify({
        email: details.email,
        orderCode: reservation.orderCode,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const order = await orderResponse.json() as {
      amount?: number;
      error?: string;
      expiresAt?: string | null;
      ok?: boolean;
      sessionId?: string;
    };

    if (!orderResponse.ok || !order.ok || !order.sessionId || !order.amount) {
      throw new Error(order.error ?? r.errors.submit);
    }

    trackBagelitoEvent("Culqi Checkout Prepared", {
      amount: Number(reservation.amount ?? totalAmount),
      orderCode: reservation.orderCode,
      pack: selectedPack.slug,
    });

    return {
      amountMinor: order.amount,
      checkoutSessionId,
      expiresAt: order.expiresAt ?? reservation.expiresAt ?? null,
      orderCode: reservation.orderCode,
      sessionId: order.sessionId,
    };
  }

  async function waitForVerifiedPayment(session: CulqiCheckoutSession) {
    const checkoutSessionId = session.checkoutSessionId;
    const reference = recoveryRef.current;
    if (!reference || reference.checkoutSessionId !== checkoutSessionId || reference.orderCode !== session.orderCode) {
      throw new CheckoutReviewError();
    }

    const deadline = Date.now() + 60_000;
    let delay = 1500;
    let recoveryPolling = false;
    for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt += 1) {
      if (attempt > 0) {
        if (Date.now() + delay >= deadline) break;
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }

      const response = await fetch("/api/payments/culqi/status", {
        body: JSON.stringify({
          checkoutSessionId,
          orderCode: session.orderCode,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(20_000, deadline - Date.now())),
      });
      const result = await response.json() as {
        ok?: boolean;
        paymentStatus?: string;
        reconciliationRequired?: boolean;
        recoveryState?: string;
        retryAfterSeconds?: number;
      };
      if (!isCurrentRecovery(reference)) throw new CheckoutReviewError();

      if (response.ok && result.ok && result.reconciliationRequired) {
        markPaymentForReview();
        throw new CheckoutReviewError();
      }
      const outcome = checkoutRecoveryOutcome(result);
      if (response.ok && outcome === "review") {
        markPaymentForReview();
        throw new CheckoutReviewError();
      }
      if (response.ok && outcome === "paid") {
        clearCheckoutRecovery(window.localStorage, reference);
        recoveryRef.current = null;
        setRecovery(null);
        return "paid" as const;
      }
      if (response.ok && outcome === "released") {
        clearCheckoutRecovery(window.localStorage, reference);
        recoveryRef.current = null;
        setRecovery(null);
        return "released" as const;
      }
      recoveryPolling ||= result.recoveryState !== undefined;
      delay = checkoutRecoveryRetryDelay(result);
    }

    if (recoveryPolling) markPaymentForReview();
    return "pending" as const;
  }

  async function submitCulqiToken(
    session: CulqiCheckoutSession,
    sourceId: string,
    security: {
      authentication3DS?: CulqiAuthentication3DS;
      deviceId?: string;
    },
  ): Promise<CulqiTokenSubmission> {
    if (session.checkoutSessionId !== checkoutSessionRef.current.id) throw new CheckoutReviewError();
    const current = recoveryRef.current;
    if (current) {
      const active = activePaymentRef.current;
      if (current.state === "review" || current.orderCode !== session.orderCode
        || current.checkoutSessionId !== session.checkoutSessionId
        || !active?.awaiting3DS || active.orderCode !== session.orderCode
        || active.checkoutSessionId !== session.checkoutSessionId || active.sourceId !== sourceId
        || active.deviceId !== security.deviceId || !security.authentication3DS) {
        throw new CheckoutReviewError();
      }
      active.awaiting3DS = false;
    } else {
      if (checkoutIsLocked()) throw new CheckoutReviewError();
      const reference: CheckoutRecovery = {
        version: 1, checkoutSessionId: session.checkoutSessionId,
        orderCode: session.orderCode, state: "pending",
      };
      beginCheckoutPayment(window.localStorage, reference);
      recoveryRef.current = reference;
      setRecovery(reference);
      activePaymentRef.current = {
        checkoutSessionId: session.checkoutSessionId, orderCode: session.orderCode,
        sourceId, deviceId: security.deviceId, awaiting3DS: false,
      };
      setPaymentInProgress(true);
    }

    try {
      const response = await fetch("/api/payments/culqi/charge", {
        body: JSON.stringify({
          authentication3DS: security.authentication3DS,
          deviceId: security.deviceId,
          email: details.email,
          orderCode: session.orderCode,
          sourceId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as {
        ok?: boolean;
        paymentStatus?: string;
        requires3DS?: boolean;
      };

      if (!response.ok || !result.ok || result.paymentStatus === "reconciliation_required") {
        throw new CheckoutReviewError();
      }

      if (result.requires3DS) {
        if (activePaymentRef.current) activePaymentRef.current.awaiting3DS = true;
        return "requires_3ds";
      }

      const verifiedStatus = await waitForVerifiedPayment(session);
      trackBagelitoEvent("Culqi Payment Submitted", {
        orderCode: session.orderCode,
        pack: selectedPack.slug,
        verifiedStatus,
      });
      activePaymentRef.current = null;
      setPaymentInProgress(false);
      if (verifiedStatus === "released") setResolvedRecovery({ orderCode: session.orderCode, paid: false });
      else if (!recoveryRef.current) redirectToSuccess(session.orderCode, verifiedStatus);
      return "submitted";
    } catch {
      markPaymentForReview();
      throw new CheckoutReviewError();
    }
  }

  function checkoutIsLocked() {
    if (!recoveryReady || recoveryLoadFailed || recoveryRef.current || resolvedRecovery) return true;
    try {
      const stored = readCheckoutRecovery(window.localStorage);
      if (!stored) return false;
      recoveryRef.current = stored;
      checkoutSessionRef.current.id = stored.checkoutSessionId;
      setRecovery(stored);
    } catch {
      setRecoveryLoadFailed(paymentConfig.enabled);
      return paymentConfig.enabled;
    }
    return true;
  }

  function markPaymentForReview() {
    const current = recoveryRef.current;
    if (current) {
      const review: CheckoutRecovery = { ...current, state: "review" };
      try { markCheckoutPaymentReview(window.localStorage, review); } catch { /* Retain the in-memory lock too. */ }
      recoveryRef.current = review;
      setRecovery(review);
    }
    activePaymentRef.current = null;
    setPaymentInProgress(false);
  }

  function isCurrentRecovery(reference: CheckoutRecovery) {
    const current = recoveryRef.current;
    return current?.checkoutSessionId === reference.checkoutSessionId && current?.orderCode === reference.orderCode;
  }

  async function checkPendingPayment() {
    const current = recoveryRef.current;
    if (!current || checkingPayment) return;
    setCheckingPayment(true);
    setError("");
    try {
      const response = await fetch("/api/payments/culqi/status", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: current.checkoutSessionId, orderCode: current.orderCode }),
      });
      const result = await response.json() as {
        ok?: boolean; paymentStatus?: string; reconciliationRequired?: boolean; recoveryState?: string;
      };
      if (!isCurrentRecovery(current)) throw new CheckoutReviewError();
      if (!response.ok || result.ok !== true) throw new CheckoutReviewError();
      const outcome = checkoutRecoveryOutcome(result);
      if (outcome === "review") {
        markPaymentForReview();
      } else if (outcome === "paid" || outcome === "released") {
        clearCheckoutRecovery(window.localStorage, current);
        recoveryRef.current = null;
        activePaymentRef.current = null;
        setRecovery(null);
        setPaymentInProgress(false);
        setResolvedRecovery({ orderCode: current.orderCode, paid: outcome === "paid" });
      }
    } catch {
      setError(locale === "es" ? "No pudimos consultar el estado. No vuelvas a pagar; inténtalo más tarde o contáctanos."
        : "We could not check the status. Do not pay again; check later or contact us.");
    } finally { setCheckingPayment(false); }
  }

  if (!recoveryReady || recoveryLoadFailed || resolvedRecovery
    || (recovery && (recovery.state === "review" || !paymentInProgress))) {
    const orderCode = recovery?.orderCode ?? resolvedRecovery?.orderCode;
    return (
      <section className="reserve-shell checkout-flow-shell">
        <div className="reserve-card review-card" role="status" aria-live="polite">
          <h1>{!recoveryReady ? (locale === "es" ? "Cargando tu checkout..." : "Loading your checkout...")
            : resolvedRecovery?.paid ? (locale === "es" ? "Pago confirmado" : "Payment confirmed")
              : resolvedRecovery ? (locale === "es" ? "El pago no se completó" : "Payment was not completed")
                : recovery?.state === "review" ? (locale === "es" ? "Tu pago necesita revisión" : "Your payment needs review")
                  : (locale === "es" ? "Estamos confirmando tu pago" : "We are confirming your payment")}</h1>
          {orderCode ? <p>{locale === "es" ? "Pedido" : "Order"}: <strong>{orderCode}</strong></p> : null}
          {recovery || recoveryLoadFailed ? <p>{locale === "es"
            ? "No vuelvas a pagar ni crees otro pedido hasta confirmar este resultado. Puedes consultar el estado o contactarnos con tu código."
            : "Do not pay again or create another order until this result is confirmed. Check its status or contact us with your code."}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {recovery ? <button className="pill-button pink" type="button" disabled={checkingPayment} onClick={() => void checkPendingPayment()}>
            {checkingPayment ? (locale === "es" ? "Consultando..." : "Checking...") : (locale === "es" ? "Consultar estado del pago" : "Check payment status")}
          </button> : null}
          {resolvedRecovery && !resolvedRecovery.paid ? <button className="pill-button outline" type="button" onClick={() => {
            checkoutSessionRef.current = { fingerprint: "", id: "" };
            setResolvedRecovery(null);
            setStep(1);
          }}>{locale === "es" ? "Crear nuevo pedido" : "Create a new order"}</button> : null}
          {recovery || recoveryLoadFailed || resolvedRecovery ? <p><a href={getWhatsAppHref(orderCode
            ? (locale === "es" ? `Necesito ayuda con el estado del pedido ${orderCode}.` : `I need help checking order ${orderCode}.`)
            : undefined)} target="_blank" rel="noreferrer">{checkoutText.contact}</a></p> : null}
          {resolvedRecovery?.paid ? <Link href="/">{locale === "es" ? "Volver al inicio" : "Back to home"}</Link> : null}
        </div>
      </section>
    );
  }

  if (!batchAvailability.accepting && !checkoutPage) {
    return (
      <section className="reserve-shell">
        <div className="reserve-herolet">
          <div>
            <p className="kicker">{r.heroKicker}</p>
            <h1>{batchText.closed}</h1>
            <p>{batchText.unavailable}</p>
          </div>
          <RollingBagel variant="rainbow" size="md" />
        </div>

        <div className="reserve-closed-card">
          <div>
            <span>{localizedBatchName}</span>
            <strong>{batchText.delivery}: {formatPublicDate(batchAvailability.deliveryDate)}</strong>
            <p>{batchText.ordersClose}: {formatPublicDate(batchAvailability.ordersCloseAt)}</p>
          </div>
          <Link className="pill-button pink" href={`/waitlist?pack=${selectedPack.slug}`}>
            <MessageCircle size={18} />
            {batchText.joinWaitlist}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`reserve-shell${checkoutPage ? " checkout-flow-shell" : ""}`}>
      <div className="reserve-herolet">
        <div>
          <p className="kicker">{checkoutPage ? checkoutText.eyebrow : r.heroKicker}</p>
          <h1>{checkoutPage ? checkoutText.title : r.heroTitle}</h1>
          <p>{checkoutPage ? checkoutText.intro : culqiText.hero}</p>
        </div>
        <RollingBagel variant="rainbow" size="md" />
      </div>

      <div className={`reserve-batch-card${batchAvailability.accepting ? "" : " is-closed"}`}>
        <div>
          <span>{localizedBatchName}</span>
          <strong>{batchAvailability.accepting ? batchText.open : batchText.closed}</strong>
        </div>
        <p>{batchText.ordersClose}: {formatPublicDate(batchAvailability.ordersCloseAt)}</p>
        <p>{batchText.delivery}: {formatPublicDate(batchAvailability.deliveryDate)}</p>
        <p>
          {batchText.limit}: {batchAvailability.remainingPacks === null
            ? batchText.noLimit
            : `${batchAvailability.remainingPacks} ${batchText.remaining}`}
        </p>
      </div>

      <ConversionTrustStrip compact />

      <div className="reserve-progress">
        {r.steps.map((label, index) => {
          const targetStep = index + 1;
          return (
            <button key={label} type="button" className={step === targetStep ? "active" : ""} disabled={Boolean(recovery) || targetStep > step} onClick={() => goToStep(targetStep)}>
              {targetStep}. {label}
            </button>
          );
        })}
      </div>

      <div className={checkoutPage || step === 4 ? "checkout-workspace" : "reserve-workspace"}>
        <div className={checkoutPage || step === 4 ? "checkout-stage" : "reserve-stage"}>
          {error ? <div className="reserve-alert">{error}</div> : null}

      {step === 1 ? (
        <>
          <div className="reserve-card-grid">
            {packs.map((pack) => {
              const localizedPack = packCopy[locale][pack.slug];
              const unitPrice = (pack.amount / pack.units).toFixed(2);
              return (
                <button key={pack.slug} type="button" className={"reserve-pack-option " + (packSlug === pack.slug ? "selected" : "")} onClick={() => selectPack(pack.slug)}>
                  {pack.mostWanted ? <span className="reserve-value-badge">{copy.conversion.bestValue}</span> : null}
                  <span>{pack.units} {r.bagels}</span>
                  <strong>{localizedPack.name}</strong>
                  <b>S/{pack.amount}</b>
                  <small>{localizedPack.typeLabel}</small>
                  <small className="reserve-unit-price">S/{unitPrice} {copy.packs.perBagel}</small>
                </button>
              );
            })}
          </div>
          {upgradePack ? (
            <aside className="pack-upgrade-offer">
              <div>
                <span>{copy.conversion.upsell.kicker}</span>
                <strong>{selectedPack.packType === "mixed" ? copy.conversion.upsell.mixedTitle : copy.conversion.upsell.singleTitle}</strong>
                <p>
                  {(selectedPack.packType === "mixed"
                    ? copy.conversion.upsell.mixedText
                    : copy.conversion.upsell.singleText)
                    .replace("{extra}", String(upgradeExtra))
                    .replace("{savings}", String(upgradeSavings))}
                </p>
              </div>
              <button
                type="button"
                className="pill-button pink"
                onClick={() => {
                  trackBagelitoEvent("Pack Upsell Accepted", {
                    fromPack: selectedPack.slug,
                    toPack: upgradePack.slug,
                    extraAmount: upgradeExtra,
                  });
                  selectPack(upgradePack.slug);
                }}
              >
                {copy.conversion.upsell.cta}
                <ArrowRight size={17} />
              </button>
            </aside>
          ) : null}
        </>
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
            <label className="bot-trap-field" aria-hidden="true">
              Website
              <input autoComplete="off" name="website" tabIndex={-1} value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>
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
        <div className="checkout-final-stage">
          <div className="reserve-card form-card payment-card">
            <div className="reserve-step-title">
              <div>
                <span className="checkout-section-kicker">{checkoutText.eyebrow}</span>
                <h2>{culqiText.secureTitle}</h2>
              </div>
              <span>{r.payment.total}: S/{totalAmount}</span>
            </div>
            <p className="payment-intro">{culqiText.intro}</p>
            <div className="payment-summary-grid culqi-summary-grid">
              <div><span>{extraPackAdded ? extraPackText.packsSubtotal : r.payment.packSubtotal}</span><strong>S/{productSubtotal}</strong></div>
              <div><span>{r.payment.deliveryFee}</span><strong>S/{deliveryFee}</strong></div>
              <div><span>{r.payment.total}</span><strong>S/{totalAmount}</strong></div>
            </div>
            <aside className={`checkout-upsell${extraPackAdded ? " is-added" : ""}`} aria-label={extraPackText.title}>
              <div className="checkout-upsell-heading">
                <span><BadgePercent size={16} /> {extraPackText.kicker}</span>
                <strong>{extraPackText.badge}</strong>
              </div>
              <div className="checkout-upsell-content">
                <span className="checkout-upsell-icon"><Gift size={25} /></span>
                <div>
                  <h3>{extraPackText.title}</h3>
                  <p>{extraPackText.body}</p>
                  <div className="checkout-upsell-price">
                    <del>S/{extraPackOffer.originalAmount}</del>
                    <strong>S/{extraPackOffer.discountedAmount}</strong>
                    <span>{extraPackText.savings}</span>
                  </div>
                </div>
              </div>
              <div className="checkout-upsell-action">
                {extraPackAdded ? (
                  <div className="checkout-upsell-added" role="status">
                    <Check size={18} />
                    {extraPackText.added}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-pressed="false"
                    disabled={Boolean(recovery)}
                    onClick={toggleExtraPack}
                  >
                    <Plus size={18} />
                    {extraPackText.add}
                  </button>
                )}
                {extraPackAdded ? (
                  <button
                    className="checkout-upsell-remove"
                    type="button"
                    disabled={Boolean(recovery)}
                    onClick={toggleExtraPack}
                  >
                    {extraPackText.remove}
                  </button>
                ) : null}
              </div>
              {extraPackAdded ? (
                <div className="checkout-upsell-total">
                  <span>{extraPackText.newTotal}</span>
                  <strong>S/{totalAmount}</strong>
                </div>
              ) : null}
            </aside>
          </div>

          <div className="reserve-card review-card checkout-review-card">
            <h2>{culqiText.reviewTitle}</h2>
            <div className="review-grid">
              <div><span>{r.reviewLabels.pack}</span><strong>{checkoutPackCount} × {localizedSelectedPack.name}</strong></div>
              <div><span>{extraPackAdded ? extraPackText.packsSubtotal : r.reviewLabels.packSubtotal}</span><strong>S/{productSubtotal}</strong></div>
              {extraPackAdded ? <div><span>{extraPackText.extraPack}</span><strong>{extraPackText.savings}</strong></div> : null}
              <div><span>{r.reviewLabels.deliveryFee}</span><strong>S/{deliveryFee}</strong></div>
              <div><span>{r.reviewLabels.totalAmount}</span><strong>S/{totalAmount}</strong></div>
              <div><span>{r.reviewLabels.statusAfterSubmit}</span><strong>{culqiText.pending}</strong></div>
              <div><span>{r.reviewLabels.customer}</span><strong>{details.customerName}</strong></div>
              <div><span>{r.reviewLabels.whatsapp}</span><strong>{details.whatsapp}</strong></div>
              <div><span>{r.reviewLabels.email}</span><strong>{details.email}</strong></div>
              <div><span>{r.reviewLabels.paymentMethod}</span><strong>{culqiText.method}</strong></div>
              <div><span>{r.reviewLabels.deliveryHandoff}</span><strong>{details.deliveryHandoff === "porteria" ? r.deliveryHandoff.porter : r.deliveryHandoff.receive}</strong></div>
              <div className="wide"><span>{r.reviewLabels.address}</span><strong>{details.deliveryAddress}, {details.district === "Other" ? r.otherDistrict : details.district}</strong></div>
              <div className="wide"><span>{r.reviewLabels.flavors}</span><strong>{flavorSummary.map((item) => item.quantity + " x " + item.flavorName).join(", ")}</strong></div>
            </div>
            <CulqiCheckoutButton
              key={`${selectedPack.slug}-${extraPackAdded ? "extra" : "single"}`}
              amount={totalAmount}
              config={paymentConfig}
              customerEmail={details.email}
              disabled={false}
              locale={locale}
              onError={setError}
              onPaymentUnresolved={markPaymentForReview}
              onToken={submitCulqiToken}
              prepareCheckout={prepareCulqiCheckout}
            />
          </div>
        </div>
      ) : null}

          <div className="reserve-nav">
            <button className="pill-button outline" type="button" onClick={() => goToStep(step - 1)} disabled={Boolean(recovery) || step === 1}><ArrowLeft size={17} /> {r.back}</button>
            {step < 4 ? <button className="pill-button pink" type="button" onClick={goNext}>{r.continue} <ArrowRight size={17} /></button> : null}
          </div>
        </div>

        {checkoutPage || step === 4 ? (
          <aside className="checkout-order-summary" aria-label={checkoutText.summary}>
            <div className="checkout-summary-heading">
              <div>
                <span>{checkoutText.summary}</span>
                <h2>{extraPackAdded ? `${checkoutPackCount} × ${localizedSelectedPack.name}` : localizedSelectedPack.name}</h2>
              </div>
              <button type="button" disabled={Boolean(recovery)} onClick={() => goToStep(1)}>{checkoutText.edit}</button>
            </div>

            <div className="checkout-summary-product">
              <div className="checkout-summary-image">
                <Image
                  src={packImages[selectedPack.slug]}
                  alt={localizedSelectedPack.trayLabel}
                  width={960}
                  height={540}
                  sizes="(max-width: 760px) 30vw, 136px"
                />
              </div>
              <div>
                <strong>{checkoutBagelCount} {r.bagels}</strong>
                {extraPackAdded ? <span>{checkoutPackCount} × {localizedSelectedPack.name}</span> : null}
                <span>{localizedSelectedPack.typeLabel}</span>
                <small>S/{(selectedPack.amount / selectedPack.units).toFixed(2)} {copy.packs.perBagel}</small>
              </div>
            </div>

            <div className="checkout-summary-totals">
              <div><span>{extraPackText.basePack}</span><strong>S/{selectedPack.amount}</strong></div>
              {extraPackAdded ? <div className="checkout-summary-discount"><span>{extraPackText.extraPack}</span><strong>S/{extraPackOffer.discountedAmount}</strong></div> : null}
              <div><span>{checkoutText.delivery}</span><strong>S/{deliveryFee}</strong></div>
              <div className="checkout-summary-total"><span>{checkoutText.total}</span><strong>S/{totalAmount}</strong></div>
            </div>

            <div className="checkout-summary-detail">
              <Truck size={18} aria-hidden="true" />
              <span>{formatPublicDate(batchAvailability.deliveryDate)}</span>
            </div>
            <div className="checkout-summary-detail">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{checkoutText.secure}</span>
            </div>

            <div className="checkout-summary-links">
              <Link href="/legal"><CreditCard size={16} /> {checkoutText.policy}</Link>
              <Link href="/libro-de-reclamaciones"><BookOpenCheck size={16} /> {checkoutText.complaints}</Link>
              <a href={getWhatsAppHref()} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {checkoutText.contact}</a>
            </div>
            <p className="checkout-business-address">{checkoutText.address}</p>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
