import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const choice = read("src/components/store/FirstStageChoice.tsx");
const progress = read("src/components/store/FirstStageProgress.tsx");
const storefront = read("src/components/StoreWalkthrough.tsx");
const css = read("src/app/first-stage-choice.css");

test("category prompt uses the approved three choices and combo definition", () => {
  assert.match(choice, /¿Qué te provoca hoy\?/);
  assert.match(choice, />Packs</);
  assert.match(choice, />Combos</);
  assert.match(choice, />Schmears</);
  assert.match(choice, /Bagels \+ schmears/);
  assert.doesNotMatch(choice, /sandwich|bebida/i);
});

test("Packs advances to exactly Bagels grandes or Mini bagels", () => {
  assert.match(choice, /¿Grandes o Minis\?/);
  assert.match(choice, />Bagels grandes</);
  assert.match(choice, /6 o 12 bagels/);
  assert.match(choice, />Mini bagels</);
  assert.match(choice, /6, 12 o 24 minis/);
});

test("large and mini families render their exact configuration lists", () => {
  assert.match(choice, /configsForFamily\(selectedFamily\)/);
  assert.match(choice, /config\.mode === "mixed" \? "Mixtos" : "Un sabor"/);
  assert.match(choice, /S\/\{config\.amount\}/);
  assert.match(choice, /selectedConfig === config\.id/);
  assert.match(choice, /Siguiente paso: elegir los sabores/);
});

test("the bottom progress indicator uses the approved six stages", () => {
  assert.match(progress, /FIRST_STAGE_PROGRESS/);
  assert.match(progress, /progressPosition\(step\)/);
  assert.match(progress, /onSize/);
  assert.match(css, /first-stage-progress/);
});

test("the pack flow stays inside the existing store scene without payment calls", () => {
  assert.match(storefront, /<FirstStageChoice/);
  assert.match(storefront, /hashForPackFamily/);
  assert.match(storefront, /setSelectedPackConfig/);
  assert.doesNotMatch(choice + progress, /fetch\s*\(|Culqi|payment|\/api\/reservations|\/api\/payments/);
});

test("future categories remain visible but explicitly unavailable in this increment", () => {
  assert.match(choice, /data-category="combos"/);
  assert.match(choice, /data-category="schmears"/);
  assert.match(choice, /Próxima etapa/);
  assert.match(choice, /aria-disabled="true"/);
});

test("pack configuration cards have responsive layouts and selected state", () => {
  assert.match(css, /\.first-stage-config-grid/);
  assert.match(css, /\.first-stage-config-option\.selected/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
