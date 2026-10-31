import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceModule } from "./helpers/load-ts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const src = await readFile(path.join(root, "src/components/FlavorStrip.tsx"), "utf8");
const imagesSrc = await readFile(path.join(root, "src/data/flavor-images.ts"), "utf8");
const { flavors } = sourceModule("src/data/flavors.ts");
const { packs } = sourceModule("src/data/packs.ts");
const { flavorImages } = sourceModule("src/data/flavor-images.ts");
const { translations } = sourceModule("src/lib/i18n.ts");

test("catalog shows 10 distinct real local bagel photos, not invented products", async () => {
  assert.equal(flavors.length, 10);
  assert.deepEqual(Object.keys(flavorImages).sort(), flavors.map(flavor => flavor.slug).sort());
  const paths = Object.values(flavorImages);
  assert.equal(new Set(paths).size, 10);
  for (const imagePath of paths) {
    assert.match(imagePath, /^\/images\/bagel-[\w-]+\.webp$/);
    await access(path.join(root, "public", imagePath));
  }
});

test("prices use the existing actual pack amount and never invent a new checkout amount", () => {
  assert.equal(packs.find(pack => pack.slug === "6-single").amount, 50);
  assert.match(src, /singlePackPrice/);
  assert.match(src, /Minimum: 6 bagels/);
  assert.match(src, /Pedido mínimo: 6 bagels/);
  assert.doesNotMatch(src, /flavor\.price/);
});

test("purchase CTA respects accepting status, preserves every flavor selection and marks review as a demonstration", () => {
  for (const locale of ["es", "en"]) {
    for (const accepting of [true, false]) {
      for (const merchantReviewOnly of [false, true]) {
        const { FlavorStrip } = sourceModule("src/components/FlavorStrip.tsx", {
          "next/navigation": { useSearchParams: () => new URLSearchParams() },
          "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
          "next/image": { __esModule: true, default: ({ alt, src }) => React.createElement("img", { alt, src }) },
          "./BatchAvailabilityProvider": { useBatchAvailability: () => ({ accepting, merchantReviewOnly }) },
          "./LanguageProvider": { useLanguage: () => ({ locale, copy: translations[locale] }) },
        });
        const html = renderToStaticMarkup(React.createElement(FlavorStrip));
        const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)];
        assert.equal(links.length, flavors.length);
        for (const [[, href], flavor] of links.map((link, index) => [link, flavors[index]])) {
          const url = new URL(href.replaceAll("&amp;", "&"), "https://synthetic.invalid");
          assert.equal(url.pathname, merchantReviewOnly || accepting ? "/checkout" : "/waitlist");
          assert.equal(url.searchParams.get("pack"), "6-single");
          assert.equal(url.searchParams.get("flavor"), merchantReviewOnly || accepting ? flavor.slug : null);
        }
        assert.ok(html.includes(merchantReviewOnly ? locale === "es" ? "Ver checkout de demostración" : "Preview checkout"
          : accepting ? locale === "es" ? "Elegir pack" : "Choose pack" : locale === "es" ? "Avisarme" : "Notify me"));
        assert.equal([...html.matchAll(/class="flavor-product-price"/g)].length, 10);
        assert.ok(html.includes(`S/${packs.find(pack => pack.slug === "6-single").amount}`));
      }
    }
  }
});

test("all catalog flavor keys have descriptive copy and canonical names", () => {
  for (const { slug } of flavors) {
    assert.ok(imagesSrc.includes('"' + slug + '":') || new RegExp("\\b" + slug + ":").test(imagesSrc), slug);
  }
  assert.match(src, /flavorDescriptions\[locale\]/);
});
