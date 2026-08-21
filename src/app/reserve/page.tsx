import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { flavors, getValidPack, packs } from "@/lib/catalog";
import { getPublicPaymentConfig } from "@/lib/payments";
import { siteDescription, siteOgImage } from "@/lib/site";
import { ReservationFlow } from "./ReservationFlow";

export const metadata: Metadata = {
  title: "Reserve your Bagelito batch | Bagelito.pe",
  description: "Choose your Bagelito pack, flavors, Lima delivery district, and complete your monthly batch reservation.",
  alternates: {
    canonical: "/reserve",
  },
  openGraph: {
    title: "Reserve your Bagelito batch | Bagelito.pe",
    description: siteDescription,
    url: "/reserve",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: siteOgImage,
        width: 1200,
        height: 630,
        alt: "Bagelito.pe packs available for reservation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reserve your Bagelito batch | Bagelito.pe",
    description: siteDescription,
    images: [siteOgImage],
  },
};

export const dynamic = "force-dynamic";

export default async function ReservePage({ searchParams }: { searchParams?: Promise<{ pack?: string }> }) {
  const params = await searchParams;
  const selectedPack = getValidPack(params?.pack);
  const paymentConfig = getPublicPaymentConfig();

  return (
    <>
      <Header />
      <main className="reserve-page">
        <ReservationFlow
          packs={packs}
          flavors={flavors}
          initialPackSlug={selectedPack.slug}
          paymentConfig={paymentConfig}
        />
      </main>
      <Footer />
    </>
  );
}
