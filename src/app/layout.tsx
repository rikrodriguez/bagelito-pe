import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { BatchDeadlineBanner } from "@/components/BatchDeadlineBanner";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { LanguageProvider } from "@/components/LanguageProvider";
import { getReservationBatchAvailability } from "@/lib/reservations/service";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bagelito.pe | The Monthly Bagel Drop in Lima",
  description: "Handmade bagels in Lima. Nostalgia with the perfect chew, opened once a month by reservation.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Bagelito.pe",
    description: "The monthly bagel drop in Lima.",
    type: "website",
    locale: "en_US",
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
        </LanguageProvider>
      </body>
    </html>
  );
}
