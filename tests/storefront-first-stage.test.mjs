import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const flow = loadTs("src/lib/storefront-first-stage.ts");

test("first-stage progress labels match the approved journey exactly", () => {
  assert.deepEqual([...flow.FIRST_STAGE_PROGRESS], [
    "Entrada", "Categoría", "Tamaño", "Selecciona", "Revisa", "Pago",
  ]);
});

test("hashes restore category, size and the chosen pack family", () => {
  assert.equal(flow.getFirstStageFromHash("#entrar"), "entry");
  assert.equal(flow.getFirstStageFromHash("#mostrador"), "category");
  assert.equal(flow.getFirstStageFromHash("#packs"), "pack-size");
  assert.equal(flow.getFirstStageFromHash("#packs-grandes"), "pack-config");
  assert.equal(flow.getFirstStageFromHash("#packs-minis"), "pack-config");
  assert.equal(flow.getPackFamilyFromHash("#packs-grandes"), "large");
  assert.equal(flow.getPackFamilyFromHash("#packs-minis"), "mini");
  assert.equal(flow.getPackFamilyFromHash("#anything"), null);
});

test("first-stage steps have stable hashes and progress indexes", () => {
  assert.equal(flow.hashForFirstStage("entry"), "#entrar");
  assert.equal(flow.hashForFirstStage("category"), "#mostrador");
  assert.equal(flow.hashForFirstStage("pack-size"), "#packs");
  assert.equal(flow.hashForPackFamily("large"), "#packs-grandes");
  assert.equal(flow.hashForPackFamily("mini"), "#packs-minis");
  assert.equal(flow.progressPosition("entry"), 0);
  assert.equal(flow.progressPosition("category"), 1);
  assert.equal(flow.progressPosition("pack-size"), 2);
  assert.equal(flow.progressPosition("pack-config"), 3);
});

test("large pack prices and formats match the approved menu", () => {
  assert.deepEqual(flow.LARGE_PACK_CONFIGS.map(({ units, mode, amount }) => [units, mode, amount]), [
    [6, "mixed", 60],
    [6, "single", 50],
    [12, "mixed", 115],
    [12, "single", 100],
  ]);
});

test("mini pack prices and formats match the approved menu", () => {
  assert.deepEqual(flow.MINI_PACK_CONFIGS.map(({ units, mode, amount }) => [units, mode, amount]), [
    [6, "mixed", 25],
    [6, "single", 20],
    [12, "mixed", 40],
    [12, "single", 35],
    [24, "mixed", 75],
    [24, "single", 70],
  ]);
});
