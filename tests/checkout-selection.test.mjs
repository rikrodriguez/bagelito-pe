import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const { packs } = loadTs("src/data/packs.ts");
const { flavors } = loadTs("src/data/flavors.ts");
const { flavorImages } = loadTs("src/data/flavor-images.ts");
const { translations, flavorCopy } = loadTs("src/lib/i18n.ts");
const catalog = loadTs("src/lib/catalog.ts", {
  "@/data/packs": { packs },
  "@/data/flavors": { flavors },
});

function selection(params) {
  assert.equal(typeof catalog.getCheckoutSelection, "function", "the checkout selection parser must be available");
  return catalog.getCheckoutSelection(params);
}

test("all verified single-pack/flavor links resolve to the exact catalog objects", () => {
  for (const pack of packs.filter(item => item.packType === "single")) {
    for (const flavor of flavors) {
      const result = selection({ pack: pack.slug, flavor: flavor.slug });
      assert.strictEqual(result.pack, pack);
      assert.strictEqual(result.flavor, flavor);
    }
  }
});

test("mixed packs never silently apply a single-flavor preselection", () => {
  for (const pack of packs.filter(item => item.packType === "mixed")) {
    for (const flavor of flavors) {
      assert.deepEqual(selection({ pack: pack.slug, flavor: flavor.slug }), { pack, flavor: undefined });
    }
  }
});

test("invalid or duplicated query inputs preserve the default pack and never select an unverified flavor", () => {
  for (const params of [undefined, {}, { pack: "unknown" }, { pack: ["6-single", "12-single"] }, { pack: ["6-single"] }]) {
    assert.deepEqual(selection(params), { pack: packs[0], flavor: undefined });
  }
  for (const flavor of [undefined, "unknown", "", ["cheddar"], ["cheddar", "plain"], "Cheddar", "<script>"]) {
    assert.deepEqual(selection({ pack: "6-single", flavor }), {
      pack: packs.find(item => item.slug === "6-single"), flavor: undefined,
    });
  }
  assert.deepEqual(selection({ pack: "unknown", flavor: "cheddar" }), { pack: packs[0], flavor: undefined });
});

const Flow = () => null;
const Empty = () => null;
const paymentConfig = { enabled: false, provider: "manual", currency: "PEN", publicKey: "", rsaId: "", rsaPublicKey: "" };

function findFlow(element) {
  if (!React.isValidElement(element)) return undefined;
  if (element.type === Flow) return element;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findFlow(child);
    if (found) return found;
  }
  return undefined;
}

for (const [path, flowImport] of [
  ["src/app/checkout/page.tsx", "@/app/reserve/ReservationFlow"],
  ["src/app/reserve/page.tsx", "./ReservationFlow"],
]) {
  const Page = loadTs(path, {
    "@/components/Footer": { Footer: Empty },
    "@/components/Header": { Header: Empty },
    "@/lib/catalog": catalog,
    "@/lib/payments": { getPublicPaymentConfig: () => paymentConfig },
    "@/lib/site": { siteDescription: "Synthetic test description", siteOgImage: "/synthetic.png" },
    [flowImport]: { ReservationFlow: Flow },
  }).default;

  test(`${path} passes the selected flavor to the actual checkout boundary`, async () => {
    for (const flavor of flavors) {
      const flow = findFlow(await Page({ searchParams: Promise.resolve({ pack: "6-single", flavor: flavor.slug }) }));
      assert.ok(flow, "ReservationFlow must be present");
      assert.equal(flow.props.initialPackSlug, "6-single");
      assert.equal(flow.props.initialFlavorSlug, flavor.slug);
      assert.equal(flow.key, `6-single:${flavor.slug}`, "query navigation must create the matching cart instance");
      assert.strictEqual(flow.props.paymentConfig, paymentConfig, "a flavor link must not enable payment");
    }
  });

  test(`${path} drops invalid flavor inputs at the route boundary`, async () => {
    for (const params of [
      { pack: "6-single", flavor: "unknown" },
      { pack: "6-single", flavor: ["cheddar", "plain"] },
      { pack: "6-mixed", flavor: "cheddar" },
      { pack: ["6-single", "12-single"], flavor: "cheddar" },
    ]) {
      const flow = findFlow(await Page({ searchParams: Promise.resolve(params) }));
      assert.ok(flow);
      assert.equal(flow.props.initialFlavorSlug, undefined);
      const expected = params.pack === "6-single" ? "6-single" : params.pack === "6-mixed" ? "6-mixed" : packs[0].slug;
      assert.equal(flow.props.initialPackSlug, expected);
      assert.equal(flow.key, `${expected}:`);
    }
    const defaultFlow = findFlow(await Page({}));
    assert.equal(defaultFlow.props.initialPackSlug, packs[0].slug);
    assert.equal(defaultFlow.props.initialFlavorSlug, undefined);
  });
}

for (const locale of ["es", "en"]) {
  for (const [review, accepting, expectedPath] of [
    [true, false, "/checkout"], [true, true, "/checkout"],
    [false, true, "/checkout"], [false, false, "/waitlist"],
  ]) {
    test(`every flavor CTA retains its own flavor and correct destination (${locale}, review=${review}, accepting=${accepting})`, () => {
      const { FlavorStrip } = loadTs("src/components/FlavorStrip.tsx", {
        "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
        "next/image": { __esModule: true, default: ({ alt, src }) => React.createElement("img", { alt, src }) },
        "./BatchAvailabilityProvider": { useBatchAvailability: () => ({ merchantReviewOnly: review, accepting }) },
        "./LanguageProvider": { useLanguage: () => ({ locale, copy: translations[locale] }) },
        "@/lib/merchant-review": loadTs("src/lib/merchant-review.ts"),
        "@/lib/i18n": { flavorCopy },
        "@/data/packs": { packs },
        "@/data/flavors": { flavors },
        "@/data/flavor-images": { flavorImages },
      });
      const html = renderToStaticMarkup(React.createElement(FlavorStrip));
      const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;", "&"), "https://synthetic.invalid"));
      assert.equal(links.length, flavors.length);
      for (const [index, url] of links.entries()) {
        assert.equal(url.pathname, expectedPath);
        assert.equal(url.searchParams.get("pack"), "6-single");
        if (expectedPath === "/checkout") {
          assert.equal(url.searchParams.get("flavor"), flavors[index].slug);
          assert.strictEqual(selection(Object.fromEntries(url.searchParams)).flavor, flavors[index]);
        }
      }
    });
  }
}
