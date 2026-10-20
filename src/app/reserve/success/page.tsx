import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ReservationSuccessContent } from "./ReservationSuccessContent";

export const metadata: Metadata = {
  title: "Reservation status | Bagelito.pe",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function SuccessPage({ searchParams }: { searchParams?: Promise<{ order?: string | string[] }> }) {
  const params = await searchParams;
  // A navigation URL is not evidence of an order, its contents or a payment.
  // Keep only a reference for the existing tracking lookup.
  const order = typeof params?.order === "string" ? params.order : "";

  return (
    <>
      <Header />
      <main className="success-page">
        <ReservationSuccessContent order={order} />
      </main>
      <Footer />
    </>
  );
}
