import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { StoreWalkthrough } from "@/components/StoreWalkthrough";
import { getPublicPaymentConfig } from "@/lib/payments";
import "./store-foundation.css";
import "./walkthrough.css";
import "./spatial-v3.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: "Bagelito | Classic Gringo Bagels en Lima",
  description: "Explora los sabores Bagelito, arma tu caja de 6 o 12 bagels y revisa el total y el delivery en nuestro checkout.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  // Do not claim transactions are enabled merely because checkout is visible.
  const paymentEnabled = getPublicPaymentConfig().enabled;
  return (
    <>
      <Header />
      <main><StoreWalkthrough paymentEnabled={paymentEnabled} /></main>
      <Footer />
    </>
  );
}
