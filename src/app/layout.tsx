import type { Metadata } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
