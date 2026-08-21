"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { packCopy } from "@/lib/i18n";
import { trackBagelitoEvent } from "@/lib/analytics";
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
        coordination: "Confirmación automática del pago",
        kicker: "Confirmando pago",
        text: "Recibimos tu reserva. Estamos esperando la confirmación segura de Culqi; no necesitas subir ningún voucher.",
        title: "Estamos confirmando tu reserva.",
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
        coordination: "Automatic payment confirmation",
        kicker: "Confirming payment",
        text: "We received your reservation. We are waiting for Culqi's secure confirmation; you do not need to upload a voucher.",
        title: "We are confirming your reservation.",
      },
    };
  const culqiState = payment === "demo" ? paymentCopy.demo : payment === "paid" ? paymentCopy.paid : payment === "pending" ? paymentCopy.pending : null;
  const isDemo = payment === "demo";
  const kicker = culqiState?.kicker ?? s.kicker;
  const title = culqiState?.title ?? s.title;
  const text = culqiState?.text ?? s.text;
  const coordination = culqiState?.coordination ?? s.coordination;

  useEffect(() => {
    trackBagelitoEvent("Reservation Success Viewed", {
      pack: packSlug ?? "unknown",
      amount: amount ? Number(amount) : undefined,
    });
  }, [amount, packSlug]);

  return (
    <section className="success-card">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="success-summary">
        {!isDemo ? <div><span>{s.labels.orderCode}</span><strong>{order}</strong></div> : null}
        <div><span>{s.labels.pack}</span><strong>{displayPack}</strong></div>
        {amount ? <div><span>{s.labels.totalAmount}</span><strong>S/{amount}</strong></div> : null}
        <div><span>{s.labels.status}</span><strong>{isDemo ? paymentCopy.demo.status : kicker}</strong></div>
      </div>
      <div className="next-step">
        {payment === "paid" ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
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
