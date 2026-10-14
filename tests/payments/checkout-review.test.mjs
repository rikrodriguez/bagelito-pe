import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import {
  beginCheckoutPayment, checkoutRecoveryOutcome, CheckoutReviewError,
  clearCheckoutRecovery, markCheckoutPaymentReview, readCheckoutRecovery,
  CHECKOUT_RECOVERY_STORAGE_KEY,
} from '../../src/lib/payments/checkout-recovery.ts';
import { translations, packCopy, flavorCopy } from '../../src/lib/i18n.ts';

const checkoutSessionId = '00000000-0000-4000-8000-000000000001';
const reference = { version: 1, checkoutSessionId, orderCode: 'BAG-TEST-1', state: 'pending' };
function storage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
}

// Exercise the real component callbacks with deterministic hooks. No SDK,
// network, database, cookies or personal data are used by these fixtures.
function hooks() {
  const slots = [];
  const stateSlots = [];
  const effects = [];
  let cursor = 0;
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    api: {
      useState(initial) {
        const index = cursor++;
        if (!Object.hasOwn(slots, index)) {
          slots[index] = { value: typeof initial === 'function' ? initial() : initial };
          stateSlots.push(slots[index]);
        }
        const slot = slots[index];
        const set = value => { slot.value = typeof value === 'function' ? value(slot.value) : value; };
        slot.set = set;
        return [slot.value, set];
      },
      useRef(initial) {
        const index = cursor++;
        if (!Object.hasOwn(slots, index)) slots[index] = { current: initial };
        return slots[index];
      },
      useMemo(factory) { cursor++; return factory(); },
      useCallback(callback) { cursor++; return callback; },
      useEffect(effect, deps) {
        const index = cursor++;
        const prior = slots[index];
        if (!prior || !equalDeps(prior.deps, deps)) effects.push(() => {
          prior?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      },
    },
    states: stateSlots,
    render(component, props) {
      cursor = 0;
      const tree = component(props);
      while (effects.length) effects.shift()();
      return tree;
    },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) { return nodes(tree).filter(node => typeof node === 'string' || typeof node === 'number').join(' '); }
function button(tree, label) {
  return nodes(tree).find(node => node?.type === 'button' && text(node).includes(label));
}

const flowFilename = fileURLToPath(new URL('../../src/app/reserve/ReservationFlow.tsx', import.meta.url));
const buttonFilename = fileURLToPath(new URL('../../src/components/payments/CulqiCheckoutButton.tsx', import.meta.url));
const flowSource = await readFile(flowFilename, 'utf8');
const buttonSource = await readFile(buttonFilename, 'utf8');
const recoveryModule = await import('../../src/lib/payments/checkout-recovery.ts');
function compileComponent(filename, source, customRequire) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
  componentModule.require = function requireFixtureDependency(specifier) {
    const fixture = customRequire(specifier);
    return fixture === undefined ? Module.prototype.require.call(this, specifier) : fixture;
  };
  componentModule._compile(compiled, filename);
  return componentModule.exports;
}
function Placeholder() { return null; }
function FixtureCheckout() { return null; }
const config = { enabled: true, mode: 'sandbox', provider: 'culqi', currency: 'PEN', publicKey: 'pk_test_fixture', rsaId: 'fixture', rsaPublicKey: 'fixture' };

function browser(store) {
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  let uuidCalls = 0;
  const listeners = new Map();
  globalThis.window = {
    localStorage: store, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, '0')}` },
    location: { href: 'https://fixture.invalid/checkout', origin: 'https://fixture.invalid' },
    scrollTo() {}, requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
    setTimeout(callback) { callback(); return 1; }, clearTimeout() {},
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
  };
  globalThis.document = { documentElement: {}, body: { classList: { toggle() {}, remove() {} } } };
  return {
    get uuidCalls() { return uuidCalls; },
    dispatch(name, event) { listeners.get(name)?.forEach(listener => listener(event)); },
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    },
  };
}

function flowHarness(paymentConfig = config) {
  const h = hooks();
  const { ReservationFlow } = compileComponent(flowFilename, flowSource, specifier => {
    if (specifier === 'react') return { ...React, ...h.api };
    if (specifier === 'next/image' || specifier === 'next/link') return { __esModule: true, default: Placeholder };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => Placeholder });
    if (specifier === '@/components/payments/CulqiCheckoutButton') return { CulqiCheckoutButton: FixtureCheckout };
    if (specifier === '@/components/LanguageProvider') return { useLanguage: () => ({ locale: 'es', copy: translations.es }) };
    if (specifier === '@/components/BatchAvailabilityProvider') return { useBatchAvailability: () => ({ accepting: true, batchName: 'Synthetic', remainingPacks: 10, deliveryDate: null, ordersCloseAt: null }) };
    if (specifier === '@/components/RollingBagel') return { RollingBagel: Placeholder };
    if (specifier === '@/components/ConversionTrustStrip') return { ConversionTrustStrip: Placeholder };
    if (specifier === '@/lib/payments/checkout-recovery') return recoveryModule;
    if (specifier === '@/lib/analytics') return { trackBagelitoEvent() {} };
    if (specifier === '@/lib/delivery-pricing') return { getDeliveryFee: () => 8 };
    if (specifier === '@/lib/checkout-upsell') return { checkoutExtraPackDiscountPercent: 10, getCheckoutExtraPackOffer: amount => ({ originalAmount: amount, discountedAmount: amount * .9, savingsAmount: amount * .1 }) };
    if (specifier === '@/lib/i18n') return { packCopy, flavorCopy };
    if (specifier === '@/lib/reservations/schema') return { districtOptions: ['Miraflores'] };
    if (specifier === '@/lib/site') return { siteServiceArea: 'Synthetic' };
    if (specifier === '@/lib/whatsapp') return { getWhatsAppHref: () => 'https://fixture.invalid/support' };
  });
  const props = {
    packs: [{ slug: '6-single', units: 6, packType: 'single', amount: 58, name: 'Synthetic' }],
    flavors: [{ slug: 'plain', name: 'Plain' }], initialPackSlug: '6-single', paymentConfig, checkoutPage: true,
  };
  let tree = h.render(ReservationFlow, props);
  const render = () => (tree = h.render(ReservationFlow, props));
  render();
  return {
    render, cleanup: h.cleanup,
    checkout() { return nodes(tree).find(node => node?.type === FixtureCheckout)?.props; },
    reviewStage() { h.states[0].set(4); render(); },
    get tree() { return tree; },
  };
}

function serverFixture(store, { charge = { ok: false, paymentStatus: 'reconciliation_required' }, status = { ok: true, paymentStatus: 'pending', reconciliationRequired: true }, failCharge = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ url, payload });
    if (url.endsWith('/charge')) {
      assert.equal(readCheckoutRecovery(store)?.orderCode, reference.orderCode, 'recovery must be durable before the charge request');
      if (failCharge) throw new Error('synthetic network failure');
    }
    const result = url === '/api/reservations/culqi' ? { ok: true, orderCode: reference.orderCode, amount: 66 }
      : url.endsWith('/order') ? { ok: true, sessionId: 'synthetic-local-payment-session', amount: 6600 }
        : url.endsWith('/charge') ? (typeof charge === 'function' ? charge(calls.filter(call => call.url.endsWith('/charge')).length) : charge)
          : status;
    return { ok: result.ok, json: async () => result };
  };
  return calls;
}

test('recovery persistence contains only order/session/state and survives navigation without a second start', () => {
  const store = storage();
  beginCheckoutPayment(store, reference);
  markCheckoutPaymentReview(store, reference);
  const restored = readCheckoutRecovery(store);
  assert.equal(restored.state, 'review');
  assert.deepEqual(Object.keys(JSON.parse(store.getItem(CHECKOUT_RECOVERY_STORAGE_KEY))).sort(), ['checkoutSessionId', 'orderCode', 'state', 'version']);
  assert.throws(() => beginCheckoutPayment(store, { ...reference, orderCode: 'BAG-TEST-2' }), CheckoutReviewError);
  assert.throws(() => clearCheckoutRecovery(store, { ...reference, orderCode: 'BAG-TEST-2' }), CheckoutReviewError);
  assert.deepEqual(readCheckoutRecovery(store), restored);
});

test('missing/malformed status cannot unlock recovery; paid requiring review remains locked', () => {
  for (const result of [{}, { ok: false, paymentStatus: 'paid' }, { ok: true, paymentStatus: 'paid' }]) {
    assert.equal(checkoutRecoveryOutcome(result), 'pending');
  }
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: 'paid', reconciliationRequired: true }), 'review');
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: 'paid', reconciliationRequired: false }), 'paid');
  assert.equal(checkoutRecoveryOutcome({ ok: true, paymentStatus: 'expired', reconciliationRequired: false }), 'released');
});

test('corrupt storage and a failed persistence write fail before any charge can start', () => {
  const store = storage();
  store.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, '{malformed');
  assert.throws(() => readCheckoutRecovery(store), CheckoutReviewError);
  assert.throws(() => beginCheckoutPayment(store, reference), CheckoutReviewError);
  assert.throws(() => beginCheckoutPayment({ ...storage(), setItem() { throw new Error('quota'); } }, reference), /quota/);
});

for (const [name, scenario] of [
  ['charge reconciliation_required', {}],
  ['verified status needs review', { charge: { ok: true }, status: { ok: true, paymentStatus: 'paid', reconciliationRequired: true } }],
  ['lost charge response', { failCharge: true }],
]) {
  test(`${name} locks retry, stale editing and upsell; reload only checks the same order`, async () => {
    const store = storage();
    const env = browser(store);
    const calls = serverFixture(store, scenario);
    const flow = flowHarness();
    let restored;
    try {
      flow.reviewStage();
      const checkout = flow.checkout();
      const edit = button(flow.tree, 'Editar pack');
      const upsell = button(flow.tree, 'Agregar pack');
      const session = await checkout.prepareCheckout();
      assert.equal(session.checkoutSessionId, checkoutSessionId);
      assert.notEqual(session.sessionId, checkoutSessionId, 'the payment attempt ID is not the checkout ownership ID');
      await assert.rejects(() => checkout.onToken(session, 'ype_test_syntheticfirst', {}), CheckoutReviewError);
      flow.render();
      assert.match(text(flow.tree), /Tu pago necesita revisión/);
      assert.match(text(flow.tree), /BAG-TEST-1/);
      assert.equal(flow.checkout(), undefined);
      const uuidCalls = env.uuidCalls;
      edit.props.onClick();
      upsell.props.onClick();
      await assert.rejects(() => checkout.prepareCheckout(), CheckoutReviewError);
      await assert.rejects(() => checkout.onToken(session, 'ype_test_syntheticsecond', {}), CheckoutReviewError);
      assert.equal(env.uuidCalls, uuidCalls);
      assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
      assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
      assert.doesNotMatch(store.getItem(CHECKOUT_RECOVERY_STORAGE_KEY), /ype_test|email|card|device|fingerprint/);
      restored = flowHarness();
      assert.equal(restored.checkout(), undefined);
      assert.match(text(restored.tree), /BAG-TEST-1/);
      button(restored.tree, 'Consultar estado').props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      restored.render();
      const lookup = calls.filter(call => call.url.endsWith('/status')).at(-1);
      assert.deepEqual(lookup.payload, { checkoutSessionId, orderCode: reference.orderCode });
      assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
      assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
      assert.equal(readCheckoutRecovery(store).state, 'review');
    } finally { restored?.cleanup(); flow.cleanup(); env.restore(); }
  });
}

test('pending submission also survives reload and cannot reinitialize checkout', async () => {
  const store = storage(); const env = browser(store);
  const calls = serverFixture(store, { charge: { ok: true }, status: { ok: true, paymentStatus: 'pending', reconciliationRequired: false } });
  const flow = flowHarness(); let restored;
  try {
    flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
    assert.equal(await checkout.onToken(session, 'ype_test_pending123', {}), 'submitted');
    flow.render();
    assert.equal(readCheckoutRecovery(store).state, 'pending');
    assert.equal(flow.checkout(), undefined);
    assert.equal(window.location.href, 'https://fixture.invalid/checkout');
    restored = flowHarness();
    assert.equal(restored.checkout(), undefined);
    await assert.rejects(() => checkout.prepareCheckout(), CheckoutReviewError);
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
  } finally { restored?.cleanup(); flow.cleanup(); env.restore(); }
});

test('a verified terminal status clears only its reference and requires an explicit new-order action', async () => {
  const store = storage(); beginCheckoutPayment(store, reference);
  const env = browser(store);
  const calls = serverFixture(store, { status: { ok: true, paymentStatus: 'expired', reconciliationRequired: false } });
  const flow = flowHarness();
  try {
    assert.equal(flow.checkout(), undefined);
    button(flow.tree, 'Consultar estado').props.onClick();
    await new Promise(resolve => setImmediate(resolve)); flow.render();
    assert.equal(readCheckoutRecovery(store), null);
    assert.match(text(flow.tree), /El pago no se completó/);
    assert.equal(flow.checkout(), undefined);
    assert.equal(calls.length, 1);
    button(flow.tree, 'Crear nuevo pedido').props.onClick(); flow.render();
    assert.doesNotMatch(text(flow.tree), /Tu pago necesita revisión/);
    assert.equal(calls.length, 1);
  } finally { flow.cleanup(); env.restore(); }
});

test('only the current in-memory 3DS source may continue; storage never retains it', async () => {
  const store = storage(); const env = browser(store);
  const calls = serverFixture(store, { charge: number => number === 1 ? { ok: true, requires3DS: true } : { ok: true }, status: { ok: true, paymentStatus: 'pending', reconciliationRequired: false } });
  const flow = flowHarness();
  try {
    flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
    const security = { authentication3DS: { cavv: 'synthetic', eci: 'synthetic', xid: 'synthetic', protocolVersion: 'synthetic' } };
    assert.equal(await checkout.onToken(session, 'tkn_test_original123', {}), 'requires_3ds');
    await assert.rejects(() => checkout.onToken(session, 'tkn_test_newtoken123', security), CheckoutReviewError);
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(await checkout.onToken(session, 'tkn_test_original123', security), 'submitted');
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 2);
    await assert.rejects(() => checkout.onToken(session, 'tkn_test_original123', security), CheckoutReviewError);
    assert.doesNotMatch(store.getItem(CHECKOUT_RECOVERY_STORAGE_KEY), /tkn_test|cavv|eci|xid|protocolVersion/);
  } finally { flow.cleanup(); env.restore(); }
});

test('the real SDK button latches review after submission errors and never renders retry', async () => {
  const store = storage(); const env = browser(store); const h = hooks();
  const { CulqiCheckoutButton } = compileComponent(buttonFilename, buttonSource, specifier => {
    if (specifier === 'react') return { ...React, ...h.api };
    if (specifier === 'next/script') return { __esModule: true, default: Placeholder };
  });
  let sdk; let preparations = 0; let submissions = 0; let reviews = 0;
  const instances = [];
  window.CulqiCheckout = class {
    constructor() { instances.push(this); }
    close() {} open() {}
  };
  const props = { amount: 66, config, customerEmail: '', locale: 'es', disabled: false,
    onError() {}, onPaymentUnresolved() { reviews++; },
    prepareCheckout: async () => { preparations++; return { amountMinor: 6600, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: null }; },
    onToken: async () => { submissions++; throw new CheckoutReviewError(); },
  };
  try {
    h.render(CulqiCheckoutButton, props); h.states[0].set(true); h.states[1].set(true);
    h.render(CulqiCheckoutButton, props); await new Promise(resolve => setImmediate(resolve));
    sdk = instances[0];
    sdk.token = { id: 'ype_test_synthetic123' }; sdk.culqi();
    await new Promise(resolve => setImmediate(resolve));
    const tree = h.render(CulqiCheckoutButton, props);
    assert.match(text(tree), /resultado del pago necesita revisión/);
    assert.equal(button(tree, 'Reintentar checkout'), undefined);
    sdk.culqi(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(submissions, 1); assert.equal(preparations, 1); assert.equal(reviews, 1);
  } finally { h.cleanup(); env.restore(); }
});

test('a late paid result for A cannot clear another unresolved reference B', async () => {
  const store = storage(); const env = browser(store); const flow = flowHarness();
  const calls = serverFixture(store, { charge: { ok: true } });
  const fetchFixture = globalThis.fetch;
  let resolveStatus;
  const statusGate = new Promise(resolve => { resolveStatus = resolve; });
  globalThis.fetch = async (url, init) => url.endsWith('/status')
    ? statusGate : fetchFixture(url, init);
  try {
    flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
    const submitted = checkout.onToken(session, 'ype_test_original123', {});
    await new Promise(resolve => setImmediate(resolve));
    const replacement = { ...reference, checkoutSessionId: '00000000-0000-4000-8000-000000000002', orderCode: 'BAG-TEST-2', state: 'review' };
    store.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify(replacement));
    env.dispatch('storage', { key: CHECKOUT_RECOVERY_STORAGE_KEY });
    resolveStatus({ ok: true, json: async () => ({ ok: true, paymentStatus: 'paid', reconciliationRequired: false }) });
    await assert.rejects(() => submitted, CheckoutReviewError);
    flow.render();
    assert.deepEqual(readCheckoutRecovery(store), replacement);
    assert.match(text(flow.tree), /BAG-TEST-2/);
    assert.equal(flow.checkout(), undefined);
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(window.location.href, 'https://fixture.invalid/checkout');
  } finally { flow.cleanup(); env.restore(); }
});

test('storage unavailable blocks enabled payments while a clean disabled checkout remains usable', () => {
  const store = { ...storage(), getItem() { throw new Error('storage unavailable'); } };
  const env = browser(store); const enabled = flowHarness(); let disabled;
  try {
    assert.equal(enabled.checkout(), undefined);
    assert.match(text(enabled.tree), /No vuelvas a pagar/);
    disabled = flowHarness({ ...config, enabled: false, mode: 'disabled' });
    assert.doesNotMatch(text(disabled.tree), /No vuelvas a pagar/);
    button(disabled.tree, translations.es.reserve.continue).props.onClick(); disabled.render();
    assert.equal(button(disabled.tree, translations.es.reserve.back).props.disabled, false);
    disabled.reviewStage();
    assert.equal(disabled.checkout().config.enabled, false);
  } finally { disabled?.cleanup(); enabled.cleanup(); env.restore(); }
});

test('a stored unresolved payment remains locked when the payment flag is disabled', () => {
  const store = storage(); beginCheckoutPayment(store, reference);
  const env = browser(store); const flow = flowHarness({ ...config, enabled: false, mode: 'disabled' });
  try {
    assert.equal(flow.checkout(), undefined);
    assert.match(text(flow.tree), /BAG-TEST-1/);
    assert.ok(button(flow.tree, 'Consultar estado'));
  } finally { flow.cleanup(); env.restore(); }
});

for (const stage of ['prepare', 'device']) {
  test(`unmount during ${stage} invalidates old SDK callbacks before a charge`, async () => {
    const env = browser(storage()); const h = hooks();
    const { CulqiCheckoutButton } = compileComponent(buttonFilename, buttonSource, specifier => {
      if (specifier === 'react') return { ...React, ...h.api };
      if (specifier === 'next/script') return { __esModule: true, default: Placeholder };
    });
    let release; const gate = new Promise(resolve => { release = resolve; });
    let sdk; let constructions = 0; let submissions = 0; let closed = 0;
    const instances = [];
    window.CulqiCheckout = class {
      constructor() { constructions++; instances.push(this); }
      open() {} close() { closed++; }
    };
    window.Culqi3DS = { publicKey: '', options: {}, generateDevice: () => gate };
    const session = { amountMinor: 6600, checkoutSessionId, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: null };
    const props = { amount: 66, config, customerEmail: '', locale: 'es', disabled: false,
      onError() {}, prepareCheckout: () => stage === 'prepare' ? gate : Promise.resolve(session),
      onToken: async () => { submissions++; return 'submitted'; },
    };
    try {
      h.render(CulqiCheckoutButton, props); h.states[0].set(true); h.states[1].set(true);
      h.render(CulqiCheckoutButton, props);
      await new Promise(resolve => setImmediate(resolve));
      sdk = instances[0];
      let staleCallback;
      if (stage === 'device') {
        sdk.token = { id: 'tkn_test_synthetic123' };
        staleCallback = sdk.culqi;
        staleCallback();
      }
      h.cleanup();
      release(stage === 'prepare' ? session : 'device_synthetic');
      await new Promise(resolve => setImmediate(resolve));
      staleCallback?.();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(submissions, 0);
      if (stage === 'prepare') assert.equal(constructions, 0);
      else { assert.equal(sdk.culqi, undefined); assert.ok(closed >= 1); }
    } finally { env.restore(); }
  });
}

for (const earlyReview of [false, true]) {
  test(`3DS continuation ${earlyReview ? 'does not start after review' : 'completes the active generation once'}`, async () => {
    const env = browser(storage()); const h = hooks();
    const { CulqiCheckoutButton } = compileComponent(buttonFilename, buttonSource, specifier => {
      if (specifier === 'react') return { ...React, ...h.api };
      if (specifier === 'next/script') return { __esModule: true, default: Placeholder };
    });
    const instances = []; let submissions = 0; let authentications = 0;
    let release; const gate = new Promise(resolve => { release = resolve; });
    window.CulqiCheckout = class { constructor() { instances.push(this); } open() {} close() {} };
    window.Culqi3DS = {
      publicKey: '', options: {}, settings: {}, reset() {},
      generateDevice: async () => 'device_synthetic',
      initAuthentication: async () => { authentications++; },
    };
    const session = { amountMinor: 6600, checkoutSessionId, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: null };
    const props = { amount: 66, config, customerEmail: '', locale: 'es', disabled: false,
      onError() {}, onPaymentUnresolved() {}, prepareCheckout: async () => session,
      onToken: async () => { submissions++; return submissions === 1 ? gate : 'submitted'; },
    };
    try {
      h.render(CulqiCheckoutButton, props); h.states[0].set(true); h.states[1].set(true);
      h.render(CulqiCheckoutButton, props); await new Promise(resolve => setImmediate(resolve));
      const sdk = instances[0]; sdk.token = { id: 'tkn_test_original123' }; sdk.culqi();
      await new Promise(resolve => setImmediate(resolve));
      if (earlyReview) window.Culqi3DS.options.closeModalAction();
      release('requires_3ds'); await new Promise(resolve => setImmediate(resolve));
      env.dispatch('message', { origin: window.location.origin, data: { parameters3DS: { cavv: 'synthetic' } } });
      await new Promise(resolve => setImmediate(resolve));
      const tree = h.render(CulqiCheckoutButton, props);
      assert.equal(authentications, earlyReview ? 0 : 1);
      assert.equal(submissions, earlyReview ? 1 : 2);
      if (earlyReview) assert.match(text(tree), /resultado del pago necesita revisión/);
      else assert.match(text(tree), /Confirmando el pago/);
      env.dispatch('message', { origin: window.location.origin, data: { parameters3DS: { cavv: 'synthetic' } } });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(submissions, earlyReview ? 1 : 2);
    } finally { h.cleanup(); env.restore(); }
  });
}
