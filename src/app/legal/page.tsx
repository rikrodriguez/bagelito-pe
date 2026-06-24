import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LegalPageContent } from "./LegalPageContent";

export const metadata: Metadata = {
  title: "Políticas legales | Bagelito.pe",
  description: "Términos, privacidad, delivery, reembolsos, cancelaciones y ventana de espera de Bagelito.pe.",
  openGraph: {
    title: "Políticas legales | Bagelito.pe",
    description: "Términos, privacidad, delivery, reembolsos, cancelaciones y ventana de espera de Bagelito.pe.",
    type: "website",
    locale: "es_PE",
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
