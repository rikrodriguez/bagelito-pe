import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { siteOgImage } from "@/lib/site";
import { ComplaintsBookForm } from "./ComplaintsBookForm";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones | Bagelito.pe",
  description: "Libro de Reclamaciones virtual de Bagelito.pe para registrar quejas o reclamos de consumo.",
  alternates: { canonical: "/libro-de-reclamaciones" },
  openGraph: {
    title: "Libro de Reclamaciones | Bagelito.pe",
    description: "Registra una queja o reclamo de consumo ante Bagelito.pe.",
    images: [{ alt: "Bagelito.pe", height: 630, url: siteOgImage, width: 1200 }],
    locale: "es_PE",
    type: "website",
    url: "/libro-de-reclamaciones",
  },
};

export default function ComplaintsBookPage() {
  return (
    <>
      <Header />
      <ComplaintsBookForm />
      <Footer />
    </>
  );
}
