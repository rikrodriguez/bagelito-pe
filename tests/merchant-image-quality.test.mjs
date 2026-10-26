import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTs } from "./helpers/load-ts.mjs";

const require = createRequire(import.meta.url);
const { ImageOptimizerCache } = require("next/dist/server/image-optimizer.js");
const { imageConfigDefault } = require("next/dist/shared/lib/image-config.js");
const images = { ...imageConfigDefault, ...loadTs("next.config.ts").default.images };
const { flavorImages } = loadTs("src/data/flavor-images.ts");

test("the production optimizer accepts the homepage's quality 75 for all ten flavor images", () => {
  assert.equal(Object.keys(flavorImages).length, 10);
  for (const [flavor, url] of Object.entries(flavorImages)) {
    const result = ImageOptimizerCache.validateParams({ headers: {} }, { url, w: "640", q: "75" }, { images }, false);
    assert.equal(result.errorMessage, undefined, `${flavor}: ${result.errorMessage}`);
  }
});

test("the existing pack and checkout image qualities remain accepted", () => {
  for (const q of ["70", "72", "74", "76"]) {
    const result = ImageOptimizerCache.validateParams({ headers: {} }, { url: "/images/pack-6-mixed.webp", w: "640", q }, { images }, false);
    assert.equal(result.errorMessage, undefined);
  }
});
