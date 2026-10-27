import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const flow = loadTs("src/lib/storefront-first-stage.ts");

test("first-stage progress labels match the approved journey exactly", () => {
  assert.deepEqual([...flow.FIRST_STAGE_PROGRESS], [
    "Entrada", "Categoría", "Tamaño", "Selecciona", "Revisa", "Pago",
  ]);
});

test("hashes restore only the implemented first-stage states", () => {
  assert.equal(flow.getFirstStageFromHash("#entrar"), "entry");
  assert.equal(flow.getFirstStageFromHash("#mostrador"), "category");
  assert.equal(flow.getFirstStageFromHash("#packs"), "pack-size");
  assert.equal(flow.getFirstStageFromHash("#anything-else"), "entry");
});

test("first-stage steps have stable hashes and progress indexes", () => {
  assert.equal(flow.hashForFirstStage("entry"), "#entrar");
  assert.equal(flow.hashForFirstStage("category"), "#mostrador");
  assert.equal(flow.hashForFirstStage("pack-size"), "#packs");
  assert.equal(flow.progressPosition("entry"), 0);
  assert.equal(flow.progressPosition("category"), 1);
  assert.equal(flow.progressPosition("pack-size"), 2);
});
