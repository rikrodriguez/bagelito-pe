import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const view = read("src/components/visit/PhotoVisit.tsx");
const builder = read("src/components/visit/PackVisitBuilder.tsx");
const menu = JSON.parse(read("src/data/verified-menu-reference.json"));

test("Packs stays inside the isolated photographic /visita scene", () => {
  assert.match(view, /showPacks/);
  assert.match(view, /PackVisitBuilder/);
  assert.match(view, /pv-start-packs/);
  assert.doesNotMatch(builder, /SHOP_DRAFT_KEY|Culqi|fetch\s*\(|\/api\//);
});

test("Packs asks Grandes or Minis before quantity and flavor mode", () => {
  assert.match(builder, /¿Grandes o Minis\?/);
  assert.match(builder, /Bagels grandes/);
  assert.match(builder, /Mini bagels/);
  assert.match(builder, /6 o 12 bagels/);
  assert.match(builder, /6, 12 o 24 minis/);
});

test("regular pack configurations use the supplied prices", () => {
  assert.deepEqual(menu.packs.map(({units, flavorMode, price}) => [units, flavorMode, price]), [
    [6, "mixed", 60],
    [6, "single", 50],
    [12, "mixed", 115],
    [12, "single", 100],
  ]);
  assert.match(builder, /menu\.packs/);
});

test("mini pack configurations use the supplied prices", () => {
  assert.deepEqual(menu.miniPacks.map(({units, mixed, single}) => [units, mixed, single]), [
    [6, 25, 20],
    [12, 40, 35],
    [24, 75, 70],
  ]);
  assert.match(builder, /menu\.miniPacks/);
});

test("this stage stops before flavor selection", () => {
  assert.match(builder, /siguiente paso será elegir los sabores/i);
  assert.doesNotMatch(builder, /flavorImages|changeFlavor|pv-bagel-rail|SHOP_DRAFT_UPDATED_EVENT/);
});
