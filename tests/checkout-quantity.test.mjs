import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { loadTs, sourceModule } from "./helpers/load-ts.mjs";

const { packs } = loadTs("src/data/packs.ts");
const { flavors } = loadTs("src/data/flavors.ts");
const i18n = loadTs("src/lib/i18n.ts");
const Empty = () => null;

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

// Keep updates queued until flush(), as React does when several handlers run
// in one batch. The handlers and rendered quantity controls are the real UI.
function checkout(packSlug, locale, t) {
  const state = [];
  const refs = [];
  const effectSlots = [];
  const effects = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let queued = [];
  let tree;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = {
    localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {},
    scrollTo() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
    setTimeout() { return 1; }, clearTimeout() {},
  };
  globalThis.document = { documentElement: {}, body: { classList: { toggle() {}, remove() {} } } };
  t.after(() => {
    effectSlots.forEach(slot => slot?.cleanup?.());
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  });
  const { ReservationFlow } = sourceModule("src/app/reserve/ReservationFlow.tsx", {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], update => queued.push({ index, update })];
      },
      useRef(initial) {
        const index = refIndex++;
        return refs[index] ??= { current: initial };
      },
      useMemo: compute => compute(),
      useEffect(effect, deps) {
        const index = effectIndex++, previous = effectSlots[index];
        const same = previous?.deps && deps && previous.deps.length === deps.length
          && previous.deps.every((value, item) => Object.is(value, deps[item]));
        if (!same) {
          effectSlots[index] = { deps };
          effects.push(() => { previous?.cleanup?.(); effectSlots[index].cleanup = effect(); });
        }
      },
    },
    "next/image": { __esModule: true, default: Empty },
    "next/link": { __esModule: true, default: Empty },
    "@/components/RollingBagel": { RollingBagel: Empty },
    "@/components/ConversionTrustStrip": { ConversionTrustStrip: Empty },
    "@/components/payments/CulqiCheckoutButton": { CulqiCheckoutButton: Empty },
    "@/components/BatchAvailabilityProvider": { useBatchAvailability: () => ({ accepting: true, merchantReviewOnly: true, batchName: "Synthetic batch" }) },
    "@/components/LanguageProvider": { useLanguage: () => ({ locale, copy: i18n.translations[locale] }) },
    "@/data/flavor-images": loadTs("src/data/flavor-images.ts"),
    "@/lib/analytics": { trackBagelitoEvent() {} },
    "@/lib/delivery-pricing": loadTs("src/lib/delivery-pricing.ts"),
    "@/lib/checkout-upsell": loadTs("src/lib/checkout-upsell.ts"),
    "@/lib/i18n": i18n,
    "@/lib/reservations/schema": { districtOptions: ["Miraflores"] },
    "@/lib/site": { siteAddress: "Synthetic address", siteServiceArea: "Synthetic service area" },
    "@/lib/whatsapp": { getWhatsAppHref: () => "#synthetic-support" },
    "@/lib/waitlist/use-campaign-href": { useWaitlistCampaignHref: () => pack => `/waitlist?pack=${pack}` },
  });

  function render() {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    tree = ReservationFlow({ packs, flavors, initialPackSlug: packSlug, paymentConfig: { enabled: false }, checkoutPage: true });
    while (effects.length) effects.shift()();
  }
  function flush() {
    do {
      const updates = queued;
      queued = [];
      for (const { index, update } of updates) state[index] = typeof update === "function" ? update(state[index]) : update;
      render();
    } while (queued.length);
  }
  function clickFlavor(slug, delta) {
    const label = `${delta > 0 ? i18n.translations[locale].reserve.add : i18n.translations[locale].reserve.remove} ${i18n.flavorCopy[locale][slug]}`;
    const button = elements(tree).find(node => node.type === "button" && node.props["aria-label"] === label);
    assert.ok(button, `real quantity button must exist: ${label}`);
    button.props.onClick();
  }
  function quantities() {
    return elements(tree)
      .filter(node => node.type === "div" && node.props.className === "quantity-control")
      .map(control => elements(control).find(node => node.type === "strong").props.children);
  }
  render();
  flush();
  const nav = elements(tree).find(node => node.props.className === "reserve-nav");
  elements(nav).find(node => node.type === "button" && node.props.className.includes("pink")).props.onClick();
  flush();
  assert.equal(quantities().length, flavors.length, "start from the actual flavor-selection step");
  return { clickFlavor, flush, quantities };
}

for (const locale of ["es", "en"]) {
  for (const pack of packs.filter(item => item.packType === "mixed")) {
    test(`batched clicks across flavors never exceed ${pack.units} bagels (${locale})`, t => {
      const ui = checkout(pack.slug, locale, t);
      for (let round = 0; round < 4; round += 1) {
        for (const flavor of flavors) ui.clickFlavor(flavor.slug, 1);
      }
      ui.flush();
      assert.equal(ui.quantities().reduce((sum, quantity) => sum + quantity, 0), pack.units);
      assert.ok(ui.quantities().every(quantity => Number.isInteger(quantity) && quantity >= 0));
    });

    test(`queued decrements free only the available capacity for other flavors (${pack.slug}, ${locale})`, t => {
      const ui = checkout(pack.slug, locale, t);
      for (let index = 0; index < pack.units; index += 1) ui.clickFlavor(flavors[0].slug, 1);
      ui.flush();
      assert.equal(ui.quantities()[0], pack.units);

      // These handlers share one render: remove two, then try to add three
      // elsewhere. Exactly two additions should fit, with no lost update.
      ui.clickFlavor(flavors[0].slug, -1);
      ui.clickFlavor(flavors[0].slug, -1);
      for (let index = 0; index < 3; index += 1) ui.clickFlavor(flavors[1].slug, 1);
      ui.flush();
      assert.equal(ui.quantities()[0], pack.units - 2);
      assert.equal(ui.quantities()[1], 2);
      assert.equal(ui.quantities().reduce((sum, quantity) => sum + quantity, 0), pack.units);

      for (let index = 0; index < pack.units + 3; index += 1) ui.clickFlavor(flavors[1].slug, -1);
      ui.flush();
      assert.equal(ui.quantities()[1], 0);
      assert.ok(ui.quantities().every(quantity => quantity >= 0));
    });
  }
}
