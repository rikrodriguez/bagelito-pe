import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ReservationSuccessContent } from "./ReservationSuccessContent";

export default async function SuccessPage({ searchParams }: { searchParams?: Promise<{ order?: string; pack?: string; packSlug?: string; amount?: string }> }) {
  const params = await searchParams;
  const order = params?.order ?? "BAG-PENDING";
  const pack = params?.pack ?? "";
  const packSlug = params?.packSlug;
  const amount = params?.amount ?? "";

  return (
    <>
      <Header />
      <main className="success-page">
        <ReservationSuccessContent order={order} pack={pack} packSlug={packSlug} amount={amount} />
      </main>
      <Footer />
    </>
  );
}
