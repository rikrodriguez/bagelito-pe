"use client";

import Link from "next/link";
import { Clock3, Database, MessageCircle, RotateCcw, ScrollText, ShieldCheck, Truck } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { getWhatsAppHref } from "@/lib/whatsapp";

const legalCopy = {
  en: {
    eyebrow: "Legal policies",
    title: "Bagelito.pe operating policies",
    intro: "These policies explain how Bagelito.pe handles monthly pre-orders, personal data, delivery, cancellations, refunds, and the delivery waiting window in Lima.",
    updated: "Last updated: June 24, 2026",
    summaryTitle: "Quick summary",
    summary: [
      ["Business model", "Monthly pre-order batch"],
      ["Confirmation", "Only after Yape/Plin proof review"],
      ["Delivery", "One scheduled Lima delivery window"],
      ["Payment holder", "Dawn Brookes"],
      ["Contact", "+51 917 547 745"],
    ],
    sections: [
      {
        id: "terms",
        icon: ScrollText,
        title: "Terms of purchase and use",
        body: [
          "Bagelito.pe operates as a monthly pre-order batch. Submitting a reservation does not immediately confirm a pack; the reservation is received first and becomes officially separated only after Bagelito.pe reviews the Yape or Plin payment proof and reconfirms by WhatsApp.",
          "The customer is responsible for entering accurate contact, flavor, payment, and delivery information. Images, flavors, packaging, and batch details may vary slightly due to handmade production and monthly ingredient availability.",
        ],
        bullets: [
          "Orders are produced only for confirmed paid reservations.",
          "Extra stock is not guaranteed after the batch closes.",
          "Premium or seasonal flavors may rotate depending on the month.",
          "Bagelito.pe may contact the customer by WhatsApp or email to validate payment, correct information, or coordinate delivery.",
        ],
      },
      {
        id: "privacy",
        icon: ShieldCheck,
        title: "Privacy policy",
        body: [
          "Bagelito.pe collects the information needed to receive, validate, produce, and deliver reservations: name, WhatsApp number, email, district, delivery address, delivery notes, selected pack and flavors, payment method, payment operation details, and payment proof image.",
          "Personal data is used for order management, payment review, delivery coordination, customer support, and batch updates only when the customer opts in. Bagelito.pe does not sell customer data.",
        ],
        bullets: [
          "Operational providers such as hosting, database, storage, communication, payment, and delivery tools may process data only as needed to complete the order.",
          "Payment proof images are stored for payment validation and internal order records.",
          "Customers may request access, correction, update, deletion, or objection regarding their personal data by contacting Bagelito.pe via WhatsApp.",
          "Bagelito.pe applies reasonable security practices for a small food business, but no digital system can be guaranteed to be risk-free.",
        ],
      },
      {
        id: "delivery",
        icon: Truck,
        title: "Delivery policy",
        body: [
          "Delivery is coordinated in one scheduled Lima delivery window for each monthly batch. The customer must provide a complete delivery address, district, reference, and any relevant building or front-desk instructions before submitting the reservation.",
          "The delivery amount is calculated during checkout and included in the total shown before the customer sends the reservation. Delivery pricing is based on approximate distance from Jr. Sinchi Roca 2560, Lince, to the selected district, using S/3 per kilometer with the current minimum and long-distance adjustments configured by Bagelito.pe.",
        ],
        bullets: [
          "Delivery changes after payment confirmation depend on route availability.",
          "If the address is incomplete, incorrect, or inaccessible, Bagelito.pe may need to re-coordinate and additional delivery costs may apply.",
          "Orders are delivered to the address or front desk option chosen by the customer.",
          "Bagelito.pe is not responsible for delays caused by incorrect information, restricted access, or customer unavailability.",
        ],
      },
      {
        id: "refunds",
        icon: RotateCcw,
        title: "Refunds and cancellations",
        body: [
          "Because Bagelito.pe produces handmade, perishable food by confirmed reservation, cancellations and refunds depend on the production stage of the monthly batch.",
          "If Bagelito.pe cannot produce or deliver a confirmed order due to an internal issue, the customer may choose a refund or credit for a future batch. Duplicate or excess payments can also be coordinated for correction.",
        ],
        bullets: [
          "Before payment confirmation, the customer can ask to correct or cancel the reservation.",
          "After payment confirmation but before the batch closes, cancellations may be reviewed case by case.",
          "Once ingredients have been purchased or production has started, refunds are generally not available because the order was produced for that confirmed reservation.",
          "No refund is guaranteed when delivery fails due to absence, wrong address, unreachable customer, or missed handoff window.",
        ],
      },
      {
        id: "waiting-window",
        icon: Clock3,
        title: "Delivery waiting window and waitlist",
        body: [
          "During delivery, the driver or delivery contact may wait up to 10 minutes at the address provided. If no one receives the order within that window, Bagelito.pe may try to re-coordinate depending on route availability, but the original delivery is no longer guaranteed.",
          "The waitlist gives customers first access to future batch updates, but it does not reserve stock by itself. Priority is given to paid reservations that Bagelito.pe has reviewed and confirmed.",
        ],
        bullets: [
          "Customers should be available by WhatsApp during the delivery window.",
          "Front desk delivery must be selected or clearly authorized by the customer.",
          "Re-delivery, if available, may require an additional delivery fee.",
          "Waitlist messages are limited to Bagelito.pe batch, flavor, and order-window updates.",
        ],
      },
      {
        id: "data-retention",
        icon: Database,
        title: "Records and support",
        body: [
          "Bagelito.pe keeps order records for operational follow-up, payment validation, production planning, delivery coordination, and customer support. Records may also be retained where reasonably necessary for accounting, security, dispute handling, or legal obligations.",
          "For questions, corrections, privacy requests, delivery issues, or claims, customers should contact Bagelito.pe through the official WhatsApp channel.",
        ],
        bullets: [
          "Official contact: +51 917 547 745.",
          "Payment methods shown in checkout: Yape and Plin.",
          "Payment holder shown in checkout: Dawn Brookes.",
          "Bagelito.pe may update these policies as the operation, legal setup, or batch process evolves.",
        ],
      },
    ],
    contactTitle: "Need help with an order?",
    contactText: "Write to Bagelito.pe with your order code or reservation details so we can review it.",
    contactCta: "Message Bagelito",
    homeCta: "Back home",
  },
  es: {
    eyebrow: "Políticas legales",
    title: "Políticas operativas de Bagelito.pe",
    intro: "Estas políticas explican cómo Bagelito.pe maneja la preventa mensual, datos personales, delivery, cancelaciones, reembolsos y la ventana de espera de entrega en Lima.",
    updated: "Última actualización: 24 de junio de 2026",
    summaryTitle: "Resumen rápido",
    summary: [
      ["Modelo", "Batch mensual por preventa"],
      ["Confirmación", "Solo tras revisar el voucher Yape/Plin"],
      ["Delivery", "Una ventana programada en Lima"],
      ["Titular del pago", "Dawn Brookes"],
      ["Contacto", "+51 917 547 745"],
    ],
    sections: [
      {
        id: "terminos",
        icon: ScrollText,
        title: "Términos de compra y uso",
        body: [
          "Bagelito.pe funciona como un batch mensual por preventa. Enviar una reserva no confirma inmediatamente un pack; primero se recibe la solicitud y la separación oficial ocurre solo cuando Bagelito.pe revisa el voucher de Yape o Plin y reconfirma por WhatsApp.",
          "El cliente es responsable de ingresar información correcta de contacto, sabores, pago y entrega. Las imágenes, sabores, empaque y detalles del batch pueden variar ligeramente por tratarse de producción artesanal y disponibilidad mensual de ingredientes.",
        ],
        bullets: [
          "Solo se producen pedidos con pago confirmado.",
          "No se garantiza stock extra después del cierre del batch.",
          "Los sabores premium o de temporada pueden rotar según el mes.",
          "Bagelito.pe puede contactar al cliente por WhatsApp o email para validar el pago, corregir datos o coordinar la entrega.",
        ],
      },
      {
        id: "privacidad",
        icon: ShieldCheck,
        title: "Política de privacidad",
        body: [
          "Bagelito.pe recopila la información necesaria para recibir, validar, producir y entregar reservas: nombre, número de WhatsApp, email, distrito, dirección de entrega, notas de delivery, pack y sabores elegidos, método de pago, datos de operación y voucher de pago.",
          "Los datos personales se usan para gestión de pedidos, revisión de pago, coordinación de delivery, atención al cliente y novedades del batch solo cuando el cliente acepta recibirlas. Bagelito.pe no vende datos de clientes.",
        ],
        bullets: [
          "Proveedores operativos como hosting, base de datos, almacenamiento, comunicación, pagos y delivery pueden procesar datos solo en lo necesario para completar el pedido.",
          "Los vouchers se guardan para validación de pago y registro interno del pedido.",
          "El cliente puede solicitar acceso, corrección, actualización, eliminación u oposición respecto a sus datos personales escribiendo a Bagelito.pe por WhatsApp.",
          "Bagelito.pe aplica prácticas razonables de seguridad para una operación pequeña de alimentos, aunque ningún sistema digital puede garantizar riesgo cero.",
        ],
      },
      {
        id: "delivery",
        icon: Truck,
        title: "Política de delivery",
        body: [
          "El delivery se coordina en una ventana programada de Lima para cada batch mensual. El cliente debe indicar dirección completa, distrito, referencia y cualquier instrucción relevante de edificio o portería antes de enviar la reserva.",
          "El costo de delivery se calcula durante el checkout y se incluye en el total antes de enviar la reserva. El precio se basa en la distancia aproximada desde Jr. Sinchi Roca 2560, Lince, hacia el distrito elegido, usando S/3 por kilómetro con el mínimo actual y ajustes de distancia configurados por Bagelito.pe.",
        ],
        bullets: [
          "Los cambios de delivery después de la confirmación del pago dependen de disponibilidad de ruta.",
          "Si la dirección está incompleta, incorrecta o no es accesible, Bagelito.pe puede necesitar recoordinar y podrían aplicar costos adicionales.",
          "Los pedidos se entregan en la dirección o modalidad de portería elegida por el cliente.",
          "Bagelito.pe no se responsabiliza por demoras causadas por datos incorrectos, acceso restringido o ausencia del cliente.",
        ],
      },
      {
        id: "reembolsos",
        icon: RotateCcw,
        title: "Reembolsos y cancelaciones",
        body: [
          "Como Bagelito.pe produce alimentos artesanales y perecibles por reserva confirmada, las cancelaciones y reembolsos dependen de la etapa de producción del batch mensual.",
          "Si Bagelito.pe no puede producir o entregar un pedido confirmado por un problema interno, el cliente podrá elegir entre reembolso o crédito para un futuro batch. Los pagos duplicados o excedentes también pueden coordinarse para corrección.",
        ],
        bullets: [
          "Antes de la confirmación del pago, el cliente puede pedir corregir o cancelar la reserva.",
          "Después de confirmar el pago, pero antes del cierre del batch, las cancelaciones se revisan caso por caso.",
          "Una vez comprados los ingredientes o iniciada la producción, generalmente no hay reembolso porque el pedido fue producido para esa reserva confirmada.",
          "No se garantiza reembolso cuando la entrega falla por ausencia, dirección incorrecta, cliente inubicable o pérdida de la ventana de recepción.",
        ],
      },
      {
        id: "ventana-espera",
        icon: Clock3,
        title: "Ventana de espera y lista de espera",
        body: [
          "Durante la entrega, el repartidor o contacto de delivery podrá esperar hasta 10 minutos en la dirección indicada. Si nadie recibe el pedido dentro de ese plazo, Bagelito.pe podrá intentar recoordinar según disponibilidad de ruta, pero la entrega original deja de estar garantizada.",
          "La lista de espera da acceso a futuras novedades del batch, pero no separa stock por sí sola. La prioridad corresponde a reservas pagadas que Bagelito.pe haya revisado y confirmado.",
        ],
        bullets: [
          "El cliente debe estar disponible por WhatsApp durante la ventana de entrega.",
          "La entrega en portería debe ser elegida o autorizada claramente por el cliente.",
          "La re-entrega, si está disponible, puede requerir un costo adicional de delivery.",
          "Los mensajes de lista de espera se limitan a novedades de batch, sabores y ventanas de pedido de Bagelito.pe.",
        ],
      },
      {
        id: "registros",
        icon: Database,
        title: "Registros y atención",
        body: [
          "Bagelito.pe conserva registros de pedidos para seguimiento operativo, validación de pagos, planificación de producción, coordinación de delivery y atención al cliente. También puede conservar registros cuando sea razonablemente necesario por contabilidad, seguridad, controversias u obligaciones legales.",
          "Para consultas, correcciones, solicitudes de privacidad, problemas de delivery o reclamos, el cliente debe contactar a Bagelito.pe por el canal oficial de WhatsApp.",
        ],
        bullets: [
          "Contacto oficial: +51 917 547 745.",
          "Métodos de pago mostrados en checkout: Yape y Plin.",
          "Titular del pago mostrado en checkout: Dawn Brookes.",
          "Bagelito.pe puede actualizar estas políticas conforme evolucione la operación, formalización legal o proceso de batches.",
        ],
      },
    ],
    contactTitle: "¿Necesitas ayuda con un pedido?",
    contactText: "Escribe a Bagelito.pe con tu código de pedido o datos de reserva para poder revisarlo.",
    contactCta: "Escribir a Bagelito",
    homeCta: "Volver al inicio",
  },
} as const;

export function LegalPageContent() {
  const { locale } = useLanguage();
  const copy = legalCopy[locale];

  return (
    <main className="legal-page">
      <section className="legal-hero">
        <div>
          <p className="kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <span>{copy.updated}</span>
        </div>
        <div className="legal-summary" aria-label={copy.summaryTitle}>
          <h2>{copy.summaryTitle}</h2>
          {copy.summary.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <nav className="legal-anchor-nav" aria-label={copy.eyebrow}>
        {copy.sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>{section.title}</a>
        ))}
      </nav>

      <div className="legal-policy-list">
        {copy.sections.map((section) => {
          const Icon = section.icon;
          return (
            <section className="legal-policy-block" id={section.id} key={section.id}>
              <div className="legal-policy-icon"><Icon size={25} /></div>
              <div>
                <h2>{section.title}</h2>
                {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      <section className="legal-contact-card">
        <div>
          <h2>{copy.contactTitle}</h2>
          <p>{copy.contactText}</p>
        </div>
        <div className="legal-contact-actions">
          <a className="pill-button pink" href={getWhatsAppHref()} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> {copy.contactCta}
          </a>
          <Link className="pill-button outline" href="/">{copy.homeCta}</Link>
        </div>
      </section>
    </main>
  );
}
