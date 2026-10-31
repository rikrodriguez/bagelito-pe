import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { sourceModule } from '../helpers/load-ts.mjs';
import {
  beginCheckoutPayment, checkoutRecoveryOutcome, CheckoutReviewError,
  clearCheckoutRecovery, markCheckoutPaymentReview, readCheckoutRecovery,
  CHECKOUT_RECOVERY_STORAGE_KEY,
} from '../../src/lib/payments/checkout-recovery.ts';
import { translations, packCopy, flavorCopy } from '../../src/lib/i18n.ts';
import { saveSuccessProof } from '../../src/lib/payments/success-proof.ts';
import { CHECKOUT_LEGAL_VERSION } from '../../src/lib/legal-terms.ts';

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
      useCallback(callback, deps) {
        const index = cursor++;
        const prior = slots[index];
        if (!prior || !equalDeps(prior.deps, deps)) slots[index] = { deps, callback };
        return slots[index].callback;
      },
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
const campaignHooks = sourceModule('src/lib/waitlist/use-campaign-href.ts', { 'next/navigation': { useSearchParams: () => new URLSearchParams() } });
function compileComponent(filename, source, customRequire) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
  componentModule.require = function requireFixtureDependency(specifier) {
    if (specifier === '@/data/flavor-images') return sourceModule('src/data/flavor-images.ts');
    const fixture = customRequire(specifier);
    return fixture === undefined ? Module.prototype.require.call(this, specifier) : fixture;
  };
  componentModule._compile(compiled, filename);
  return componentModule.exports;
}
function Placeholder() { return null; }
function FixtureCheckout() { return null; }
const futureExpiry = () => new Date(Date.now() + 30 * 60_000).toISOString();
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
  globalThis.document = { documentElement: {}, body: { classList: { toggle() {}, remove() {} } },
    visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
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

function flowHarness(paymentConfig = config, locale = 'es') {
  const h = hooks();
  const { ReservationFlow } = compileComponent(flowFilename, flowSource, specifier => {
    if (specifier === 'react') return { ...React, ...h.api };
    if (specifier === 'next/image' || specifier === 'next/link') return { __esModule: true, default: Placeholder };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => Placeholder });
    if (specifier === '@/components/payments/CulqiCheckoutButton') return { CulqiCheckoutButton: FixtureCheckout };
    if (specifier === '@/components/LanguageProvider') return { useLanguage: () => ({ locale, copy: translations[locale] }) };
    if (specifier === '@/components/BatchAvailabilityProvider') return { useBatchAvailability: () => ({ accepting: true, batchName: 'Synthetic', remainingPacks: 10, deliveryDate: null, ordersCloseAt: null }) };
    if (specifier === '@/components/RollingBagel') return { RollingBagel: Placeholder };
    if (specifier === '@/components/ConversionTrustStrip') return { ConversionTrustStrip: Placeholder };
    if (specifier === '@/lib/payments/checkout-recovery') return recoveryModule;
    if (specifier === '@/lib/payments/success-proof') return { saveSuccessProof };
    if (specifier === '@/lib/legal-terms') return { CHECKOUT_LEGAL_VERSION };
    if (specifier === '@/lib/waitlist/use-campaign-href') return campaignHooks;
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
    reviewStage(acceptTerms = true) {
      h.states[0].set(4);
      render();
      if (acceptTerms) {
        const consent = nodes(tree).find(node => node?.type === 'input' && node?.props?.id === 'checkout-terms-consent');
        assert.ok(consent, 'A real, initially unchecked purchase consent must be present.');
        assert.equal(consent.props.checked, false);
        consent.props.onChange({ target: { checked: true } });
        render();
      }
    },
    get tree() { return tree; },
  };
}

function serverFixture(store, { charge = { ok: false, paymentStatus: 'reconciliation_required' }, status = { ok: true, paymentStatus: 'pending', reconciliationRequired: true }, failCharge = false, expiresAt = futureExpiry() } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ url, payload });
    if (url.endsWith('/charge')) {
      assert.equal(readCheckoutRecovery(store)?.orderCode, reference.orderCode, 'recovery must be durable before the charge request');
      if (failCharge) throw new Error('synthetic network failure');
    }
    const result = url === '/api/reservations/culqi' ? { ok: true, orderCode: reference.orderCode, amount: 66, expiresAt }
      : url.endsWith('/order') ? { ok: true, sessionId: 'synthetic-local-payment-session', amount: 6600, expiresAt }
        : url.endsWith('/charge') ? (typeof charge === 'function' ? charge(calls.filter(call => call.url.endsWith('/charge')).length) : charge)
          : status;
    return { ok: result.ok, json: async () => result };
  };
  return calls;
}

const flushCallbacks = () => new Promise(resolve => setImmediate(resolve));

// Both components and their actual callbacks execute with deterministic hooks
// and synthetic SDK, transport and browser dependencies.
async function sdkHarness(props) {
  const h = hooks();
  const { CulqiCheckoutButton } = compileComponent(buttonFilename, buttonSource, specifier => {
    if (specifier === 'react') return { ...React, ...h.api };
    if (specifier === 'next/script') return { __esModule: true, default: Placeholder };
  });
  const instances = [];
  window.CulqiCheckout = class {
    constructor() { instances.push(this); }
    opens = 0; closes = 0;
    open() { this.opens++; } close() { this.closes++; }
  };
  let tree = h.render(CulqiCheckoutButton, props);
  for (const id of ['culqi-custom-checkout', 'culqi-3ds-script']) {
    nodes(tree).find(node => node?.props?.id === id).props.onReady();
  }
  tree = h.render(CulqiCheckoutButton, props);
  await flushCallbacks();
  return {
    sdk: instances[0], instances, cleanup: h.cleanup,
    render: () => h.render(CulqiCheckoutButton, props),
  };
}

function deadlineClock({ wallClock = false } = {}) {
  const previous = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const previousNow = Date.now;
  const startedAt = Date.now();
  const timers = new Map();
  let now = 0; let next = 0;
  if (wallClock) Date.now = () => startedAt + now;
  globalThis.setTimeout = (callback, delay) => {
    const id = ++next;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
  return {
    get pending() { return timers.size; },
    jump(ms) { now += ms; },
    tick(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now) { timers.delete(id); timer.callback(); }
      }
    },
    restore() { Object.assign(globalThis, previous); Date.now = previousNow; },
  };
}

function expiryProps(expiresAt, overrides = {}) {
  return { amount: 66, config, customerEmail: 'qa@example.invalid', locale: 'es', disabled: false,
    onError() {}, onToken: async () => 'submitted',
    prepareCheckout: async () => ({ amountMinor: 6600, checkoutSessionId, orderCode: reference.orderCode,
      sessionId: 'synthetic-expiry-attempt', expiresAt }), ...overrides };
}
const embed = tree => nodes(tree).find(node => node?.props?.id === 'culqi-checkout-container');

test('an overdue preparation response cannot continue when the browser delays its timer', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock({ wallClock: true });
  const calls = serverFixture(store); const fixtureFetch = globalThis.fetch;
  let release; let signal;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    const response = await fixtureFetch(url, init);
    if (url === '/api/reservations/culqi') { signal = init.signal; await gate; }
    return response;
  };
  const flow = flowHarness(); let sdk;
  try {
    flow.reviewStage(); sdk = await sdkHarness(flow.checkout());
    clock.jump(20_000); release(); await flushCallbacks();
    assert.equal(sdk.instances.length, 0, 'Elapsed preparation time must be checked before opening a late SDK');
    assert.ok(button(sdk.render(), 'Reintentar checkout'));
    assert.equal(signal.aborted, true);
    assert.equal(calls.length, 1, 'An overdue reservation must not start session preparation');
    assert.equal(readCheckoutRecovery(store), null);
    assert.equal(clock.pending, 0);
  } finally { sdk?.cleanup(); flow.cleanup(); release(); await flushCallbacks(); clock.restore(); env.restore(); }
});

for (const endpoint of ['reservation', 'order']) {
  for (const phase of ['headers', 'body']) {
    test(`checkout preparation bounds ${endpoint} ${phase}, ignores late results and safely retries the same hold`, async () => {
      const store = storage(); const env = browser(store); const clock = deadlineClock();
      const calls = serverFixture(store); const fixtureFetch = globalThis.fetch;
      const target = endpoint === 'reservation' ? '/api/reservations/culqi' : '/api/payments/culqi/order';
      let releaseReservation; let releaseHeaders; let releaseBody; let signal;
      const reservationGate = new Promise(resolve => { releaseReservation = resolve; });
      const headersGate = new Promise(resolve => { releaseHeaders = resolve; });
      const bodyGate = new Promise(resolve => { releaseBody = resolve; });
      let targetResponse;
      globalThis.fetch = async (url, init) => {
        const response = await fixtureFetch(url, init);
        if (endpoint === 'order' && url === '/api/reservations/culqi') {
          await reservationGate;
          return response;
        }
        if (url !== target) return response;
        targetResponse = response; signal = init.signal;
        await headersGate;
        return phase === 'body' ? { ok: true, json: () => bodyGate } : response;
      };
      const flow = flowHarness(); let sdk;
      try {
        flow.reviewStage(); sdk = await sdkHarness(flow.checkout());
        let elapsed = 0;
        if (endpoint === 'order') {
          clock.tick(12_000); elapsed += 12_000;
          releaseReservation(); await flushCallbacks();
        }
        if (phase === 'body') {
          const headersTime = endpoint === 'order' ? 3_000 : 12_000;
          clock.tick(headersTime); elapsed += headersTime;
          releaseHeaders(); await flushCallbacks();
        }
        clock.tick(19_999 - elapsed); await flushCallbacks();
        assert.equal(button(sdk.render(), 'Reintentar checkout'), undefined);
        clock.tick(1); await flushCallbacks();
        assert.ok(button(sdk.render(), 'Reintentar checkout'), 'Preparation must stop loading at one shared 20-second deadline');
        assert.equal(signal.aborted, true);
        assert.equal(sdk.instances.length, 0);
        assert.equal(clock.pending, 0);
        assert.equal(readCheckoutRecovery(store), null, 'No charge was started');
        const requestsAtDeadline = calls.length;
        releaseHeaders(); releaseBody(await targetResponse.json()); await flushCallbacks();
        assert.equal(calls.length, requestsAtDeadline, 'Late preparation cannot start the next request');
        assert.equal(sdk.instances.length, 0, 'Late preparation cannot open the SDK');
        globalThis.fetch = fixtureFetch;
        button(sdk.render(), 'Reintentar checkout').props.onClick(); await flushCallbacks();
        assert.equal(sdk.instances.length, 1);
        assert.equal(new Set(calls.map(call => call.payload.checkoutSessionId)).size, 1);
        assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 0);
      } finally {
        sdk?.cleanup(); flow.cleanup(); releaseReservation(); releaseHeaders();
        releaseBody({ ok: false }); await flushCallbacks(); clock.restore(); env.restore();
      }
    });
  }
}

for (const locale of ['es', 'en']) {
  test(`idle reservation expiry closes the SDK and removes its payment embed (${locale})`, async () => {
    const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
    let preparations = 0; let submissions = 0; let unresolved = 0;
    const props = expiryProps(new Date(Date.now() + 20_000).toISOString(), {
      locale, onPaymentUnresolved() { unresolved++; }, onToken: async () => { submissions++; return 'submitted'; },
    });
    const prepare = props.prepareCheckout; props.prepareCheckout = () => { preparations++; return prepare(); };
    let sdk;
    try {
      sdk = await sdkHarness(props); const staleCallback = sdk.sdk.culqi;
      assert.ok(embed(sdk.render())); clock.tick(19_999); assert.ok(embed(sdk.render()));
      clock.tick(1); await flushCallbacks(); const tree = sdk.render();
      assert.match(text(tree), locale === 'es' ? /reserva venció/ : /reservation expired/);
      assert.equal(embed(tree), undefined); assert.ok(sdk.sdk.closes >= 1);
      assert.equal(sdk.sdk.culqi, undefined); assert.equal(clock.pending, 0);
      assert.equal(nodes(tree).find(node => node?.type === 'a' && node.props.href === '/reserve')?.props.href, '/reserve');
      sdk.sdk.token = { id: 'ype_test_lateexpiry123' }; staleCallback(); await flushCallbacks();
      assert.equal(submissions, 0); assert.equal(unresolved, 0); assert.equal(preparations, 1);
      assert.equal(button(tree, 'Reintentar checkout'), undefined);
    } finally { sdk?.cleanup(); clock.restore(); env.restore(); }
  });
}

for (const event of ['focus', 'pageshow', 'visibilitychange', 'sdk callback']) {
  test(`reservation expiry is rechecked on ${event} even when its timer was throttled`, async () => {
    const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
    let submissions = 0; let sdk;
    try {
      sdk = await sdkHarness(expiryProps(new Date(Date.now() + 20_000).toISOString(), {
        onToken: async () => { submissions++; return 'submitted'; },
      }));
      const stale = sdk.sdk.culqi; clock.jump(20_000);
      if (event === 'sdk callback') { sdk.sdk.token = { id: 'ype_test_throttled123' }; stale(); }
      else env.dispatch(event, {});
      await flushCallbacks(); const tree = sdk.render();
      assert.match(text(tree), /reserva venció/); assert.equal(embed(tree), undefined);
      assert.equal(submissions, 0); assert.equal(clock.pending, 0);
    } finally { sdk?.cleanup(); clock.restore(); env.restore(); }
  });
}

for (const locale of ['es', 'en']) {
  test(`retry after a pre-charge SDK error rechecks a throttled reservation deadline before preparation (${locale})`, async () => {
    const store = storage(); const env = browser(store); const clock = deadlineClock({ wallClock: true });
    const calls = serverFixture(store, { expiresAt: new Date(Date.now() + 20_000).toISOString() });
    const flow = flowHarness(config, locale); let sdk;
    try {
      flow.reviewStage(); sdk = await sdkHarness(flow.checkout());
      const staleSdkCallback = sdk.sdk.culqi;
      sdk.sdk.error = { user_message: 'Synthetic pre-charge SDK error' };
      sdk.sdk.culqi(); await flushCallbacks();
      const retry = button(sdk.render(), locale === 'es' ? 'Reintentar checkout' : 'Retry secure checkout');
      assert.ok(retry, 'A pre-charge error must remain retryable before expiry');
      assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
      assert.equal(calls.filter(call => call.url.endsWith('/order')).length, 1);
      clock.jump(20_000); // Do not deliver timer/focus/visibility events before clicking.
      retry.props.onClick(); await flushCallbacks();
      const tree = sdk.render();
      assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1,
        'Retrying an expired reservation must not prepare/reserve it again');
      assert.equal(calls.filter(call => call.url.endsWith('/order')).length, 1);
      assert.match(text(tree), locale === 'es' ? /reserva venció/ : /reservation expired/);
      assert.equal(embed(tree), undefined); assert.equal(clock.pending, 0);
      assert.equal(sdk.sdk.culqi, undefined); assert.ok(sdk.sdk.closes >= 1);
      assert.equal(sdk.instances.length, 1);
      assert.equal(button(tree, locale === 'es' ? 'Reintentar checkout' : 'Retry secure checkout'), undefined);
      assert.equal(nodes(tree).find(node => node?.type === 'a' && node.props.href === '/reserve')?.props.href, '/reserve');
      retry.props.onClick();
      sdk.sdk.token = { id: 'ype_test_syntheticExpiredRetry' }; staleSdkCallback(); await flushCallbacks();
      assert.equal(calls.length, 2, 'Stale retry/token handlers cannot make reservation, preparation, charge or status requests');
      assert.equal(readCheckoutRecovery(store), null, 'No unsubmitted payment may acquire an uncertain-payment recovery lock');
    } finally { sdk?.cleanup(); flow.cleanup(); clock.restore(); env.restore(); }
  });
}

test('retry before expiry preserves the same hold and still expires at its original deadline', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock({ wallClock: true });
  const calls = serverFixture(store, { expiresAt: new Date(Date.now() + 20_000).toISOString() });
  const flow = flowHarness(); let sdk;
  try {
    flow.reviewStage(); sdk = await sdkHarness(flow.checkout());
    sdk.sdk.error = { user_message: 'Synthetic pre-charge SDK error' };
    sdk.sdk.culqi(); await flushCallbacks();
    const retry = button(sdk.render(), 'Reintentar checkout'); assert.ok(retry);
    clock.jump(19_999); retry.props.onClick(); await flushCallbacks();
    assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 2);
    assert.equal(calls.filter(call => call.url.endsWith('/order')).length, 2);
    assert.equal(new Set(calls.map(call => call.payload.checkoutSessionId)).size, 1,
      'A safe pre-expiry retry must reuse the existing checkout capability, not create another hold');
    assert.equal(sdk.instances.length, 2); assert.ok(embed(sdk.render()));
    clock.tick(1); await flushCallbacks();
    assert.match(text(sdk.render()), /reserva venció/);
    assert.equal(embed(sdk.render()), undefined); assert.equal(clock.pending, 0);
    assert.equal(sdk.instances[1].culqi, undefined);
    assert.equal(calls.length, 4); assert.equal(readCheckoutRecovery(store), null);
  } finally { sdk?.cleanup(); flow.cleanup(); clock.restore(); env.restore(); }
});

for (const expiry of ['past', 'missing', 'malformed']) {
  test(`${expiry} session expiry cannot open the SDK or accept a payment`, async () => {
    const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
    let sdk;
    try {
      const expiresAt = expiry === 'past' ? new Date(Date.now() - 1).toISOString()
        : expiry === 'missing' ? null : 'not-a-date';
      sdk = await sdkHarness(expiryProps(expiresAt));
      assert.equal(sdk.instances.length, 0); assert.equal(clock.pending, 0);
      if (expiry === 'past') assert.match(text(sdk.render()), /reserva venció/);
    } finally { sdk?.cleanup(); clock.restore(); env.restore(); }
  });
}

test('expiry during device collection prevents the later source from reaching charge submission', async () => {
  const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
  let release; const device = new Promise(resolve => { release = resolve; });
  let submissions = 0; let sdk;
  window.Culqi3DS = { publicKey: '', options: {}, generateDevice: () => device, reset() {} };
  try {
    sdk = await sdkHarness(expiryProps(new Date(Date.now() + 20_000).toISOString(), {
      onToken: async () => { submissions++; return 'submitted'; },
    }));
    sdk.sdk.token = { id: 'tkn_test_expirydevice123' }; sdk.sdk.culqi(); await flushCallbacks();
    clock.tick(20_000); release('device_synthetic'); await flushCallbacks();
    assert.equal(submissions, 0); assert.match(text(sdk.render()), /reserva venció/);
    assert.equal(embed(sdk.render()), undefined); assert.equal(clock.pending, 0);
  } finally { release('device_synthetic'); await flushCallbacks(); sdk?.cleanup(); clock.restore(); env.restore(); }
});

for (const lateResult of ['paid', 'requires_3ds', 'rejection']) {
  test(`expiry during a pending charge preserves recovery despite late ${lateResult}`, async () => {
    const store = storage(); const env = browser(store); const clock = deadlineClock({ wallClock: true });
    const calls = serverFixture(store, { expiresAt: new Date(Date.now() + 20_000).toISOString() });
    const fixtureFetch = globalThis.fetch; let release; let reject;
    const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
    globalThis.fetch = async (url, init) => {
      if (!url.endsWith('/charge')) return fixtureFetch(url, init);
      calls.push({ url, payload: JSON.parse(init.body) }); return gate;
    };
    let authentications = 0;
    window.Culqi3DS = { publicKey: '', options: {}, settings: {}, reset() {},
      generateDevice: async () => 'device_synthetic', initAuthentication: async () => { authentications++; } };
    const flow = flowHarness(); let sdk;
    try {
      flow.reviewStage(); sdk = await sdkHarness(flow.checkout());
      sdk.sdk.token = { id: 'tkn_test_expirycharge123' }; sdk.sdk.culqi(); await flushCallbacks();
      assert.deepEqual(readCheckoutRecovery(store), reference);
      clock.tick(20_000); await flushCallbacks(); flow.render();
      assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
      assert.match(text(sdk.render()), /resultado del pago necesita revisión/);
      assert.equal(embed(sdk.render()), undefined);
      if (lateResult === 'rejection') reject(new Error('synthetic late failure'));
      else release({ ok: true, json: async () => ({ ok: true, paymentStatus: 'paid', requires3DS: lateResult === 'requires_3ds' }) });
      await flushCallbacks(); flow.render();
      assert.equal(authentications, 0); assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
      assert.equal(calls.filter(c => c.url.endsWith('/charge')).length, 1);
      assert.equal(calls.filter(c => c.url.endsWith('/status')).length, 0);
      assert.equal(window.location.href, 'https://fixture.invalid/checkout');
    } finally {
      release({ ok: false, json: async () => ({ ok: false }) }); await flushCallbacks();
      sdk?.cleanup(); flow.cleanup(); clock.restore(); env.restore();
    }
  });
}

test('expired 3DS cannot continue charging or offer a fresh reservation while payment is unresolved', async () => {
  const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
  let submissions = 0; let unresolved = 0; let sdk;
  window.Culqi3DS = { publicKey: '', options: {}, settings: {}, reset() {},
    generateDevice: async () => 'device_synthetic', initAuthentication: async () => {} };
  try {
    sdk = await sdkHarness(expiryProps(new Date(Date.now() + 20_000).toISOString(), {
      onToken: async () => { submissions++; return 'requires_3ds'; }, onPaymentUnresolved() { unresolved++; },
    }));
    sdk.sdk.token = { id: 'tkn_test_expiry3ds123' }; sdk.sdk.culqi(); await flushCallbacks();
    clock.jump(20_000);
    env.dispatch('message', { origin: window.location.origin, data: { parameters3DS: { cavv: 'synthetic' } } });
    await flushCallbacks(); const tree = sdk.render();
    assert.equal(submissions, 1); assert.equal(unresolved, 1); assert.equal(embed(tree), undefined);
    assert.match(text(tree), /resultado del pago necesita revisión/);
    assert.equal(nodes(tree).some(node => node?.type === 'a' && node.props.href === '/reserve'), false);
    assert.equal(clock.pending, 0);
  } finally { sdk?.cleanup(); clock.restore(); env.restore(); }
});

test('unmount clears the reservation timer and ignores foreground events', async () => {
  const env = browser(storage()); const clock = deadlineClock({ wallClock: true });
  let sdk; let errors = 0;
  try {
    sdk = await sdkHarness(expiryProps(new Date(Date.now() + 20_000).toISOString(), { onError() { errors++; } }));
    sdk.cleanup(); const previousErrors = errors;
    assert.equal(clock.pending, 0); clock.tick(20_000); env.dispatch('focus', {}); await flushCallbacks();
    assert.equal(errors, previousErrors);
  } finally { sdk?.cleanup(); clock.restore(); env.restore(); }
});

test('SDK token automatically reserves, charges once, verifies paid and redirects without a status button', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock();
  const calls = serverFixture(store, { charge: { ok: true, paymentStatus: 'paid' } });
  const fixtureFetch = globalThis.fetch;
  let releaseStatus;
  const statusGate = new Promise(resolve => { releaseStatus = resolve; });
  globalThis.fetch = async (url, init) => {
    if (!url.endsWith('/status')) return fixtureFetch(url, init);
    calls.push({ url, payload: JSON.parse(init.body) });
    const result = calls.filter(call => call.url.endsWith('/status')).length === 1
      ? await statusGate : { ok: true, paymentStatus: 'paid', reconciliationRequired: false };
    return { ok: true, json: async () => result };
  };
  const flow = flowHarness(); let sdkFlow;
  try {
    flow.reviewStage(); sdkFlow = await sdkHarness(flow.checkout());
    assert.ok(sdkFlow.sdk?.culqi);
    sdkFlow.sdk.token = { id: 'ype_test_automatic123' };
    sdkFlow.sdk.culqi();
    await flushCallbacks();
    assert.deepEqual(calls.map(call => call.url), [
      '/api/reservations/culqi', '/api/payments/culqi/order',
      '/api/payments/culqi/charge', '/api/payments/culqi/status',
    ]);
    assert.equal(readCheckoutRecovery(store).state, 'pending');
    assert.equal(calls.find(call => call.url.endsWith('/charge')).payload.checkoutSessionId, checkoutSessionId,
      'initial Yape charge must carry the checkout ownership capability');
    assert.equal(calls.find(call => call.url.endsWith('/order')).payload.checkoutSessionId, checkoutSessionId,
      'token-session preparation must carry the same capability as reservation and charge');
    assert.equal(window.location.href, 'https://fixture.invalid/checkout', 'charge response cannot establish paid');
    releaseStatus({ ok: true, paymentStatus: 'pending', reconciliationRequired: false });
    await flushCallbacks();
    const destination = new URL(window.location.href, 'https://fixture.invalid');
    assert.equal(destination.pathname, '/reserve/success');
    assert.equal(destination.searchParams.get('order'), reference.orderCode);
    assert.equal(destination.searchParams.get('payment'), 'paid');
    assert.equal(readCheckoutRecovery(store), null);
    assert.equal(clock.pending, 0, 'successful charge must clear its deadline');
    for (const lookup of calls.filter(call => call.url.endsWith('/status'))) {
      assert.deepEqual(lookup.payload, { checkoutSessionId, orderCode: reference.orderCode });
    }
    sdkFlow.sdk.culqi(); await flushCallbacks();
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
  } finally { releaseStatus({ ok: true, paymentStatus: 'pending', reconciliationRequired: false }); sdkFlow?.cleanup(); flow.cleanup(); clock.restore(); env.restore(); }
});

for (const mode of ['automatic', 'manual']) {
  for (const stage of ['fetch', 'body']) {
    test(`${mode} status ${stage} timeout preserves recovery and ignores a late paid result`, async () => {
      const store = storage();
      if (mode === 'manual') beginCheckoutPayment(store, reference);
      const env = browser(store); const clock = deadlineClock();
      const calls = serverFixture(store, {
        charge: { ok: true }, status: { ok: true, paymentStatus: 'paid', reconciliationRequired: false },
      });
      const fixtureFetch = globalThis.fetch;
      let release; let releaseHeaders; let signal;
      const gate = new Promise(resolve => { release = resolve; });
      const headers = new Promise(resolve => { releaseHeaders = resolve; });
      globalThis.fetch = async (url, init) => {
        if (!url.endsWith('/status')) return fixtureFetch(url, init);
        assert.equal(url, '/api/payments/culqi/status');
        calls.push({ url, payload: JSON.parse(init.body) }); signal = init.signal;
        // Headers or body may ignore cancellation, as with a broken transport.
        return stage === 'fetch' ? gate : headers;
      };
      const flow = flowHarness(); let submission; let outcome = 'pending';
      try {
        if (mode === 'automatic') {
          flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
          submission = checkout.onToken(session, 'ype_test_statusdeadline123', {}).then(
            () => { outcome = 'submitted'; },
            error => { assert.ok(error instanceof CheckoutReviewError); outcome = 'review'; },
          );
        } else button(flow.tree, 'Consultar estado').props.onClick();
        await flushCallbacks(); flow.render();
        if (stage === 'body') {
          clock.tick(12_000);
          releaseHeaders({ ok: true, json: () => gate }); await flushCallbacks();
          clock.tick(7_999);
        } else clock.tick(19_999);
        await flushCallbacks();
        assert.equal(signal.aborted, false);
        if (mode === 'automatic') assert.equal(outcome, 'pending');
        else assert.equal(button(flow.tree, 'Consultando').props.disabled, true);
        clock.tick(1); await flushCallbacks(); flow.render();
        assert.equal(signal.aborted, true, 'status headers and body have a finite 20-second deadline');
        assert.equal(clock.pending, 0);
        if (mode === 'automatic') {
          assert.equal(outcome, 'review');
          assert.match(text(flow.tree), /Tu pago necesita revisión/);
        } else {
          assert.equal(button(flow.tree, 'Consultar estado').props.disabled, false);
          assert.match(text(flow.tree), /No pudimos consultar el estado/);
        }
        const retained = { ...reference, state: mode === 'automatic' ? 'review' : 'pending' };
        assert.deepEqual(readCheckoutRecovery(store), retained);
        assert.equal(flow.checkout(), undefined);
        assert.equal(button(flow.tree, 'Crear nuevo pedido'), undefined);

        const paid = { ok: true, paymentStatus: 'paid', reconciliationRequired: false };
        release(stage === 'fetch' ? { ok: true, json: async () => paid } : paid);
        await flushCallbacks(); flow.render();
        assert.deepEqual(readCheckoutRecovery(store), retained, 'a response after the deadline cannot clear the lock');
        assert.equal(window.location.href, 'https://fixture.invalid/checkout');

        globalThis.fetch = fixtureFetch;
        button(flow.tree, 'Consultar estado').props.onClick(); await flushCallbacks(); flow.render();
        assert.equal(readCheckoutRecovery(store), null);
        assert.match(text(flow.tree), /Pago confirmado/);
        assert.equal(flow.checkout(), undefined);
        assert.ok(calls.filter(call => call.url.endsWith('/status')).every(call =>
          call.payload.checkoutSessionId === checkoutSessionId && call.payload.orderCode === reference.orderCode));
        assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, mode === 'automatic' ? 1 : 0);
        assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, mode === 'automatic' ? 1 : 0);
        assert.equal(clock.pending, 0);
      } finally {
        releaseHeaders({ ok: false, json: () => gate });
        release(stage === 'fetch' ? { ok: false, json: async () => ({ ok: false }) } : { ok: false });
        await submission; await flushCallbacks(); flow.cleanup(); clock.restore(); env.restore();
      }
    });
  }
}

test('automatic status reads share the existing 60-second budget across successful pending responses', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock({ wallClock: true });
  const calls = serverFixture(store, { charge: { ok: true } }); const fixtureFetch = globalThis.fetch;
  const reads = [];
  globalThis.fetch = async (url, init) => {
    if (!url.endsWith('/status')) return fixtureFetch(url, init);
    calls.push({ url, payload: JSON.parse(init.body) });
    return new Promise((resolve, reject) => reads.push({ resolve, reject, signal: init.signal }));
  };
  const flow = flowHarness(); let submission; let outcome = 'pending';
  try {
    flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
    submission = checkout.onToken(session, 'ype_test_statusbudget123', {}).then(
      () => { outcome = 'submitted'; }, error => { assert.ok(error instanceof CheckoutReviewError); outcome = 'review'; },
    );
    await flushCallbacks();
    for (let i = 0; i < 3; i++) {
      assert.equal(reads.length, i + 1);
      clock.tick(19_000);
      reads[i].resolve({ ok: true, json: async () => ({ ok: true, paymentStatus: 'pending', reconciliationRequired: false }) });
      await flushCallbacks();
      assert.equal(reads[i].signal.aborted, false);
    }
    assert.equal(reads.length, 4);
    clock.tick(2_999); await flushCallbacks(); assert.equal(outcome, 'pending');
    clock.tick(1); await flushCallbacks(); flow.render();
    assert.equal(outcome, 'review');
    assert.equal(reads[3].signal.aborted, true);
    assert.equal(clock.pending, 0);
    assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
    reads[3].resolve({ ok: true, json: async () => ({ ok: true, paymentStatus: 'paid', reconciliationRequired: false }) });
    await flushCallbacks();
    assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(window.location.href, 'https://fixture.invalid/checkout');
  } finally {
    reads.forEach(read => read.reject(new Error('synthetic cleanup')));
    await submission; flow.cleanup(); clock.restore(); env.restore();
  }
});

for (const mode of ['automatic', 'manual']) {
  for (const fault of ['transport', 'invalid JSON', 'HTTP 429', 'HTTP 503', 'null JSON', 'untyped paid']) {
    test(`${mode} status ${fault} cannot unlock or replace the pending checkout`, async () => {
      const store = storage();
      if (mode === 'manual') beginCheckoutPayment(store, reference);
      const env = browser(store); const clock = deadlineClock();
      const calls = serverFixture(store, { charge: { ok: true } }); const fixtureFetch = globalThis.fetch;
      const marker = 'synthetic-private-provider-error';
      globalThis.fetch = async (url, init) => {
        if (!url.endsWith('/status')) return fixtureFetch(url, init);
        assert.equal(url, '/api/payments/culqi/status');
        calls.push({ url, payload: JSON.parse(init.body) });
        if (fault === 'transport') throw new Error(marker);
        return { ok: !fault.startsWith('HTTP'), json: async () => {
          if (fault === 'invalid JSON') throw new SyntaxError(marker);
          if (fault === 'null JSON') return null;
          return { ok: fault === 'untyped paid' ? 'true' : true, paymentStatus: 'paid', reconciliationRequired: false };
        } };
      };
      const flow = flowHarness(); let restored;
      try {
        if (mode === 'automatic') {
          flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
          await checkout.onToken(session, 'ype_test_statusfault123', {}).catch(error => {
            assert.ok(error instanceof CheckoutReviewError);
          });
        } else { button(flow.tree, 'Consultar estado').props.onClick(); await flushCallbacks(); }
        flow.render();
        const retained = readCheckoutRecovery(store);
        assert.equal(retained.orderCode, reference.orderCode);
        assert.equal(retained.checkoutSessionId, checkoutSessionId);
        assert.equal(flow.checkout(), undefined);
        assert.equal(button(flow.tree, 'Crear nuevo pedido'), undefined);
        assert.equal(window.location.href, 'https://fixture.invalid/checkout');
        assert.doesNotMatch(text(flow.tree), new RegExp(marker));
        assert.equal(clock.pending, 0, 'failed reads release their timers');
        restored = flowHarness();
        assert.equal(restored.checkout(), undefined);
        assert.match(text(restored.tree), /BAG-TEST-1/);
        assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, mode === 'automatic' ? 1 : 0);
        assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, mode === 'automatic' ? 1 : 0);
        assert.ok(calls.filter(call => call.url.endsWith('/status')).length <= (mode === 'automatic' ? 6 : 1));
      } finally { restored?.cleanup(); flow.cleanup(); clock.restore(); env.restore(); }
    });
  }
}

for (const stage of ['fetch', 'body']) {
  for (const lateResult of ['paid', 'requires_3ds', 'rejection']) {
    test(`charge ${stage} timeout keeps the same order locked despite late ${lateResult}`, async () => {
      const store = storage(); const env = browser(store); const clock = deadlineClock();
      const calls = serverFixture(store);
      const fixtureFetch = globalThis.fetch;
      let release; let reject; let signal;
      const gate = new Promise((resolve, rejectGate) => { release = resolve; reject = rejectGate; });
      globalThis.fetch = async (url, init) => {
        if (!url.endsWith('/charge')) return fixtureFetch(url, init);
        calls.push({ url, payload: JSON.parse(init.body) });
        assert.deepEqual(readCheckoutRecovery(store), reference);
        signal = init.signal;
        // Deliberately ignore AbortSignal, including the response body.
        return stage === 'fetch' ? gate : { ok: true, json: () => gate };
      };
      const flow = flowHarness(); let restored; let submission;
      try {
        flow.reviewStage(); const checkout = flow.checkout(); const session = await checkout.prepareCheckout();
        let outcome = 'pending';
        submission = checkout.onToken(session, 'ype_test_timeout123', {}).then(
          () => { outcome = 'submitted'; },
          error => { assert.ok(error instanceof CheckoutReviewError); outcome = 'review'; },
        );
        await flushCallbacks();
        clock.tick(29_999); await flushCallbacks();
        assert.equal(outcome, 'pending');
        clock.tick(1); await flushCallbacks();
        assert.equal(outcome, 'review', 'uncertain charge must stop waiting within 30 seconds');
        await submission; flow.render();
        assert.equal(signal.aborted, true);
        assert.equal(clock.pending, 0);
        assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
        assert.match(text(flow.tree), /Tu pago necesita revisión/);
        assert.equal(flow.checkout(), undefined);
        assert.equal(button(flow.tree, 'Crear nuevo pedido'), undefined);
        assert.equal(window.location.href, 'https://fixture.invalid/checkout');

        restored = flowHarness();
        assert.equal(restored.checkout(), undefined);
        assert.match(text(restored.tree), /BAG-TEST-1/);
        await assert.rejects(() => checkout.prepareCheckout(), CheckoutReviewError);
        await assert.rejects(() => checkout.onToken(session, 'ype_test_another123', {}), CheckoutReviewError);

        const result = { ok: true, paymentStatus: 'paid', requires3DS: lateResult === 'requires_3ds' };
        if (lateResult === 'rejection') reject(new Error('synthetic late transport error'));
        else release(stage === 'fetch' ? { ok: true, json: async () => result } : result);
        await flushCallbacks(); flow.render(); restored.render();
        assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
        assert.equal(window.location.href, 'https://fixture.invalid/checkout');
        await assert.rejects(() => checkout.onToken(session, 'ype_test_timeout123', {
          authentication3DS: { cavv: 'synthetic' },
        }), CheckoutReviewError);
        assert.equal(calls.filter(call => call.url.endsWith('/status')).length, 0, 'late charge cannot start automatic confirmation');
        assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
        assert.equal(calls.filter(call => call.url.endsWith('/order')).length, 1);
        assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
        assert.equal(env.uuidCalls, 1);
      } finally {
        release(stage === 'fetch' ? { ok: false, json: async () => ({ ok: false }) } : { ok: false });
        await submission; restored?.cleanup(); flow.cleanup(); clock.restore(); env.restore();
      }
    });
  }
}

for (const completion of ['timeout', 'requires_3ds']) {
  test(`an obsolete charge ${completion} cannot mark another pending order for review or start 3DS`, async () => {
    const store = storage(); const env = browser(store); const clock = deadlineClock();
    const calls = serverFixture(store);
    const fixtureFetch = globalThis.fetch;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    globalThis.fetch = async (url, init) => {
      if (!url.endsWith('/charge')) return fixtureFetch(url, init);
      calls.push({ url, payload: JSON.parse(init.body) });
      return gate;
    };
    let authentications = 0;
    window.Culqi3DS = {
      publicKey: '', options: {}, settings: {}, reset() {},
      generateDevice: async () => 'device_synthetic',
      initAuthentication: async () => { authentications++; },
    };
    const flow = flowHarness(); let sdkFlow;
    const replacement = {
      ...reference, checkoutSessionId: '00000000-0000-4000-8000-000000000002',
      orderCode: 'BAG-TEST-2', state: 'pending',
    };
    try {
      flow.reviewStage(); sdkFlow = await sdkHarness(flow.checkout());
      sdkFlow.sdk.token = { id: 'tkn_test_obsolete123' }; sdkFlow.sdk.culqi();
      await flushCallbacks();
      store.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify(replacement));
      env.dispatch('storage', { key: CHECKOUT_RECOVERY_STORAGE_KEY });
      if (completion === 'timeout') clock.tick(30_000);
      else release({ ok: true, json: async () => ({ ok: true, requires3DS: true }) });
      await flushCallbacks(); flow.render();
      assert.deepEqual(readCheckoutRecovery(store), replacement, 'a stale charge must leave the current order unchanged');
      assert.equal(authentications, 0, 'an obsolete source cannot start bank authentication');
      assert.match(text(sdkFlow.render()), /resultado del pago necesita revisión/);
      assert.equal(button(sdkFlow.render(), 'Reintentar checkout'), undefined);
      assert.equal(window.location.href, 'https://fixture.invalid/checkout');
      assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
      assert.equal(calls.filter(call => call.url.endsWith('/status')).length, 0);
    } finally {
      release({ ok: false, json: async () => ({ ok: false }) }); await flushCallbacks();
      sdkFlow?.cleanup(); flow.cleanup(); clock.restore(); env.restore();
    }
  });
}

test('SDK charge headers and JSON share one deadline; reload checks the same uncertain order without a new charge', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock();
  const calls = serverFixture(store, {
    status: { ok: true, paymentStatus: 'paid', reconciliationRequired: false },
  });
  const fixtureFetch = globalThis.fetch;
  let releaseHeaders; let releaseBody; let signal;
  const headersGate = new Promise(resolve => { releaseHeaders = resolve; });
  const bodyGate = new Promise(resolve => { releaseBody = resolve; });
  globalThis.fetch = async (url, init) => {
    if (!url.endsWith('/charge')) return fixtureFetch(url, init);
    calls.push({ url, payload: JSON.parse(init.body) }); signal = init.signal;
    return headersGate;
  };
  const flow = flowHarness(); let sdkFlow; let restored;
  try {
    flow.reviewStage(); sdkFlow = await sdkHarness(flow.checkout());
    sdkFlow.sdk.token = { id: 'ype_test_shareddeadline123' }; sdkFlow.sdk.culqi();
    await flushCallbacks(); clock.tick(20_000);
    releaseHeaders({ ok: true, json: () => bodyGate }); await flushCallbacks();
    clock.tick(9_999); await flushCallbacks(); flow.render();
    assert.deepEqual(readCheckoutRecovery(store), reference);
    clock.tick(1); await flushCallbacks(); flow.render();
    assert.equal(signal.aborted, true);
    assert.equal(clock.pending, 0);
    assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
    assert.match(text(sdkFlow.render()), /resultado del pago necesita revisión/);
    assert.equal(button(sdkFlow.render(), 'Reintentar checkout'), undefined);
    assert.equal(flow.checkout(), undefined);
    assert.equal(calls.filter(call => call.url.endsWith('/status')).length, 0);
    sdkFlow.sdk.culqi(); await flushCallbacks();
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);

    restored = flowHarness();
    assert.equal(restored.checkout(), undefined);
    button(restored.tree, 'Consultar estado').props.onClick(); await flushCallbacks(); restored.render();
    assert.match(text(restored.tree), /Pago confirmado/);
    assert.equal(readCheckoutRecovery(store), null);
    assert.deepEqual(calls.filter(call => call.url.endsWith('/status')).at(-1).payload, {
      checkoutSessionId, orderCode: reference.orderCode,
    });
    releaseBody({ ok: true, requires3DS: true }); await flushCallbacks();
    assert.equal(window.location.href, 'https://fixture.invalid/checkout', 'late charge response cannot redirect after recovery');
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
  } finally {
    releaseHeaders({ ok: false, json: async () => ({ ok: false }) }); releaseBody({ ok: false });
    await flushCallbacks(); restored?.cleanup(); sdkFlow?.cleanup(); flow.cleanup(); clock.restore(); env.restore();
  }
});

test('timeout during the real SDK 3DS continuation locks the same source and never sends a third charge', async () => {
  const store = storage(); const env = browser(store); const clock = deadlineClock();
  const calls = serverFixture(store, { charge: { ok: true, requires3DS: true } });
  const fixtureFetch = globalThis.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    if (!url.endsWith('/charge') || !JSON.parse(init.body).authentication3DS) return fixtureFetch(url, init);
    calls.push({ url, payload: JSON.parse(init.body) });
    return gate;
  };
  let authentications = 0;
  window.Culqi3DS = {
    publicKey: '', options: {}, settings: {}, reset() {},
    generateDevice: async () => 'device_synthetic',
    initAuthentication: async () => { authentications++; },
  };
  const flow = flowHarness(); let sdkFlow;
  const message = {
    origin: window.location.origin,
    data: { parameters3DS: { cavv: 'synthetic', eci: 'synthetic', xid: 'synthetic', protocolVersion: 'synthetic' } },
  };
  try {
    flow.reviewStage(); sdkFlow = await sdkHarness(flow.checkout());
    sdkFlow.sdk.token = { id: 'tkn_test_continuation123' }; sdkFlow.sdk.culqi(); await flushCallbacks();
    assert.equal(authentications, 1);
    assert.equal(clock.pending, 1, 'the initial charge deadline clears while the reservation expiry remains watched');
    env.dispatch('message', message); await flushCallbacks();
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 2);
    clock.tick(30_000); await flushCallbacks(); flow.render();
    assert.equal(clock.pending, 0);
    assert.deepEqual(readCheckoutRecovery(store), { ...reference, state: 'review' });
    assert.match(text(sdkFlow.render()), /resultado del pago necesita revisión/);
    assert.equal(button(sdkFlow.render(), 'Reintentar checkout'), undefined);
    assert.equal(flow.checkout(), undefined);
    env.dispatch('message', message); sdkFlow.sdk.culqi(); await flushCallbacks();
    release({ ok: true, json: async () => ({ ok: true }) }); await flushCallbacks();
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 2);
    assert.equal(calls.filter(call => call.url.endsWith('/status')).length, 0);
    for (const charge of calls.filter(call => call.url.endsWith('/charge'))) {
      assert.equal(charge.payload.checkoutSessionId, checkoutSessionId,
        'initial card and 3DS continuation must keep the same checkout capability');
      assert.equal(charge.payload.orderCode, reference.orderCode);
      assert.equal(charge.payload.sourceId, 'tkn_test_continuation123');
      assert.equal(charge.payload.deviceId, 'device_synthetic');
    }
    assert.equal(window.location.href, 'https://fixture.invalid/checkout');
    assert.equal(calls.filter(call => call.url === '/api/reservations/culqi').length, 1);
    assert.doesNotMatch(store.getItem(CHECKOUT_RECOVERY_STORAGE_KEY), /tkn_test|cavv|eci|device|protocolVersion/);
  } finally {
    release({ ok: false, json: async () => ({ ok: false }) }); await flushCallbacks();
    sdkFlow?.cleanup(); flow.cleanup(); clock.restore(); env.restore();
  }
});

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
    assert.equal(calls.find(call => call.url.endsWith('/order')).payload.checkoutSessionId, session.checkoutSessionId);
    assert.equal(await checkout.onToken(session, 'tkn_test_original123', {}), 'requires_3ds');
    await assert.rejects(() => checkout.onToken(session, 'tkn_test_newtoken123', security), CheckoutReviewError);
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
    assert.equal(await checkout.onToken(session, 'tkn_test_original123', security), 'submitted');
    assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 2);
    for (const charge of calls.filter(call => call.url.endsWith('/charge'))) {
      assert.equal(charge.payload.checkoutSessionId, session.checkoutSessionId);
      assert.notEqual(charge.payload.checkoutSessionId, session.sessionId,
        'payment attempt ID must not substitute for checkout ownership');
    }
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
    prepareCheckout: async () => { preparations++; return { amountMinor: 6600, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: futureExpiry() }; },
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
    const session = { amountMinor: 6600, checkoutSessionId, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: futureExpiry() };
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
    const session = { amountMinor: 6600, checkoutSessionId, orderCode: reference.orderCode, sessionId: 'synthetic', expiresAt: futureExpiry() };
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


test('Culqi payment cannot open without independent affirmative terms consent', () => {
  const store = storage();
  const env = browser(store);
  const flow = flowHarness();
  try {
    flow.reviewStage(false);
    const controls = nodes(flow.tree);
    const consent = controls.find(node => node?.type === 'input' && node?.props?.id === 'checkout-terms-consent');
    assert.ok(consent);
    assert.equal(consent.props.checked, false, 'No default/implicit legal consent allowed');
    assert.equal(flow.checkout().disabled, true, 'Culqi must be disabled before acceptance');
    consent.props.onChange({ target: { checked: true } });
    flow.render();
    assert.equal(flow.checkout().disabled, false, 'Explicit acceptance unlocks the checkout');
    const updated = nodes(flow.tree).find(node => node?.type === 'input' && node?.props?.id === 'checkout-terms-consent');
    assert.equal(updated.props.checked, true);
  } finally { flow.cleanup(); env.restore(); }
});
