import {
  siteContactEmail,
  siteDescription,
  siteInstagramUrl,
  siteLegalName,
  siteName,
  siteOgImage,
  sitePriceRange,
  siteRuc,
  siteTitle,
  siteUrl,
  siteWhatsAppPhone,
} from "@/lib/site";

const absoluteUrl = (path: string) => new URL(path, siteUrl).toString();

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Bakery",
      "@id": `${siteUrl}/#bakery`,
      name: siteName,
      legalName: siteLegalName,
      url: siteUrl,
      description: siteDescription,
      slogan: "The monthly bagel drop in Lima",
      image: absoluteUrl(siteOgImage),
      logo: absoluteUrl("/images/bagelito-logo.svg"),
      telephone: siteWhatsAppPhone,
      email: siteContactEmail,
      taxID: siteRuc,
      priceRange: sitePriceRange,
      servesCuisine: ["Bagels", "Bakery"],
      areaServed: {
        "@type": "City",
        name: "Lima",
        addressCountry: "PE",
      },
      sameAs: [siteInstagramUrl],
      potentialAction: {
        "@type": "OrderAction",
        name: "Reserve a Bagelito batch",
        target: absoluteUrl("/reserve"),
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: siteName,
      headline: siteTitle,
      url: siteUrl,
      description: siteDescription,
      inLanguage: ["en", "es"],
      publisher: {
        "@id": `${siteUrl}/#bakery`,
      },
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}
