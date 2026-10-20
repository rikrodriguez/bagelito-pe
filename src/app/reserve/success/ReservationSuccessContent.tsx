"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Clock3, MessageCircle } from "lucide-react";
import { trackBagelitoEvent } from "@/lib/analytics";
import { getWhatsAppHref } from "@/lib/whatsapp";
import { useLanguage } from "@/components/LanguageProvider";

type Props = { order: string };

export function ReservationSuccessContent({ order }: Props) {
  const { locale, copy } = useLanguage();
  const s = copy.success;
  const confirmation = locale === "es"
    ? {
      kicker: "Consulta de reserva",
      title: "Consulta el estado de tu reserva.",
      text: "Usa el código y los datos de tu reserva en seguimiento para ver el estado registrado de tu pedido y su pago.",
      reference: "Código del enlace",
      status: "Por verificar",
      nextStep: "Verifica el estado en seguimiento",
    }
    : {
      kicker: "Reservation lookup",
      title: "Check your reservation status.",
      text: "Use your reservation code and details in tracking to see the recorded status of your order and payment.",
      reference: "Linked reference",
      status: "Not verified",
      nextStep: "Check the status in tracking",
    };

  useEffect(() => {
    // Visiting this page does not certify a purchase or an amount.
    trackBagelitoEvent("Reservation Success Viewed");
  }, []);

  return (
    <section className="success-card">
      <p className="kicker">{confirmation.kicker}</p>
      <h1>{confirmation.title}</h1>
      <p>{confirmation.text}</p>
      <div className="success-summary">
        {order ? <div><span>{confirmation.reference}</span><strong>{order}</strong></div> : null}
        <div><span>{s.labels.status}</span><strong>{confirmation.status}</strong></div>
      </div>
      <div className="next-step">
        <Clock3 size={20} />
        {s.nextStep} <strong>{confirmation.nextStep}</strong>
      </div>
      <div className="success-actions">
        <Link className="pill-button outline" href={order ? `/track?order=${encodeURIComponent(order)}` : "/track"} onClick={() => trackBagelitoEvent("CTA Click", { location: "success", target: "track" })}>{s.trackOrder}</Link>
        <a className="pill-button pink" href={getWhatsAppHref()} target="_blank" rel="noreferrer" onClick={() => trackBagelitoEvent("WhatsApp Click", { location: "success", target: "coordination" })}><MessageCircle size={18} /> {s.message}</a>
      </div>
      <Link className="mini-link" href="/" onClick={() => trackBagelitoEvent("CTA Click", { location: "success", target: "home" })}>{s.backHome}</Link>
    </section>
  );
}
