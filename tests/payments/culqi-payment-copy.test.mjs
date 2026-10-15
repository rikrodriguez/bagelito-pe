import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const filename = fileURLToPath(new URL("../../src/app/admin/orders/[orderCode]/page.tsx", import.meta.url));
const source = readFileSync(filename, "utf8");
const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function paymentHtml(paymentStatus) {
  const detail = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PaymentDetail");
  assert.ok(detail, "Render the actual payment detail component");
  const compiled = ts.transpileModule(`${detail.getText(tree)}\nmodule.exports = PaymentDetail;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const component = new Module(filename);
  component.filename = filename;
  component.paths = Module._nodeModulePaths(path.dirname(filename));
  component._compile(`const isManualPaymentPending = () => false;\nconst getPaymentDisplay = () => "Synthetic payment display";\n${compiled}`, filename);
  return renderToStaticMarkup(React.createElement(component.exports, {
    order: { payment_provider: "culqi", payment_status: paymentStatus },
  }));
}

test("Culqi payment details describe both verified confirmation sources", () => {
  for (const status of ["pending", "paid"]) {
    const html = paymentHtml(status);
    assert.match(html, /a verified Culqi webhook or a verified Culqi charge status query/);
    assert.doesNotMatch(html, /only by the verified Culqi webhook/);
  }
});

test("admin status guidance attributes payment evidence to Culqi", () => {
  const hints = [];
  const visit = (node) => {
    if (ts.isJsxText(node) && node.text.startsWith("Payment states")) hints.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(hints.length, 1);
  assert.match(hints[0], /Payment states use verified Culqi evidence\./);
  assert.match(hints[0], /Admin can cancel an unpaid order or advance a paid order through production and delivery\./);
  assert.doesNotMatch(hints[0], /webhook-controlled/);
});

test("the independent editorial draft branch disables automatic deployment", () => {
  const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.git.deploymentEnabled["fix/culqi-payment-status-copy-20261015"], false);
});
