import Link from "next/link";
import { Clock3, MessageCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default async function SuccessPage({ searchParams }: { searchParams?: Promise<{ order?: string; pack?: string; amount?: string }> }) {
  const params = await searchParams;
  const order = params?.order ?? "BAG-PENDING";
  const pack = params?.pack ?? "Bagelito pack";
  const amount = params?.amount ?? "";

  return (
    <>
      <Header />
      <main className="success-page">
        <section className="success-card">
          <p className="kicker">Payment pending review</p>
          <h1>Your reservation was received.</h1>
          <p>Bagelito will coordinate payment details via WhatsApp before production closes.</p>
          <div className="success-summary">
            <div><span>Order code</span><strong>{order}</strong></div>
            <div><span>Pack</span><strong>{pack}</strong></div>
            {amount ? <div><span>Total amount</span><strong>S/{amount}</strong></div> : null}
            <div><span>Status</span><strong>Payment pending review</strong></div>
          </div>
          <div className="next-step"><Clock3 size={20} /> Next step <strong>WhatsApp payment coordination</strong></div>
          <a className="pill-button pink" href="https://wa.me/51917547745" target="_blank" rel="noreferrer"><MessageCircle size={18} /> Message Bagelito</a>
          <Link className="mini-link" href="/">Back to homepage</Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
