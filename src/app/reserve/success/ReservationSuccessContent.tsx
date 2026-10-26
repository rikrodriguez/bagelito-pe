"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { packCopy } from "@/lib/i18n";
import { trackBagelitoEvent } from "@/lib/analytics";
import { checkServerPaymentStatus, readSuccessProof } from "@/lib/payments/success-proof";
import { getWhatsAppHref } from "@/lib/whatsapp";
import type { PackSlug } from "@/data/packs";
import { useLanguage } from "@/components/LanguageProvider";

type Props = {
  order: string;
  pack: string;
  packSlug?: string;
  amount?: string;
  payment?: string;
};

function isPackSlug(value: string | undefined): value is PackSlug {
  return value === "12-mixed" || value === "6-mixed" || value === "12-single" || value === "6-single";
}

export function ReservationSuccessContent({ order, pack, packSlug, amount, payment = "manual" }: Props) {
  const { locale, copy } = useLanguage();
  const s = copy.success;
  const isCulqiFlow = payment === "paid" || payment === "pending";
  // A ?payment=paid URL claim is never a source of truth.
  const [serverStatus, setServerStatus] = useState<"checking" | "paid" | "review" | "unverified">("checking");
  const displayPack = isPackSlug(packSlug) ? packCopy[locale][packSlug].name : pack || s.fallbackPack;
  const paymentCopy = locale === "es"
    ? {
      demo: {
        coordination: "Configurar el proveedor para habilitar cobros reales",
        kicker: "Checkout de demostración",
        status: "Sin cobro",
        text: "Completaste el flujo de prueba. No se realizó ningún cobro, no se creó un pedido y no se guardaron datos de pago.",
        title: "El checkout funciona de principio a fin.",
      },
      paid: {
        coordination: "Tu pack ya está separado para el batch",
        kicker: "Pago confirmado",
        text: "Culqi confirmó el pago y tu reserva ya aparece como pagada en Bagelito.",
        title: "Tu batch está reservado.",
      },
      pending: {
        coordination: "Consulta el seguimiento del pedido para verificar el estado.",
        kicker: "Confirmación pendiente",
        text: "Aún no hay una confirmación comprobada de este pago. No vuelvas a pagar sin revisar el estado.",
        title: "Estamos verificando tu reserva.",
      },
      checking: {
        coordination: "Consultando directamente el estado guardado del pedido.",
        kicker: "Verificando pago",
        text: "Estamos consultando la confirmación del servidor de Bagelito.",
        title: "Verificando tu reserva.",
      },
      unverified: {
        coordination: "Usa el seguimiento o comunícate con Bagelito antes de realizar otro pago.",
        kicker: "Sin confirmar",
        text: "No podemos verificar un pago desde este enlace. Los parámetros de la URL no son un comprobante.",
        title: "No pudimos confirmar el pago.",
      },
      review: {
        coordination: "Contáctanos para revisar tu reserva; no realices otro pago.",
        kicker: "Revisión necesaria",
        text: "El pedido presenta una situación que requiere verificación de Bagelito.",
        title: "Estamos revisando el pago.",
      },
    }
    : {
      demo: {
        coordination: "Configure the provider to enable real payments",
        kicker: "Demo checkout",
        status: "No charge",
        text: "You completed the test flow. No charge was made, no order was created, and no payment data was stored.",
        title: "The checkout works from start to finish.",
      },
      paid: {
        coordination: "Your pack is secured for this batch",
        kicker: "Payment confirmed",
        text: "Culqi confirmed payment and your reservation now appears as paid in Bagelito.",
        title: "Your batch is reserved.",
      },
      pending: {
        coordination: "Check order tracking to verify the current status.",
        kicker: "Confirmation pending",
        text: "This payment has not yet been verified. Do not pay again before checking its status.",
        title: "We are checking your reservation.",
      },
      checking: {
        coordination: "Checking the saved order status with our server.",
        kicker: "Verifying payment",
        text: "We are consulting Bagelito's verified order status.",
        title: "Verifying your reservation.",
      },
      unverified: {
        coordination: "Use order tracking or contact Bagelito before attempting another payment.",
        kicker: "Unconfirmed",
        text: "Payment cannot be verified from this link. URL parameters are not a receipt.",
        title: "We could not confirm the payment.",
      },
      review: {
        coordination: "Contact Bagelito to review your reservation. Do not pay again.",
        kicker: "Review required",
        text: "This order requires a manual review before we can confirm payment.",
        title: "We are reviewing this payment.",
      },
    };
  const culqiState = payment === "demo" ? paymentCopy.demo
    : isCulqiFlow
      ? serverStatus === "paid" ? paymentCopy.paid
        : serverStatus === "review" ? paymentCopy.review
          : serverStatus === "checking" ? paymentCopy.checking
            : paymentCopy.unverified
      : null;
  const isDemo = payment === "demo";
  const kicker = culqiState?.kicker ?? s.kicker;
  const title = culqiState?.title ?? s.title;
  const text = culqiState?.text ?? s.text;
  const coordination = culqiState?.coordination ?? s.coordination;

  useEffect(() => {
    // A confirmation page view is not a completed-purchase event.
    trackBagelitoEvent("Checkout Confirmation Page Viewed", { type: isCulqiFlow ? "culqi" : "other" });
  }, [isCulqiFlow]);

  useEffect(() => {
    if (!isCulqiFlow) return;
    let proof;
    try { proof = readSuccessProof(window.sessionStorage, order); }
    catch { proof = null; }
    if (!proof) { setServerStatus("unverified"); return; }
    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const status = (async () => {
      const response = await fetch("/api/payments/culqi/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: proof.checkoutSessionId, orderCode: proof.orderCode }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return response.json();
    })();
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Payment status timeout"));
      }, 10_000);
    });
    void Promise.race([status, deadline]).then(result => {
      if (!active) return;
      const checked = checkServerPaymentStatus(result);
      setServerStatus(checked);
      if (checked === "paid") {
        trackBagelitoEvent("Verified Culqi Payment Confirmation Viewed");
      }
    }).catch(() => {
      if (active) setServerStatus("unverified");
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [order, isCulqiFlow]);

  return (
    <section className="success-card">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="success-summary">
        {!isDemo && (!isCulqiFlow || serverStatus === "paid")
          ? <div><span>{s.labels.orderCode}</span><strong>{order}</strong></div> : null}
        <div><span>{s.labels.pack}</span><strong>{displayPack}</strong></div>
        {!isCulqiFlow && amount ? <div><span>{s.labels.totalAmount}</span><strong>S/{amount}</strong></div> : null}
        <div><span>{s.labels.status}</span><strong>{isDemo ? paymentCopy.demo.status : kicker}</strong></div>
      </div>
      <div className="next-step">
        {serverStatus === "paid" && isCulqiFlow ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
        {s.nextStep} <strong>{coordination}</strong>
      </div>
      <div className="success-actions">
        {!isDemo ? <Link className="pill-button outline" href={`/track?order=${encodeURIComponent(order)}`} onClick={() => trackBagelitoEvent("CTA Click", { location: "success", target: "track" })}>{s.trackOrder}</Link> : null}
        <a className="pill-button pink" href={getWhatsAppHref()} target="_blank" rel="noreferrer" onClick={() => trackBagelitoEvent("WhatsApp Click", { location: "success", target: "coordination" })}><MessageCircle size={18} /> {s.message}</a>
      </div>
      <Link className="mini-link" href="/" onClick={() => trackBagelitoEvent("CTA Click", { location: "success", target: "home" })}>{s.backHome}</Link>
    </section>
  );
}
