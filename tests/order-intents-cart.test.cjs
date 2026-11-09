const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const out = mkdtempSync(join(tmpdir(), "bagelito-request-cart-"));
let cart;
try {
  execFileSync("tsc", [
    "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "commonjs",
    "--moduleResolution", "node", "--rootDir", "src/lib/order-intents",
    "--outDir", out, "src/lib/order-intents/request-cart.ts",
  ], { cwd: root, stdio: "pipe", timeout: 15000 });
  cart = require(join(out, "request-cart.js"));
} finally {
  // Remove output at process exit, after synchronous node:test execution.
  process.on("exit", () => rmSync(out, { recursive: true, force: true }));
}
const { buildRequestCartLine: line, appendRequestCartLine: append } = cart;

test("plain 6 pack valid, price omitted", () => {
  const result = line("pack-grande-6-un-sabor", 1, { plain: 6 }, "");
  assert.deepEqual(result, { sku:"pack-grande-6-un-sabor", quantity:1,
    flavors:[{flavor:"plain",quantity:6}] });
  assert.equal("price_minor" in result, false);
});
test("valid mixed pack can include Classic Onion", () => {
  assert.equal(line("pack-grande-6-mixto",1,{plain:3,"classic-onion":3},"").flavors.length,2);
});
test("mini premium flavor rejected", () => {
  assert.throws(()=>line("pack-mini-6-un-sabor",1,{"jalapeno-cheddar":6},""),TypeError);
});
test("underfilled, overfilled, and mismatched composition rejected", () => {
  assert.throws(()=>line("pack-grande-6-mixto",1,{plain:3},""),TypeError);
  assert.throws(()=>line("pack-grande-6-mixto",1,{plain:5,sesame:3},""),TypeError);
  assert.throws(()=>line("pack-grande-6-un-sabor",1,{plain:3,sesame:3},""),TypeError);
});
test("flavored schmear requires specified flavor and carries no price", () => {
  assert.throws(()=>line("schmear-120g-saborizado",1,{},""),TypeError);
  assert.deepEqual(line("schmear-120g-saborizado",1,{},"Chicha Morada"),
    {sku:"schmear-120g-saborizado",quantity:1,schmearFlavor:"chicha-morada"});
});
test("combos and custom colors remain nonpayable review categories", () => {
  const result=line("combo-perfect-pair",2,{},"");
  assert.deepEqual(result,{sku:"combo-perfect-pair",quantity:2});
  assert.equal("payable" in result,false);
});
test("unknown SKU, fractional quantity and negative quantity rejected", () => {
  assert.throws(()=>line("secret-item",1,{},""),TypeError);
  assert.throws(()=>line("pack-grande-6-un-sabor",1.2,{plain:6},""),TypeError);
  assert.throws(()=>line("pack-grande-6-un-sabor",-1,{plain:6},""),TypeError);
});
test("identical duplicate and cart capacity fail safely", () => {
  const request=line("schmear-120g-original",1,{},"");
  assert.equal(append([],request).length,1);
  assert.throws(()=>append([request],request),TypeError);
  assert.throws(()=>append([], {...request,quantity:41}), TypeError);
});
