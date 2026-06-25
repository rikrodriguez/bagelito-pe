import type { Metadata } from "next";
import { BatchInfo } from "@/components/BatchInfo";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { FlavorStrip } from "@/components/FlavorStrip";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowMonthlyWorks } from "@/components/HowMonthlyWorks";
import { MobileStickyReserveCTA } from "@/components/MobileStickyReserveCTA";
import { Packs } from "@/components/Packs";
import { Testimonials } from "@/components/Testimonials";
import { WhyMonthly } from "@/components/WhyMonthly";
import { getReservationBatchAvailability } from "@/lib/reservations/service";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const batchAvailability = await getReservationBatchAvailability();

  return (
    <>
      <Header />
      <main>
        <Hero acceptingReservations={batchAvailability.accepting} />
        <BatchInfo />
        <HowMonthlyWorks />
        <Packs acceptingReservations={batchAvailability.accepting} />
        <WhyMonthly />
        <FlavorStrip />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileStickyReserveCTA acceptingReservations={batchAvailability.accepting} />
    </>
  );
}
