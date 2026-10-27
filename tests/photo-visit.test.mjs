import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";
const { initialVisit, visitReducer, readVisitDraft, readVisitHash, validCategory } = loadTs("src/lib/photo-visit.ts");

test("entry advances to the same vitrine before category choice", () => {
  const moving = visitReducer(initialVisit, { type: "ENTER" });
  assert.equal(moving.phase, "acercando");
  assert.equal(visitReducer(moving, { type: "CHOOSE", category: "packs" }), moving);
  assert.deepEqual(visitReducer(moving, { type: "ARRIVE" }), { phase: "elige", category: null });
});
test("only the three approved families are selectable", () => {
  const ready = visitReducer(initialVisit, { type: "QUICK" });
  for (const category of ["packs", "combos", "schmears"]) {
    assert.equal(validCategory(category), true);
    assert.deepEqual(visitReducer(ready, { type: "CHOOSE", category }), { phase: "elige", category });
  }
  for (const category of ["sandwiches", "drinks", "payment", "../admin", ""]) {
    assert.equal(validCategory(category), false);
    assert.deepEqual(visitReducer(ready, { type: "CHOOSE", category }), ready);
  }
});
test("back/reset does not modify commerce data", () => {
  const selected = { phase: "elige", category: "combos" };
  assert.deepEqual(visitReducer(selected, { type: "RESET" }), initialVisit);
  assert.deepEqual(visitReducer(selected, { type: "CLEAR" }), { phase: "elige", category: null });
});
test("reload restores only valid nonfinancial progress", () => {
  assert.deepEqual(readVisitDraft(JSON.stringify({ version: 1, phase: "elige", category: "schmears" })), { phase: "elige", category: "schmears" });
  for (const raw of [null, "{", "null", "[]", '{"version":2}', '{"version":1,"phase":"paid"}']) assert.equal(readVisitDraft(raw), null);
  assert.deepEqual(readVisitDraft('{"version":1,"phase":"elige","category":"invalid"}'), { phase: "elige", category: null });
});
test("browser history uses valid first-tranche destinations", () => {
  assert.deepEqual(readVisitHash("#entrada"), initialVisit);
  assert.deepEqual(readVisitHash("#vitrina"), { phase: "elige", category: null });
  assert.deepEqual(readVisitHash("#packs"), { phase: "elige", category: "packs" });
  assert.equal(readVisitHash("#pagar"), null);
});
