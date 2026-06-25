import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BatchDeadlineBanner } from "@/components/BatchDeadlineBanner";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { LanguageProvider } from "@/components/LanguageProvider";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import { siteDescription, siteName, siteOgImage, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: siteTitle,
  description: siteDescription,
  keywords: ["bagels Lima", "bagels Peru", "Bagelito", "delivery Lima", "handmade bagels", "monthly bagel drop"],
  icons: { icon: "/icon.svg" },
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
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const batchAvailability = await getReservationBatchAvailability();

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
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
