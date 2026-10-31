import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { sourceModule } from './helpers/load-ts.mjs';

const { packs } = sourceModule('src/data/packs.ts');
const { flavors } = sourceModule('src/data/flavors.ts');
const i18n = sourceModule('src/lib/i18n.ts');
const recoveryModule = sourceModule('src/lib/payments/checkout-recovery.ts');
const { CHECKOUT_LEGAL_VERSION } = sourceModule('src/lib/legal-terms.ts');
const Empty = () => null;
const Checkout = () => null;
const config = { enabled: true, mode: 'sandbox', provider: 'culqi', currency: 'PEN', publicKey: 'pk_test_fixture', rsaId: 'fixture', rsaPublicKey: 'fixture' };

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return React.isValidElement(node) ? text(node.props.children) : String(node ?? '');
}

for (const [filename, flowImport] of [
  ['src/app/checkout/page.tsx', '@/app/reserve/ReservationFlow'],
  ['src/app/reserve/page.tsx', './ReservationFlow'],
]) {
  test(`${filename}: query navigation retains the checkout identity`, async () => {
    const Page = sourceModule(filename, {
      '@/components/Header': { Header: Empty }, '@/components/Footer': { Footer: Empty },
      '@/lib/payments': { getPublicPaymentConfig: () => config },
      [flowImport]: { ReservationFlow: Checkout },
    }).default;
    const first = nodes(await Page({ searchParams: Promise.resolve({ pack: '6-single', flavor: 'plain' }) })).find(node => node.type === Checkout);
    const next = nodes(await Page({ searchParams: Promise.resolve({ pack: '12-single', flavor: 'cheddar' }) })).find(node => node.type === Checkout);
    assert.ok(first && next);
    assert.equal(next.key, first.key, 'a URL selection must not remount an in-flight checkout');
    assert.equal(next.props.initialPackSlug, '12-single');
    assert.equal(next.props.initialFlavorSlug, 'cheddar');
  });
}

function hooks() {
  const slots = [], states = [], effects = [];
  let cursor = 0, dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  return {
    states,
    api: {
      useState(initial) {
        const index = cursor++;
        if (!slots[index]) { slots[index] = { value: typeof initial === 'function' ? initial() : initial }; states.push(slots[index]); }
        const slot = slots[index];
        slot.set = update => { const next = typeof update === 'function' ? update(slot.value) : update; dirty ||= !Object.is(next, slot.value); slot.value = next; };
        return [slot.value, slot.set];
      },
      useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
      useMemo(factory) { cursor++; return factory(); },
      useCallback(callback, deps) {
        const index = cursor++;
        if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, callback };
        return slots[index].callback;
      },
      useEffect(effect, deps) {
        const index = cursor++, previous = slots[index];
        if (!previous || !same(previous.deps, deps)) {
          slots[index] = { deps, cleanup: previous?.cleanup };
          effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
        }
      },
    },
    render(Component, props) {
      let tree, renders = 0;
      do {
        dirty = false; cursor = 0; tree = Component(props);
        while (effects.length) effects.shift()();
        assert.ok(++renders < 20, 'fixture effects must settle');
      } while (dirty);
      return tree;
    },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function browser(t) {
  const old = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const entries = new Map(); let ids = 0;
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const listeners = new Map();
  globalThis.window = {
    localStorage: storage, sessionStorage: storage,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}` },
    location: { href: 'https://fixture.invalid/checkout', origin: 'https://fixture.invalid' },
    scrollTo() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
    setTimeout, clearTimeout,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
  globalThis.document = { documentElement: {}, body: { classList: { toggle() {}, remove() {} } }, visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
  globalThis.fetch = () => { throw new Error('unexpected network boundary'); };
  t.after(() => { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  return { storage, listeners };
}

function flow(t, paymentConfig = config, batch = {}, checkoutPage = true) {
  const h = hooks();
  const { ReservationFlow } = sourceModule('src/app/reserve/ReservationFlow.tsx', {
    react: { ...React, ...h.api },
    'next/image': { __esModule: true, default: Empty }, 'next/link': { __esModule: true, default: Empty },
    '@/components/RollingBagel': { RollingBagel: Empty }, '@/components/ConversionTrustStrip': { ConversionTrustStrip: Empty },
    '@/components/payments/CulqiCheckoutButton': { CulqiCheckoutButton: Checkout },
    '@/components/LanguageProvider': { useLanguage: () => ({ locale: 'es', copy: i18n.translations.es }) },
    '@/components/BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting: true, merchantReviewOnly: false, batchName: 'Synthetic', remainingPacks: 1, ...batch }) },
    '@/lib/analytics': { trackBagelitoEvent() {} },
    '@/lib/waitlist/use-campaign-href': { useWaitlistCampaignHref: () => pack => `/waitlist?pack=${pack}` },
  });
  const props = { packs, flavors, initialPackSlug: '6-single', initialFlavorSlug: 'plain', paymentConfig, checkoutPage };
  let tree;
  const render = () => (tree = h.render(ReservationFlow, props));
  render();
  const mountedWindow = window, mountedDocument = document;
  t.after(() => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    globalThis.window = mountedWindow; globalThis.document = mountedDocument;
    h.cleanup();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  });
  return {
    render, props, states: h.states, cleanup: h.cleanup,
    checkout: () => nodes(tree).find(node => node.type === Checkout)?.props,
    navigate(pack, flavor) { props.initialPackSlug = pack; props.initialFlavorSlug = flavor; render(); },
    review() {
      h.states[0].set(4);
      h.states[4].set({ customerName: 'Synthetic', whatsapp: '999999999', email: 'fixture@example.invalid', deliveryAddress: 'Synthetic address', district: 'Miraflores', addressReference: '', deliveryNotes: '', deliveryHandoff: 'self', marketingOptIn: false });
      render();
      const consent = nodes(tree).find(node => node.type === 'input' && node.props.id === 'checkout-terms-consent');
      assert.ok(consent); consent.props.onChange({ target: { checked: true } }); render();
    },
    get tree() { return tree; },
  };
}

test('idle URL selection updates the same flow, including single flavor and consent reset', t => {
  browser(t); const ui = flow(t); ui.review();
  ui.navigate('12-single', 'cheddar');
  assert.equal(ui.states[1].value, '12-single');
  assert.equal(ui.states[3].value, 'cheddar');
  assert.equal(ui.states[6].value, false);
  assert.equal(ui.states[0].value, 1);
});

test('query navigation during reservation preparation preserves its session and original payload', async t => {
  browser(t); const ui = flow(t); ui.review();
  let release; const calls = [], expiresAt = new Date(Date.now() + 600000).toISOString();
  globalThis.fetch = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    if (url === '/api/reservations/culqi') await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => url.endsWith('/order')
      ? { ok: true, sessionId: 'local-session', amount: 6600, expiresAt }
      : { ok: true, orderCode: 'BAG-FIXTURE', amount: 66, expiresAt } };
  };
  const preparation = ui.checkout().prepareCheckout();
  ui.navigate('12-single', 'cheddar');
  assert.equal(ui.states[1].value, '6-single'); assert.equal(ui.states[3].value, 'plain');
  release(); const session = await preparation;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.packSlug, '6-single');
  assert.equal(calls[0].payload.termsVersion, CHECKOUT_LEGAL_VERSION);
  assert.equal(calls[1].payload.checkoutSessionId, session.checkoutSessionId);
  assert.equal(ui.checkout().customerEmail, 'fixture@example.invalid');
});

test('actual remount with unresolved payment restores the original private recovery and never submits', t => {
  const { storage } = browser(t);
  recoveryModule.beginCheckoutPayment(storage, { version: 1, state: 'pending', checkoutSessionId: '00000000-0000-4000-8000-000000000001', orderCode: 'BAG-ORIGINAL' });
  const ui = flow(t); ui.navigate('12-single', 'cheddar');
  assert.equal(ui.checkout(), undefined);
  assert.match(text(ui.tree), /BAG-ORIGINAL/);
  assert.match(text(ui.tree), /No vuelvas a pagar/);
  assert.equal(ui.states[1].value, '6-single');
  assert.equal(recoveryModule.readCheckoutRecovery(storage).orderCode, 'BAG-ORIGINAL');
});

test('unmounted preparation cannot continue to create a token session or submit a stale callback', async t => {
  browser(t); const ui = flow(t); ui.review(); const checkout = ui.checkout();
  let release; const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ ok: true, orderCode: 'BAG-LATE', amount: 66, expiresAt: new Date(Date.now() + 600000).toISOString() }) };
  };
  const preparing = checkout.prepareCheckout(); ui.cleanup(); release();
  await assert.rejects(preparing);
  assert.equal(calls.length, 1, 'disposed preparation must not call /order');
  await assert.rejects(checkout.onToken({ checkoutSessionId: '00000000-0000-4000-8000-000000000001', orderCode: 'BAG-LATE', amountMinor: 6600, sessionId: 'late', expiresAt: new Date(Date.now() + 600000).toISOString() }, 'tkn_test_fixture', { deviceId: 'fixture-device' }));
  assert.equal(calls.length, 1, 'disposed callbacks must not create a charge');
});

test('late charge success after disposal retains recovery for its new owner without redirecting', async t => {
  const { storage } = browser(t); const original = flow(t); original.review();
  const calls = [], expiresAt = new Date(Date.now() + 600000).toISOString(); let release;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    if (url.endsWith('/charge')) await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => url.endsWith('/charge') ? { ok: true, paymentStatus: 'paid' }
      : url.endsWith('/status') ? { ok: true, paymentStatus: 'paid', reconciliationRequired: false }
        : url.endsWith('/order') ? { ok: true, sessionId: 'local-session', amount: 6600, expiresAt }
          : { ok: true, orderCode: 'BAG-ORIGINAL', amount: 66, expiresAt } };
  };
  const checkout = original.checkout(), session = await checkout.prepareCheckout();
  const submitted = checkout.onToken(session, 'tkn_test_fixture', { deviceId: 'fixture-device' });
  assert.equal(recoveryModule.readCheckoutRecovery(storage).checkoutSessionId, session.checkoutSessionId);
  original.cleanup(); const resumed = flow(t); resumed.navigate('12-single', 'cheddar');
  release(); await assert.rejects(submitted);
  assert.equal(window.location.href, 'https://fixture.invalid/checkout');
  assert.equal(calls.filter(call => call.url.endsWith('/charge')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/status')).length, 0, 'the disposed flow must not consume the new owner recovery');
  assert.equal(recoveryModule.readCheckoutRecovery(storage).checkoutSessionId, session.checkoutSessionId);
  assert.equal(resumed.checkout(), undefined);
  assert.match(text(resumed.tree), /BAG-ORIGINAL/);
});

test('disabled checkout demo is illustrative, has no payment inputs or SDK, and performs no request', async t => {
  browser(t); const h = hooks(); let completed = 0;
  const Script = () => null;
  const { CulqiCheckoutButton } = sourceModule('src/components/payments/CulqiCheckoutButton.tsx', {
    react: { ...React, ...h.api }, 'next/script': { __esModule: true, default: Script },
  });
  const props = { amount: 66, config: { ...config, enabled: false }, locale: 'es', customerEmail: 'fixture@example.invalid', onDemoComplete: () => { completed++; }, onError: assert.fail, prepareCheckout: assert.fail, onToken: assert.fail };
  let tree = h.render(CulqiCheckoutButton, props);
  assert.equal(nodes(tree).filter(node => node.type === Script || node.type === 'input' || node.type === 'form').length, 0);
  assert.match(text(tree), /No se registrarán pedidos ni cargos/);
  const submit = nodes(tree).find(node => node.type === 'button').props.onClick;
  submit(); submit(); await Promise.resolve(); await Promise.resolve();
  tree = h.render(CulqiCheckoutButton, props);
  assert.equal(completed, 1);
  assert.equal(nodes(tree).find(node => node.type === 'button').props.disabled, true);
  h.cleanup();
});

test('demo completion respects consent and pending payment rather than preparing a real reservation', t => {
  browser(t); const ui = flow(t, { ...config, enabled: false }, { merchantReviewOnly: true });
  ui.states[0].set(4); ui.render(); const unaccepted = ui.checkout();
  unaccepted.onDemoComplete(); assert.equal(window.location.href, 'https://fixture.invalid/checkout');
  const consent = nodes(ui.tree).find(node => node.type === 'input' && node.props.id === 'checkout-terms-consent');
  consent.props.onChange({ target: { checked: true } }); ui.render(); ui.checkout().onDemoComplete();
  const destination = new URL(window.location.href, 'https://fixture.invalid');
  assert.equal(destination.pathname, '/reserve/success'); assert.equal(destination.searchParams.get('payment'), 'demo');
  assert.equal(destination.searchParams.get('order'), 'BAG-DEMO'); assert.equal(destination.searchParams.has('checkoutSessionId'), false);
});

for (const [review, enabled, checkoutPage, preview] of [
  [true, false, true, true], [false, false, true, false],
  [true, true, true, false], [false, true, true, false], [true, false, false, false],
]) {
  test(`closed batch preview is explicit and cannot enable live intake (review=${review}, enabled=${enabled}, checkout=${checkoutPage})`, t => {
    browser(t);
    const ui = flow(t, { ...config, enabled }, { accepting: false, merchantReviewOnly: review }, checkoutPage);
    const options = nodes(ui.tree).filter(node => node.type === 'button' && String(node.props.className).includes('reserve-pack-option'));
    assert.equal(options.length, preview ? packs.length : 0);
    if (preview) { ui.review(); assert.equal(typeof ui.checkout().onDemoComplete, 'function'); }
    else assert.match(text(ui.tree), /Próxima apertura por anunciar/);
  });
}

test('closed merchant preview never replaces an unresolved payment with a demo cart', t => {
  const { storage } = browser(t);
  recoveryModule.beginCheckoutPayment(storage, { version: 1, state: 'pending', checkoutSessionId: '00000000-0000-4000-8000-000000000001', orderCode: 'BAG-ORIGINAL' });
  const ui = flow(t, { ...config, enabled: false }, { accepting: false, merchantReviewOnly: true });
  assert.equal(ui.checkout(), undefined);
  assert.equal(nodes(ui.tree).filter(node => String(node.props.className).includes('reserve-pack-option')).length, 0);
  assert.match(text(ui.tree), /BAG-ORIGINAL/);
  assert.equal(recoveryModule.readCheckoutRecovery(storage).state, 'pending');
});
