import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { isPackSlug, type PackSlug } from "@/lib/catalog";
import { WaitlistForm } from "./WaitlistForm";
import { readWaitlistCampaign, waitlistCampaignSource } from "@/lib/waitlist/attribution";

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

export default async function WaitlistPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const initialPackSlug: PackSlug | undefined = typeof params?.pack === "string" && isPackSlug(params.pack) ? params.pack : undefined;
  const source = waitlistCampaignSource(readWaitlistCampaign(params));
  return (
    <>
      <Header />
      <main className="waitlist-page">
        <WaitlistForm initialPackSlug={initialPackSlug} source={source} />
      </main>
      <Footer />
    </>
  );
}
