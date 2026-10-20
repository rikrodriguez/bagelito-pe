import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../", import.meta.url));

function load(relative, dependencies) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = function requireFixture(specifier) {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(specifier)) {
      return Module.prototype.require.call(this, specifier);
    }
    throw new Error(`Unexpected dependency in receipt fixture: ${specifier}`);
  };
  loaded._compile(compiled, filename);
  return loaded.exports;
}

async function renderSuccess(locale, params) {
  const effects = [], analytics = [];
  const labels = {
    orderCode: "Reference", pack: "Pack", totalAmount: "Amount", status: "Status",
  };
  const { ReservationSuccessContent } = load("src/app/reserve/success/ReservationSuccessContent.tsx", {
    react: { ...React, useEffect(callback) { effects.push(callback); } },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/LanguageProvider": {
      useLanguage: () => ({ locale, copy: { success: {
        labels, nextStep: "Next step", trackOrder: "Track reservation", message: "Contact", backHome: "Home",
        kicker: "Received", title: "Received", text: "Received", coordination: "Coordinate",
      } } }),
    },
    "@/lib/i18n": { packCopy: { es: { "6-mixed": { name: "6 mixtos" } }, en: { "6-mixed": { name: "6 mixed" } } } },
    "@/lib/analytics": { trackBagelitoEvent: (...args) => analytics.push(args) },
    "@/lib/whatsapp": { getWhatsAppHref: () => "https://example.invalid/contact" },
  });
  const page = load("src/app/reserve/success/page.tsx", {
    "@/components/Header": { Header: () => null },
    "@/components/Footer": { Footer: () => null },
    "./ReservationSuccessContent": { ReservationSuccessContent },
  }).default;
  const element = await page({ searchParams: params === undefined ? undefined : Promise.resolve(params) });
  const html = renderToStaticMarkup(element);
  for (const effect of effects) effect();
  return { html, analytics };
}

for (const locale of ["es", "en"]) {
  for (const payment of ["paid", "pending", "demo", "manual", "unknown"]) {
    test(`${locale}: URL ${payment} cannot certify payment, amount or selected products`, async () => {
      const { html, analytics } = await renderSuccess(locale, {
        order: "BAG-FIXTURE", payment, amount: "987654.32", pack: "FORGED_PRODUCT", packSlug: "6-mixed",
      });
      assert.doesNotMatch(html, /Pago confirmado|Payment confirmed|Culqi confirmó|Culqi confirmed/);
      assert.doesNotMatch(html, /987654\.32|FORGED_PRODUCT|6 mixtos|6 mixed/);
      assert.doesNotMatch(html, /No se realizó ningún cobro|No charge was made|no order was created/);
      assert.match(html, /href="\/track\?order=BAG-FIXTURE"/);
      assert.match(html, locale === "es" ? /Por verificar/ : /Not verified/);
      assert.ok(analytics.length > 0);
      assert.ok(analytics.every(([, properties]) => !properties || !("amount" in properties) && !("pack" in properties)));
    });
  }
  test(`${locale}: missing or repeated order parameters remain an unverified lookup`, async () => {
    for (const params of [undefined, {}, { order: ["BAG-ONE", "BAG-TWO"], payment: "paid", amount: "1" }]) {
      const { html } = await renderSuccess(locale, params);
      assert.match(html, /href="\/track"/);
      assert.doesNotMatch(html, /Pago confirmado|Payment confirmed|BAG-PENDING|BAG-ONE|BAG-TWO/);
      assert.match(html, locale === "es" ? /Por verificar/ : /Not verified/);
    }
  });
}
