import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import { isPackSlug, type PackSlug } from "@/lib/catalog";
import { WaitlistForm } from "./WaitlistForm";

export const metadata: Metadata = {
  title: "Join the Bagelito waitlist | Bagelito.pe",
  description: "Join the Bagelito.pe waitlist and get notified when the next monthly bagel batch opens in Lima.",
  alternates: {
    canonical: "/waitlist",
  },
  openGraph: {
    title: "Join the Bagelito waitlist | Bagelito.pe",
    description: "Get notified when the next monthly Bagelito batch opens.",
    url: "/waitlist",
  },
};

export default async function WaitlistPage({ searchParams }: { searchParams?: Promise<{ pack?: string }> }) {
  const params = await searchParams;
  const initialPackSlug: PackSlug | undefined = params?.pack && isPackSlug(params.pack) ? params.pack : undefined;
  const batchAvailability = await getReservationBatchAvailability();

  return (
    <>
      <Header />
      <main className="waitlist-page">
        <WaitlistForm batchAvailability={batchAvailability} initialPackSlug={initialPackSlug} />
      </main>
      <Footer />
    </>
  );
}
