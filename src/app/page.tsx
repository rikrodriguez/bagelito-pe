import { BatchDeadlineBanner } from "@/components/BatchDeadlineBanner";
import { BatchInfo } from "@/components/BatchInfo";
import { FinalCTA } from "@/components/FinalCTA";
import { FlavorStrip } from "@/components/FlavorStrip";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowMonthlyWorks } from "@/components/HowMonthlyWorks";
import { Packs } from "@/components/Packs";
import { Testimonials } from "@/components/Testimonials";
import { WhyMonthly } from "@/components/WhyMonthly";

export default function HomePage() {
  return (
    <>
      <BatchDeadlineBanner />
      <Header />
      <main>
        <Hero />
        <BatchInfo />
        <HowMonthlyWorks />
        <Packs />
        <WhyMonthly />
        <FlavorStrip />
        <Testimonials />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
