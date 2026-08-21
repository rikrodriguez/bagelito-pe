import type { Metadata } from "next";
import { BatchInfo } from "@/components/BatchInfo";
import { ConversionTrustStrip } from "@/components/ConversionTrustStrip";
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

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ConversionTrustStrip />
        <BatchInfo />
        <HowMonthlyWorks />
        <Packs />
        <WhyMonthly />
        <FlavorStrip />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileStickyReserveCTA />
    </>
  );
}
