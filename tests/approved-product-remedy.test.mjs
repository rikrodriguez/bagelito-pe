import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const site = loadTs("src/lib/site.ts");
const whatsapp = loadTs("src/lib/whatsapp.ts");
for (const locale of ["en", "es"]) {
  test(`the legal page states the approved replacement or refund remedy (${locale})`, () => {
    const { LegalPageContent } = loadTs("src/app/legal/LegalPageContent.tsx", {
      "@/components/LanguageProvider": { useLanguage: () => ({ locale }) },
      "@/lib/site": site,
      "@/lib/whatsapp": whatsapp,
    });
    const html = renderToStaticMarkup(React.createElement(LegalPageContent));
    if (locale === "es") {
      assert.match(html, /Ofrecemos reposición o devolución del importe por productos equivocados o defectuosos/);
      assert.match(html, /Las reglas de cancelación no limitan estas opciones/);
    } else {
      assert.match(html, /We offer replacement or a refund for incorrect or defective products/);
      assert.match(html, /The cancellation rules do not limit these remedies/);
    }
  });
}
