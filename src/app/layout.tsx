import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BatchDeadlineBanner } from "@/components/BatchDeadlineBanner";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { LanguageProvider } from "@/components/LanguageProvider";
import { StructuredData } from "@/components/StructuredData";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import { siteDescription, siteName, siteOgImage, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

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
  const batchAvailability = await getReservationBatchAvailability();

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <StructuredData />
        <LanguageProvider>
          <BatchDeadlineBanner batchAvailability={batchAvailability} />
          {children}
          <FloatingWhatsApp />
          <Analytics />
          <SpeedInsights />
        </LanguageProvider>
      </body>
    </html>
  );
}
