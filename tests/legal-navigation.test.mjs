import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const site = loadTs("src/lib/site.ts");
const whatsapp = loadTs("src/lib/whatsapp.ts");

for (const locale of ["en", "es"]) {
  test(`legal links resolve in either saved language (${locale})`, () => {
    const { LegalPageContent } = loadTs("src/app/legal/LegalPageContent.tsx", {
      "@/components/LanguageProvider": { useLanguage: () => ({ locale }) },
      "@/lib/site": site,
      "@/lib/whatsapp": whatsapp,
    });
    const html = renderToStaticMarkup(React.createElement(LegalPageContent));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, "fragment IDs must remain unique");
    for (const fragment of ["terms", "terminos", "privacy", "privacidad", "delivery",
      "complaints-book", "libro-reclamaciones", "refunds", "reembolsos",
      "waiting-window", "ventana-espera", "data-retention", "registros"]) {
      assert.ok(ids.includes(fragment), `missing #${fragment} in ${locale}`);
    }
    for (const [, fragment] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.includes(fragment), `navigation target #${fragment} exists`);
    }
    // The complaints form links to /legal#privacidad even for first-time
    // visitors, whose default language is English.
    assert.match(html, /id="privacidad"/);
  });
}
