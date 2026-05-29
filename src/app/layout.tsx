import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./overrides.css";

export const metadata: Metadata = {
  title: "Bagelito.pe | The Monthly Bagel Drop in Lima",
  description: "Handmade Bagels. Nostalgia with the perfect chew. Reserve the monthly Bagelito batch in Lima.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Bagelito.pe",
    description: "The monthly bagel drop in Lima.",
    url: "https://bagelito-pe.vercel.app",
    siteName: "Bagelito.pe",
    locale: "en_US",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#FFF8EE",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
