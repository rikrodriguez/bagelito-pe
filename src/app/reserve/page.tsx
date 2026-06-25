import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { flavors, getValidPack, packs } from "@/lib/catalog";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import { ReservationFlow } from "./ReservationFlow";

export const metadata: Metadata = {
  title: "Reserve your Bagelito batch | Bagelito.pe",
};

export const dynamic = "force-dynamic";

export default async function ReservePage({ searchParams }: { searchParams?: Promise<{ pack?: string }> }) {
  const params = await searchParams;
  const selectedPack = getValidPack(params?.pack);
  const batchAvailability = await getReservationBatchAvailability();

  return (
    <>
      <Header />
      <main className="reserve-page">
        <ReservationFlow packs={packs} flavors={flavors} initialPackSlug={selectedPack.slug} batchAvailability={batchAvailability} />
      </main>
      <Footer />
    </>
  );
}
