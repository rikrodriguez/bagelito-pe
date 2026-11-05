import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/data/flavors.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

test("current premium cheese bagels use the verified S/. 12 unit price", () => {
  const bySlug = new Map(mod.flavors.map((flavor) => [flavor.slug, flavor]));
  assert.equal(bySlug.get("cheddar")?.price, 12);
  assert.equal(bySlug.get("jalapeno-cheddar")?.price, 12);
  assert.equal(bySlug.get("cheddar")?.category, "premium");
  assert.equal(bySlug.get("jalapeno-cheddar")?.category, "premium");
});
