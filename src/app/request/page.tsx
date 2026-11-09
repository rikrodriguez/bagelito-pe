import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderRequestForm } from "./OrderRequestForm";

export const metadata: Metadata = {
  title: "Solicitar Bagelito · Revisión sin pago",
  description: "Arma una solicitud de bagels y schmears para revisión humana. No requiere pago.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RequestPage() {
  // Server flag: no public capture without database migration, review queue
  // certification, privacy approval, and explicit launch permission.
  const enabled = process.env.BAGELITO_ORDER_INTENTS_ENABLED === "true";
  return (
    <>
      <Header />
      <main>
        {enabled ? <OrderRequestForm /> : (
          <section className="bagelito-request" style={{maxWidth:700,margin:"4rem auto",padding:24}}>
            <h1>Solicitudes Bagelito</h1>
            <p>Estamos preparando la experiencia de pedidos. Las solicitudes todavía no están habilitadas.</p>
            <p>No se ha reservado ningún producto ni solicitado ningún pago.</p>
            <Link href="/reserve">Volver a la tienda</Link>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
