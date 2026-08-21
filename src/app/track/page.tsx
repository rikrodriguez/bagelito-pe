import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { TrackPageContent } from "./TrackPageContent";

export const metadata: Metadata = {
  title: "Track your Bagelito order | Bagelito.pe",
  description: "Check the status of your Bagelito order using your order code and the same email or WhatsApp used during reservation.",
  alternates: {
    canonical: "/track",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function TrackPage({ searchParams }: { searchParams?: Promise<{ order?: string }> }) {
  const params = await searchParams;
  const initialOrderCode = params?.order ? String(params.order).toUpperCase() : "";

  return (
    <>
      <Header />
      <main className="track-page">
        <TrackPageContent initialOrderCode={initialOrderCode} />
      </main>
      <Footer />
    </>
  );
}
