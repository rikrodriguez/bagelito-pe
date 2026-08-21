import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BatchAvailabilityProvider } from "@/components/BatchAvailabilityProvider";
import { BatchDeadlineBanner } from "@/components/BatchDeadlineBanner";
import { PurchaseActivityToast } from "@/components/PurchaseActivityToast";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { LanguageProvider } from "@/components/LanguageProvider";
import { StructuredData } from "@/components/StructuredData";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import { getPublicPurchaseActivity } from "@/lib/conversion/purchase-activity";
import { siteDescription, siteName, siteOgImage, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

// The active batch is operational data. Keep the first server-rendered HTML
// aligned with Supabase so crawlers, link previews, and new visitors do not
// receive a stale deadline or availability state from a cached layout.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: siteTitle,
  description: siteDescription,
  category: "food",
  creator: siteName,
  publisher: siteName,
  keywords: ["bagels Lima", "bagels Peru", "Bagelito", "delivery Lima", "handmade bagels", "monthly bagel drop"],
  icons: { icon: "/icon.svg" },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName,
    type: "website",
    locale: "es_PE",
    alternateLocale: ["en_US"],
    images: [
      {
        url: siteOgImage,
        width: 1200,
        height: 630,
        alt: "Bagelito.pe monthly bagel drop in Lima",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [siteOgImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [batchAvailability, purchaseActivity] = await Promise.all([
    getReservationBatchAvailability(),
    getPublicPurchaseActivity(),
  ]);

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <StructuredData />
        <LanguageProvider>
          <BatchAvailabilityProvider initialBatch={batchAvailability}>
            <BatchDeadlineBanner />
            {children}
            <PurchaseActivityToast events={purchaseActivity} />
            <FloatingWhatsApp />
            <Analytics />
            <SpeedInsights />
          </BatchAvailabilityProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
