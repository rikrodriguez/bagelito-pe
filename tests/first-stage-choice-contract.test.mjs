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
  assert.match(choice, /2 bagels \+ 1 schmear/);
  assert.doesNotMatch(choice, /sandwich|bebida/i);
});

test("Packs advances to exactly Bagels grandes or Mini bagels", () => {
  assert.match(choice, /¿Grandes o Minis\?/);
  assert.match(choice, />Bagels grandes</);
  assert.match(choice, /6 o 12 bagels/);
  assert.match(choice, />Mini bagels</);
  assert.match(choice, /6, 12 o 24 mini bagels/);
  assert.match(choice, /selectedFamily === "large"/);
  assert.match(choice, /selectedFamily === "mini"/);
});

test("the bottom progress indicator uses the six approved stages", () => {
  for (const label of ["Entrada", "Categoría", "Tamaño", "Selecciona", "Revisa", "Pago"]) {
    assert.ok(progress.includes(label) || progress.includes("FIRST_STAGE_PROGRESS"));
  }
  assert.match(progress, /progressPosition\(step\)/);
  assert.match(css, /first-stage-progress/);
});

test("the packs fork is integrated into the existing store scene without payment calls", () => {
  assert.match(storefront, /<FirstStageChoice/);
  assert.match(storefront, /<FirstStageProgress/);
  assert.match(storefront, /getFirstStageFromHash/);
  assert.match(storefront, /hashForFirstStage/);
  assert.match(storefront, /setFirstStageStep/);
  assert.doesNotMatch(choice + progress, /fetch\s*\(|Culqi|payment|\/api\/reservations|\/api\/payments/);
});

test("future categories remain visible but explicitly unavailable in this increment", () => {
  assert.match(choice, /data-category="combos"/);
  assert.match(choice, /data-category="schmears"/);
  assert.match(choice, /Próxima etapa/);
  assert.match(choice, /disabled/);
});


test("future progress labels use an AA-safe text color on white", () => {
  assert.match(css, /\.first-stage-progress button,\s*\.first-stage-progress-future\s*\{[^}]*color:\s*#56677f/i);
});


test("future categories stay keyboard-focusable while explicitly unavailable", () => {
  assert.match(choice, /data-category="combos"\s+aria-disabled="true"/);
  assert.match(choice, /data-category="schmears"\s+aria-disabled="true"/);
  assert.doesNotMatch(choice, /data-category="combos"\s+disabled/);
  assert.doesNotMatch(choice, /data-category="schmears"\s+disabled/);
});
