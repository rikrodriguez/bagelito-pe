import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { flavors, getCheckoutSelection, packs, type CheckoutSearchParams } from "@/lib/catalog";
import { getPublicPaymentConfig } from "@/lib/payments";
import { siteDescription, siteOgImage } from "@/lib/site";
import { ReservationFlow } from "@/app/reserve/ReservationFlow";

export const metadata: Metadata = {
  title: "Checkout seguro | Bagelito.pe",
  description: "Elige tu pack y sabores, calcula el delivery en Lima y revisa el total completo antes del pago seguro.",
  alternates: {
    canonical: "/checkout",
  },
  openGraph: {
    title: "Checkout seguro | Bagelito.pe",
    description: siteDescription,
    url: "/checkout",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: siteOgImage,
        width: 1200,
        height: 630,
        alt: "Checkout de packs artesanales Bagelito.pe",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Checkout seguro | Bagelito.pe",
    description: "Pack, sabores, delivery y total visibles antes de pagar.",
    images: [siteOgImage],
  },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams?: Promise<CheckoutSearchParams> }) {
  const params = await searchParams;
  const { pack: selectedPack, flavor: selectedFlavor } = getCheckoutSelection(params);
  const paymentConfig = getPublicPaymentConfig();

  return (
    <>
      <Header />
      <main className="checkout-page">
        <ReservationFlow
          key={`${selectedPack.slug}:${selectedFlavor?.slug ?? ""}`}
          packs={packs}
          flavors={flavors}
          initialPackSlug={selectedPack.slug}
          initialFlavorSlug={selectedFlavor?.slug}
          paymentConfig={paymentConfig}
          checkoutPage
        />
      </main>
      <Footer />
    </>
  );
}
