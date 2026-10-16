import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const filename = fileURLToPath(new URL("../../src/app/admin/CulqiExistingStatusButton.tsx", import.meta.url));

function harness(result = null, pending = false, realHooks = false) {
  assert.ok(existsSync(filename), "The Culqi status button must be implemented");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const calls = [];
  let transitioning = false;
  let transitions = 0;
  const action = () => { throw new Error("Rendering must never query Culqi"); };
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
  componentModule.require = function requireDependency(specifier) {
    if (specifier === "./culqi-status-actions") return { runCulqiExistingOrderStatus: action };
    if (specifier === "react" && !realHooks) {
      return {
        ...React,
        // SSR cannot produce a pending action. Supply only hook state while
        // retaining the actual component tree and React HTML renderer.
        useActionState(receivedAction, initialState) {
          assert.equal(receivedAction, action);
          assert.equal(initialState, null);
          return [result, (input) => {
            assert.equal(transitioning, true, "Dispatch must run inside a transition");
            calls.push(input);
          }, pending];
        },
        startTransition(callback) {
          transitions += 1;
          transitioning = true;
          try { callback(); } finally { transitioning = false; }
        },
      };
    }
    return Module.prototype.require.call(this, specifier);
  };
  componentModule._compile(compiled, filename);
  const { CulqiExistingStatusButton } = componentModule.exports;
  const element = realHooks
    ? React.createElement(CulqiExistingStatusButton, { orderCode: "BAG-000001" })
    : CulqiExistingStatusButton({ orderCode: "BAG-000001" });
  return {
    calls,
    element,
    html: renderToStaticMarkup(element),
    get transitions() { return transitions; },
  };
}

function findButton(element) {
  if (!React.isValidElement(element)) return null;
  if (element.type === "button") return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const button = findButton(child);
    if (button) return button;
  }
  return null;
}

// Regressions that call on render, switch to MPA submission, add hidden
// capabilities, or dispatch additional fields each fail these assertions.
test("initial render exposes an inert button without form fields", () => {
  const h = harness(null, false, true);
  assert.match(h.html, /<button\b[^>]*type="button"[^>]*>Consultar estado Culqi<\/button>/);
  assert.doesNotMatch(h.html, /<(?:form|input)\b|role="status"|disabled=/);
  assert.deepEqual(h.calls, []);
  assert.equal(h.transitions, 0);
});

test("a click dispatches only the order code inside a transition", () => {
  const h = harness();
  findButton(h.element).props.onClick();
  assert.deepEqual(h.calls, [{ orderCode: "BAG-000001" }]);
  assert.equal(h.transitions, 1);
});

test("pending disables the button and blocks duplicate dispatch", () => {
  const h = harness(null, true);
  assert.match(h.html, /<button\b[^>]*disabled=""[^>]*>Consultando estado Culqi…<\/button>/);
  findButton(h.element).props.onClick();
  assert.deepEqual(h.calls, []);
  assert.equal(h.transitions, 0);
});

test("late paid cancelled orders stay visibly in review", () => {
  const h = harness({ ok: true, paymentStatus: "paid", orderStatus: "cancelled", reconciliationRequired: true });
  assert.match(h.html, /role="status">Pago registrado; reserva cancelada y en revisión<\/p>/);
});

test("a completed pending query does not claim a registered payment", () => {
  const h = harness({ ok: true, paymentStatus: "pending", orderStatus: "payment_pending_review", recoveryState: "skipped" });
  assert.match(h.html, /role="status">Pago pendiente\.<\/p>/);
  assert.doesNotMatch(h.html, /Pago registrado|reserva confirmada/i);
});

test("closed results render fixed messages without response details", () => {
  const cases = [
    [{ ok: true, paymentStatus: "paid", orderStatus: "payment_confirmed" }, "Pago registrado."],
    [{ ok: true, paymentStatus: "paid", orderStatus: "cancelled" }, "Pago registrado; reserva cancelada."],
    [{ ok: true, paymentStatus: "paid", reconciliationRequired: true }, "Pago registrado; requiere revisión."],
    [{ ok: true, paymentStatus: "pending", recoveryState: "review_required" }, "El pago requiere revisión."],
    [{ ok: true, paymentStatus: "pending", reconciliationRequired: true }, "El pago requiere revisión."],
    [{ ok: true, paymentStatus: "pending", recoveryState: "deferred", retryAfterSeconds: 15 }, "Consulta diferida; vuelve a intentarlo en unos segundos."],
    [{ ok: true, paymentStatus: "pending", recoveryState: "unavailable" }, "No se pudo completar la consulta Culqi. Inténtalo de nuevo."],
    [{ ok: true, paymentStatus: "failed" }, "Pago fallido."],
    [{ ok: true, paymentStatus: "expired" }, "Pago vencido."],
    [{ ok: true, paymentStatus: "refunded" }, "Pago reembolsado."],
    [{ ok: true }, "Consulta terminada; estado del pago no disponible."],
    [{ ok: false, paymentStatus: "paid" }, "No se pudo consultar el estado Culqi. Inténtalo de nuevo."],
  ];
  const rawSentinel = "DO_NOT_RENDER_PROVIDER_BODY_OR_CAPABILITIES";
  for (const [result, expected] of cases) {
    const h = harness({ ...result, error: rawSentinel, checkoutSessionId: rawSentinel, chargeId: rawSentinel });
    assert.ok(h.html.includes(expected), expected);
    assert.doesNotMatch(h.html, /DO_NOT_RENDER|checkoutSessionId|chargeId|<input\b/);
  }
});
