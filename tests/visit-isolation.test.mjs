import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("src/app/page.tsx");
const visit = read("src/app/visita/page.tsx");

test("main homepage stays on the original production composition", () => {
  for (const component of ["Hero", "BatchInfo", "HowMonthlyWorks", "Packs", "FlavorStrip", "FAQ", "FinalCTA"]) {
    assert.match(home, new RegExp("<" + component));
  }
  assert.match(home, /MobileStickyReserveCTA/);
  assert.doesNotMatch(home, /PhotoVisit|StoreWalkthrough|first-stage|walkthrough|spatial-v3/);
});

test("the new experience exists only under /visita", () => {
  assert.match(visit, /PhotoVisit/);
  assert.match(visit, /robots: \{ index: false, follow: false \}/);
  assert.match(visit, /\.\/visit\.css/);
  assert.match(visit, /\.\/packs\.css/);
});
