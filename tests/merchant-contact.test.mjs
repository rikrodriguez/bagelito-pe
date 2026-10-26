import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const approvedAddress = "Jr. Cruz del Sur 140, Surco";
const site = loadTs("src/lib/site.ts");
const whatsapp = loadTs("src/lib/whatsapp.ts");
const { translations } = loadTs("src/lib/i18n.ts");

function elements(tree) {
  if (tree == null) return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}

for (const locale of ["es", "en"]) {
  test(`the footer exposes the approved merchant address with official contact channels (${locale})`, () => {
    const { Footer } = loadTs("src/components/Footer.tsx", {
      "@/lib/site": site,
      "@/lib/whatsapp": whatsapp,
      "./LanguageProvider": { useLanguage: () => ({ locale, copy: translations[locale] }) },
    });
    const html = renderToStaticMarkup(React.createElement(Footer));
    assert.ok(html.includes(approvedAddress));
    assert.match(html, /mailto:contacto@bagelito\.pe/);
    assert.match(html, /https:\/\/www\.instagram\.com\/bagelito\.pe/);
    const whatsappHref = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"))
      .find((href) => href.startsWith("https://api.whatsapp.com/send?"));
    assert.ok(whatsappHref);
    assert.equal(new URL(whatsappHref).searchParams.get("phone"), "51917547745");
  });

  test(`the legal summary and contact card identify the approved business address (${locale})`, () => {
    const { LegalPageContent } = loadTs("src/app/legal/LegalPageContent.tsx", {
      "@/lib/site": site,
      "@/lib/whatsapp": whatsapp,
      "@/components/LanguageProvider": { useLanguage: () => ({ locale }) },
    });
    const tree = LegalPageContent();
    for (const className of ["legal-summary", "legal-contact-card"]) {
      const section = elements(tree).find((node) => node.props?.className === className);
      assert.ok(renderToStaticMarkup(section).includes(approvedAddress), `${className} must expose the merchant address`);
    }
  });
}

test("business structured data uses the exact approved address as text", () => {
  const { StructuredData } = loadTs("src/components/StructuredData.tsx", { "@/lib/site": site });
  const data = JSON.parse(StructuredData().props.dangerouslySetInnerHTML.__html);
  const bakery = data["@graph"].find((node) => node["@type"] === "Bakery");
  assert.equal(bakery.address, approvedAddress);
});

test("the complaint form and its printable receipt identify the provider's address separately from the consumer", () => {
  let receipt = null;
  const { ComplaintsBookForm } = loadTs("src/app/libro-de-reclamaciones/ComplaintsBookForm.tsx", {
    "@/lib/site": site,
    react: {
      ...React,
      useRef: (initial) => ({ current: initial }),
      useState: (initial) => [initial === null ? receipt : initial, () => {}],
    },
  });
  const provider = elements(ComplaintsBookForm()).find((node) => node.props?.className === "complaints-provider-grid");
  assert.ok(renderToStaticMarkup(provider).includes(approvedAddress));

  receipt = {
    amount: 50,
    code: "LR-SYNTHETIC-000001",
    createdAt: "2026-10-26T20:00:00Z",
    consumerName: "Persona Sintética",
    consumerAddress: "Calle del Consumidor 999",
    documentType: "PASSPORT",
    documentNumber: "AB12345",
    phone: "000000000",
    email: "qa@example.invalid",
    isMinor: false,
    itemType: "product",
    itemDescription: "Pack sintético",
    requestType: "reclamo",
    detail: "Detalle de reclamación de prueba.",
    requestedAction: "Solicitud sintética.",
  };
  const tree = ComplaintsBookForm();
  const providerReceipt = elements(tree).find((node) => node.props?.className === "complaint-receipt-provider");
  const providerHtml = renderToStaticMarkup(providerReceipt);
  assert.ok(providerHtml.includes(approvedAddress));
  assert.doesNotMatch(providerHtml, /Calle del Consumidor 999/);
  assert.match(renderToStaticMarkup(tree), /Calle del Consumidor 999/);
});
