"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Mail,
  Printer,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { ComplaintPayload } from "@/lib/complaints/schema";
import {
  siteContactEmail,
  siteLegalName,
  siteName,
  siteRuc,
  siteWhatsAppPhone,
} from "@/lib/site";

type SubmittedComplaint = ComplaintPayload & {
  code: string;
  createdAt: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export function ComplaintsBookForm() {
  const [isMinor, setIsMinor] = useState(false);
  const [requestType, setRequestType] = useState<"reclamo" | "queja">("reclamo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedComplaint | null>(null);

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload: ComplaintPayload = {
      amount: Number(readText(formData, "amount")),
      consumerAddress: readText(formData, "consumerAddress"),
      consumerName: readText(formData, "consumerName"),
      detail: readText(formData, "detail"),
      documentNumber: readText(formData, "documentNumber"),
      documentType: readText(formData, "documentType") as ComplaintPayload["documentType"],
      email: readText(formData, "email"),
      isMinor,
      itemDescription: readText(formData, "itemDescription"),
      itemType: readText(formData, "itemType") as ComplaintPayload["itemType"],
      phone: readText(formData, "phone"),
      privacyAccepted: formData.get("privacyAccepted") === "on",
      representativeDocument: readText(formData, "representativeDocument"),
      representativeName: readText(formData, "representativeName"),
      requestedAction: readText(formData, "requestedAction"),
      requestType,
      website: readText(formData, "website"),
    };

    try {
      const response = await fetch("/api/complaints", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as {
        complaint?: { code: string; createdAt: string };
        error?: string;
        ok?: boolean;
      };

      if (!response.ok || !result.ok || !result.complaint) {
        throw new Error(result.error ?? "No pudimos registrar la hoja.");
      }

      setSubmitted({ ...payload, ...result.complaint });
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos registrar la hoja.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="complaints-page complaints-receipt-page">
        <section className="complaint-receipt" id="hoja-de-reclamacion">
          <div className="complaint-receipt-success">
            <CheckCircle2 size={42} />
            <div>
              <p className="kicker">Hoja registrada</p>
              <h1>Recibimos tu {submitted.requestType}.</h1>
              <p>Guarda esta constancia. Bagelito.pe responderá por escrito al email indicado dentro del plazo legal.</p>
            </div>
          </div>

          <div className="complaint-receipt-code">
            <span>Número correlativo</span>
            <strong>{submitted.code}</strong>
            <small>{formatDate(submitted.createdAt)}</small>
          </div>

          <section className="complaint-receipt-provider">
            <h2>Proveedor</h2>
            <div><span>Razón social</span><strong>{siteLegalName}</strong></div>
            <div><span>Nombre comercial</span><strong>{siteName}</strong></div>
            <div><span>RUC</span><strong>{siteRuc}</strong></div>
            <div><span>Email</span><strong>{siteContactEmail}</strong></div>
          </section>

          <div className="complaint-receipt-grid">
            <section>
              <h2>1. Consumidor reclamante</h2>
              <p><strong>{submitted.consumerName}</strong></p>
              <p>{submitted.documentType}: {submitted.documentNumber}</p>
              <p>{submitted.consumerAddress}</p>
              <p>{submitted.phone} · {submitted.email}</p>
              {submitted.isMinor ? <p>Representante: {submitted.representativeName} · {submitted.representativeDocument}</p> : null}
            </section>
            <section>
              <h2>2. Bien contratado</h2>
              <p><strong>{submitted.itemType === "product" ? "Producto" : "Servicio"} · S/{Number(submitted.amount).toFixed(2)}</strong></p>
              <p>{submitted.itemDescription}</p>
            </section>
            <section className="wide">
              <h2>3. {submitted.requestType === "reclamo" ? "Reclamo" : "Queja"} y pedido</h2>
              <p>{submitted.detail}</p>
              <p><strong>Pedido:</strong> {submitted.requestedAction}</p>
            </section>
            <section className="wide provider-response-space">
              <h2>4. Observaciones y acciones adoptadas por el proveedor</h2>
              <p>Bagelito.pe completará esta sección al atender la hoja y comunicará su respuesta por escrito.</p>
            </section>
          </div>

          <p className="complaint-legal-footnote">
            La presentación de esta hoja no impide acudir a otras vías de solución ni es requisito previo para presentar una denuncia ante Indecopi.
          </p>

          <div className="complaint-receipt-actions no-print">
            <button className="pill-button pink" onClick={() => window.print()} type="button"><Printer size={17} /> Imprimir o guardar PDF</button>
            <a className="pill-button outline" href={`mailto:${siteContactEmail}?subject=${encodeURIComponent(`${submitted.code} - Evidencia adicional`)}`}><Mail size={17} /> Enviar evidencia</a>
            <Link className="pill-button outline" href="/">Volver al inicio</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="complaints-page">
      <section className="complaints-hero">
        <div>
          <p className="kicker">Atención al consumidor</p>
          <h1>Libro de Reclamaciones</h1>
          <p>Registra una queja o reclamo de consumo. Recibirás un número correlativo y una constancia que podrás imprimir o guardar como PDF.</p>
        </div>
        <div className="complaints-deadline">
          <Clock3 size={28} />
          <span>Plazo de respuesta</span>
          <strong>15 días hábiles</strong>
          <small>Máximo e improrrogable</small>
        </div>
      </section>

      <section className="complaints-layout">
        <form className="complaints-form" onSubmit={submitComplaint}>
          <fieldset className="complaints-fieldset provider-fieldset">
            <legend><BookOpenCheck size={19} /> Identificación del proveedor</legend>
            <div className="complaints-provider-grid">
              <div><span>Razón social</span><strong>{siteLegalName}</strong></div>
              <div><span>Nombre comercial</span><strong>{siteName}</strong></div>
              <div><span>RUC</span><strong>{siteRuc}</strong></div>
              <div><span>Email</span><a href={`mailto:${siteContactEmail}`}>{siteContactEmail}</a></div>
              <div><span>Teléfono</span><strong>{siteWhatsAppPhone}</strong></div>
            </div>
          </fieldset>

          {error ? <div aria-live="polite" className="reserve-alert">{error}</div> : null}

          <label aria-hidden="true" className="bot-trap-field">
            Sitio web
            <input autoComplete="off" name="website" tabIndex={-1} />
          </label>

          <fieldset className="complaints-fieldset">
            <legend><span>1</span> Identificación del consumidor reclamante</legend>
            <div className="complaints-form-grid">
              <label className="wide">Nombres y apellidos<input autoComplete="name" maxLength={160} name="consumerName" required /></label>
              <label>Tipo de documento
                <select name="documentType" required>
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASSPORT">Pasaporte</option>
                  <option value="RUC">RUC</option>
                </select>
              </label>
              <label>Número de documento<input autoComplete="off" maxLength={20} name="documentNumber" required /></label>
              <label className="wide">Domicilio<input autoComplete="street-address" maxLength={260} name="consumerAddress" placeholder="Calle, número, distrito, provincia y departamento" required /></label>
              <label>Teléfono<input autoComplete="tel" inputMode="tel" maxLength={30} name="phone" required /></label>
              <label>Email<input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
              <label className="complaint-check wide">
                <input checked={isMinor} onChange={(event) => setIsMinor(event.target.checked)} type="checkbox" />
                <span>El consumidor es menor de edad</span>
              </label>
              {isMinor ? (
                <>
                  <label>Padre, madre o representante<input maxLength={160} name="representativeName" required /></label>
                  <label>Documento del representante<input maxLength={20} name="representativeDocument" required /></label>
                </>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="complaints-fieldset">
            <legend><span>2</span> Identificación del bien contratado</legend>
            <div className="complaints-form-grid">
              <label>Tipo
                <select name="itemType" required>
                  <option value="product">Producto</option>
                  <option value="service">Servicio</option>
                </select>
              </label>
              <label>Monto pagado o reclamado (S/)<input inputMode="decimal" min="0" name="amount" required step="0.01" type="number" /></label>
              <label className="wide">Descripción del producto o servicio<textarea maxLength={2000} name="itemDescription" placeholder="Ejemplo: pack de 12 bagels mixtos, código de pedido y fecha de compra." required rows={4} /></label>
            </div>
          </fieldset>

          <fieldset className="complaints-fieldset">
            <legend><span>3</span> Detalle de la reclamación y pedido</legend>
            <div className="complaint-type-grid">
              <label className={requestType === "reclamo" ? "selected" : ""}>
                <input checked={requestType === "reclamo"} name="requestType" onChange={() => setRequestType("reclamo")} type="radio" value="reclamo" />
                <strong>Reclamo</strong>
                <span>Disconformidad relacionada con un producto o servicio.</span>
              </label>
              <label className={requestType === "queja" ? "selected" : ""}>
                <input checked={requestType === "queja"} name="requestType" onChange={() => setRequestType("queja")} type="radio" value="queja" />
                <strong>Queja</strong>
                <span>Malestar no relacionado con el producto o servicio, o con la atención al público.</span>
              </label>
            </div>
            <div className="complaints-form-grid">
              <label className="wide">Detalle<textarea maxLength={4000} name="detail" placeholder="Cuéntanos qué ocurrió, cuándo y cualquier dato que permita revisar el caso." required rows={6} /></label>
              <label className="wide">Pedido concreto<textarea maxLength={2000} name="requestedAction" placeholder="Indica claramente qué solución solicitas." required rows={4} /></label>
            </div>
          </fieldset>

          <label className="complaint-check complaint-declaration">
            <input name="privacyAccepted" required type="checkbox" />
            <span>Declaro que la información consignada es verdadera y autorizo su tratamiento para atender esta hoja, conforme a la <Link href="/legal#privacidad">Política de privacidad</Link>.</span>
          </label>

          <div className="complaints-submit-row">
            <button className="pill-button pink" disabled={submitting} type="submit"><Send size={17} /> {submitting ? "Registrando…" : "Registrar hoja"}</button>
            <p><ShieldCheck size={16} /> Tus datos no se publican y se usan únicamente para atender el caso.</p>
          </div>
        </form>

        <aside className="complaints-aside">
          <div>
            <BookOpenCheck size={24} />
            <h2>Antes de enviar</h2>
            <p>Incluye el código de pedido, fecha, monto y una explicación concreta. Así podremos revisar el caso más rápido.</p>
          </div>
          <div>
            <Mail size={24} />
            <h2>Respuesta por escrito</h2>
            <p>La respuesta llegará al email que indiques. Conservaremos la constancia de la comunicación.</p>
          </div>
          <div>
            <ShieldCheck size={24} />
            <h2>Canal oficial</h2>
            <p>Este libro pertenece a {siteLegalName}, titular de la marca {siteName}, RUC {siteRuc}. Atención digital: {siteContactEmail}.</p>
          </div>
          <p className="complaints-aside-note">Presentar una hoja aquí no limita tu derecho a acudir a Indecopi u otra vía de solución.</p>
        </aside>
      </section>
    </main>
  );
}
