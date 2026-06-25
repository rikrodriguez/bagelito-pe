import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { siteOgImage } from "@/lib/site";
import { LegalPageContent } from "./LegalPageContent";

export const metadata: Metadata = {
  title: "Políticas legales | Bagelito.pe",
  description: "Términos, privacidad, delivery, reembolsos, cancelaciones y ventana de espera de Bagelito.pe.",
  alternates: {
    canonical: "/legal",
  },
  openGraph: {
    title: "Políticas legales | Bagelito.pe",
    description: "Términos, privacidad, delivery, reembolsos, cancelaciones y ventana de espera de Bagelito.pe.",
    url: "/legal",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: siteOgImage,
        width: 1200,
        height: 630,
        alt: "Bagelito.pe monthly bagel drop in Lima",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Políticas legales | Bagelito.pe",
    description: "Términos, privacidad, delivery, reembolsos, cancelaciones y ventana de espera de Bagelito.pe.",
    images: [siteOgImage],
  },
};

export default function LegalPage() {
  return (
    <>
      <Header />
      <LegalPageContent />
      <Footer />
    </>
  );
}
