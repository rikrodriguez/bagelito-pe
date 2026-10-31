import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const { translations, packCopy, flavorCopy } = loadTs("src/lib/i18n.ts");
const { packs } = loadTs("src/data/packs.ts");
const { flavors } = loadTs("src/data/flavors.ts");
const { flavorImages } = loadTs("src/data/flavor-images.ts");
const Empty = () => null;
const components = ["Hero", "Packs", "FinalCTA", "MobileStickyReserveCTA", "BatchDeadlineBanner", "FlavorStrip", "HowMonthlyWorks", "ConversionTrustStrip", "FAQ", "Header"];
const ctaComponents = components.filter(name => !["HowMonthlyWorks", "ConversionTrustStrip", "FAQ"].includes(name));

function render(name, locale, review, accepting) {
  const batch = { merchantReviewOnly: review, accepting, ordersCloseAt: "2027-10-27T00:00:00Z", capacityPacks: 20, capacityBagels: 120, reservedPacks: 3, reservedBagels: 18 };
  const deps = {
    "react": name === "MobileStickyReserveCTA" ? { ...React, useState: () => [true, () => {}] } : React,
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { __esModule: true, default: ({ alt, src }) => React.createElement("img", { alt, src }) },
    "./BatchAvailabilityProvider": { useBatchAvailability: () => batch },
    "./LanguageProvider": { useLanguage: () => ({ locale, copy: translations[locale] }) },
    "./RollingBagel": { RollingBagel: Empty },
    "./LanguageToggle": { LanguageToggle: Empty },
    "@/lib/analytics": { trackBagelitoEvent() {} },
    "@/lib/i18n": { packCopy, flavorCopy },
    "@/data/packs": { packs },
    "@/data/flavors": { flavors },
    "@/data/flavor-images": { flavorImages },
    "@/lib/merchant-review": loadTs("src/lib/merchant-review.ts"),
    "framer-motion": {
      motion: { span: ({ children, className }) => React.createElement("span", { className }, children), div: ({ children, className }) => React.createElement("div", { className }, children) },
      useScroll: () => ({ scrollYProgress: 0 }), useTransform: () => 0,
    },
  };
  const Component = loadTs(`src/components/${name}.tsx`, deps)[name];
  return renderToStaticMarkup(React.createElement(Component));
}

for (const locale of ["es", "en"]) {
  for (const accepting of [false, true]) {
    test(`review home never offers orders or payments (${locale}, internal accepting=${accepting})`, () => {
      const label = locale === "es" ? "Ver checkout de demostración" : "Preview checkout";
      const status = locale === "es" ? "Revisión abierta — sin pedidos ni cobros" : "Review preview — no orders or payments";
      const rendered = components.map(name => [name, render(name, locale, true, accepting)]);
      for (const [name, html] of rendered) {
        assert.doesNotMatch(html, /href="(?:\/reserve|\/waitlist|\/#packs|#packs)/, name);
        assert.doesNotMatch(html, /Orders are open|Orders close |Reserve this pack|Reserve next batch|Pay to reserve|We produce only paid, confirmed packs|Pedidos abiertos|Reserva este pack|Reserva el próximo batch|Paga para reservar/, name);
        if (ctaComponents.includes(name)) assert.ok(html.includes(label), `${name}: preview CTA`);
      }
      assert.ok(rendered.find(([name]) => name === "Hero")[1].includes(status));
      const banner = rendered.find(([name]) => name === "BatchDeadlineBanner")[1];
      assert.ok(banner.includes(status));
      assert.doesNotMatch(banner, /deadline-timer|batch-availability|2027|3 packs|15%/);
      const packHrefs = [...rendered.find(([name]) => name === "Packs")[1].matchAll(/<a[^>]*href="([^"]+)"/g)].map(match => match[1]);
      assert.deepEqual(packHrefs, packs.map(pack => `/checkout?pack=${pack.slug}`));
      assert.match(rendered.find(([name]) => name === "FlavorStrip")[1], /href="\/checkout\?pack=6-single&amp;flavor=/);
    });
  }
  test(`normal home preserves open and closed purchase links (${locale})`, () => {
    assert.match(render("Hero", locale, false, true), /href="#packs"/);
    assert.match(render("Hero", locale, false, false), /href="\/waitlist"/);
    assert.match(render("Packs", locale, false, true), /href="\/reserve\?pack=12-mixed"/);
    assert.match(render("Packs", locale, false, false), /href="\/waitlist\?pack=12-mixed"/);
    assert.match(render("FlavorStrip", locale, false, true), /href="\/checkout\?pack=6-single&amp;flavor=/);
    assert.match(render("FlavorStrip", locale, false, false), /href="\/waitlist\?pack=6-single"/);
    for (const name of ["HowMonthlyWorks", "ConversionTrustStrip", "FAQ"]) {
      const html = render(name, locale, false, true);
      const expected = name === "HowMonthlyWorks" ? translations[locale].how.steps[1].title
        : name === "ConversionTrustStrip" ? translations[locale].conversion.trust[1].title
        : translations[locale].faq.items[1].question;
      assert.ok(html.includes(expected), name);
    }
  });
}

test("homepage omits the entire public next-batch section without altering the internal batch component", () => {
  const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /BatchInfo/);
  assert.ok(readFileSync(new URL("../src/components/BatchInfo.tsx", import.meta.url), "utf8").includes("export function BatchInfo"));
});
