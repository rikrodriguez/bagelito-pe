import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceModule } from '../../helpers/load-ts.mjs';
import { fulfillLocalRead } from './local-read.mjs';

const { culqiReservationPayloadSchema } = sourceModule('src/lib/reservations/schema.ts');
const { getPackBySlug } = sourceModule('src/lib/catalog.ts');
const { getDeliveryFee } = sourceModule('src/lib/delivery-pricing.ts');
const { getCheckoutExtraPackOffer } = sourceModule('src/lib/checkout-upsell.ts');
const sdkSource = readFileSync(new URL('./culqi-sdk.js', import.meta.url), 'utf8');
const threeDSSource = readFileSync(new URL('./culqi-3ds.js', import.meta.url), 'utf8');

export const recoveryKey = 'bagelito.culqi.pending.v1';
export const localURL = process.env.BAGELITO_TEST_URL ?? 'http://127.0.0.1:3107';
export const origin = new URL(localURL).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(localURL).hostname),
  'Synthetic checkout browser tests require a loopback server without real credentials');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

export async function syntheticPage(browser, t, { locale, viewport, holdReservation = false, lostChargeResponse = false, holdStatus = false,
  recoverySeed } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(20_000);
  const calls = [], violations = [], errors = [], blockedExternal = [];
  let localReads = 0;
  const reservationGate = gate();
  const statusGate = gate();
  let closing = false;
  if (!holdStatus) statusGate.release();
  if (!holdReservation) reservationGate.release();
  const state = {
    accepting: true,
    reservation: null,
    orderCode: 'BAG-BROWSER-SYNTHETIC',
    sessionId: '00000000-0000-4000-8000-000000001101',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    status: { ok: true, paymentStatus: 'paid', reconciliationRequired: false },
  };
  await page.addInitScript(({ language, seed, key }) => {
    localStorage.setItem('bagelito-locale', language);
    if (seed !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key, seed);
  }, { language: locale, seed: recoverySeed, key: recoveryKey });
  page.on('pageerror', error => errors.push(error.message));
  const batch = () => ({
    accepting: state.accepting, batchName: 'Synthetic browser batch', capacityBagels: 6, capacityPacks: 1,
    deliveryDate: null, ordersOpenAt: null, ordersCloseAt: null,
    remainingBagels: state.accepting ? 6 : 0, remainingPacks: state.accepting ? 1 : 0,
    reservedBagels: state.accepting ? 0 : 6, reservedPacks: state.accepting ? 0 : 1, status: 'orders_open',
  });
  const fulfill = (route, value, status = 200) => route.fulfill({
    status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(value),
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (request.method() === 'GET' && url.href === 'https://js.culqi.com/checkout-js') {
        calls.push({ stage: 'synthetic-sdk', path: url.href });
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: sdkSource });
      }
      if (request.method() === 'GET' && url.origin === 'https://3ds.culqi.com' && url.pathname === '/') {
        calls.push({ stage: 'synthetic-3ds', path: url.href });
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: threeDSSource });
      }
      if (url.origin !== origin) {
        blockedExternal.push(request.url());
        return route.abort('blockedbyclient');
      }
      if (url.pathname === '/api/batch' && request.method() === 'GET') {
        calls.push({ stage: 'batch', path: url.pathname });
        return fulfill(route, batch());
      }
      if (request.method() === 'POST' && url.pathname === '/api/reservations/culqi') {
        const payload = culqiReservationPayloadSchema.parse(request.postDataJSON());
        assert.equal(payload.packSlug, '6-single');
        assert.equal(payload.termsAccepted, true);
        assert.deepEqual(payload.items, [{ flavorSlug: 'cheddar', quantity: 6 }]);
        assert.equal(payload.email, 'browser@example.invalid');
        const pack = getPackBySlug(payload.packSlug);
        state.amount = pack.amount + (payload.extraPack ? getCheckoutExtraPackOffer(pack.amount).discountedAmount : 0)
          + getDeliveryFee(payload.district);
        state.reservation = payload;
        calls.push({ stage: 'reservation', path: url.pathname, payload });
        await reservationGate.promise;
        return fulfill(route, { ok: true, orderCode: state.orderCode, amount: state.amount, expiresAt: state.expiresAt });
      }
      if (request.method() === 'POST' && url.pathname === '/api/payments/culqi/order') {
        const payload = request.postDataJSON();
        assert.ok(state.reservation, 'Token session must follow a valid real-schema reservation');
        assert.equal(payload.checkoutSessionId, state.reservation.checkoutSessionId);
        assert.equal(payload.orderCode, state.orderCode);
        assert.equal(payload.email, state.reservation.email);
        calls.push({ stage: 'session', path: url.pathname, payload });
        return fulfill(route, { ok: true, sessionId: state.sessionId, amount: Math.round(state.amount * 100), expiresAt: state.expiresAt });
      }
      if (request.method() === 'POST' && url.pathname === '/api/payments/culqi/charge') {
        const payload = request.postDataJSON();
        assert.equal(payload.checkoutSessionId, state.reservation.checkoutSessionId);
        assert.equal(payload.orderCode, state.orderCode);
        assert.equal(payload.email, state.reservation.email);
        assert.equal(payload.sourceId, 'ype_test_browser_synthetic');
        const durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), recoveryKey);
        assert.deepEqual(durable, { version: 1, checkoutSessionId: state.reservation.checkoutSessionId,
          orderCode: state.orderCode, state: 'pending' }, 'Recovery must be durable before the charge request is answered');
        calls.push({ stage: 'charge', path: url.pathname, payload });
        if (lostChargeResponse) return route.abort('connectionfailed');
        return fulfill(route, { ok: true, paymentStatus: 'pending' });
      }
      if (request.method() === 'POST' && url.pathname === '/api/payments/culqi/status') {
        const payload = request.postDataJSON();
        const submitted = state.reservation?.checkoutSessionId ?? JSON.parse(recoverySeed).checkoutSessionId;
        assert.equal(payload.checkoutSessionId, submitted);
        assert.equal(payload.orderCode, state.orderCode);
        calls.push({ stage: 'status', path: url.pathname, payload });
        await statusGate.promise;
        return fulfill(route, state.status);
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        violations.push('Unexpected write: ' + request.method() + ' ' + url.pathname);
        return route.abort('blockedbyclient');
      }
      localReads++;
      return await fulfillLocalRead(route);
    } catch (error) {
      if (closing) return;
      violations.push(url.pathname + ': ' + error.message);
      if (error.code === 'LOCAL_REDIRECT_REJECTED') return;
      return fulfill(route, { ok: false, error: 'Synthetic boundary assertion failed' }, 500);
    }
  });
  t.after(async () => {
    reservationGate.release();
    statusGate.release();
    closing = true;
    await context.close();
    assert.deepEqual(violations, [], 'Only explicitly mocked and validated writes are allowed');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    t.diagnostic(JSON.stringify({ syntheticCalls: calls.map(call => call.stage),
      blockedExternalRequests: blockedExternal.length, localReadRequests: localReads }));
  });
  return { page, state, calls, releaseReservation: () => reservationGate.release(), releaseStatus: () => statusGate.release(),
    count: stage => calls.filter(call => call.stage === stage).length };
}

export async function fillCheckout(page) {
  await page.goto(localURL + '/checkout?pack=6-single&flavor=cheddar');
  await page.locator('.reserve-pack-option.selected').waitFor();
  await page.locator('.reserve-nav button.pink').click();
  assert.equal(await page.locator('.flavor-select-card.selected h3').innerText(), 'Cheddar');
  await page.locator('.reserve-nav button.pink').click();
  const inputs = page.locator('.form-grid input[required]');
  for (const [index, value] of ['Synthetic Browser', '999000111', 'browser@example.invalid', 'Synthetic address 123'].entries()) {
    await inputs.nth(index).fill(value);
  }
  await page.locator('.reserve-nav button.pink').click();
  await page.locator('#checkout-terms-consent').check();
}

export async function queryNavigate(page) {
  // Trigger the actual Next Link navigation, including when payment-mode CSS
  // hides the header. This targets the route/props lifecycle, not visibility.
  await page.locator('.header-checkout-link').evaluate(link => link.click());
  await page.waitForURL('**/checkout?pack=6-mixed');
}

export async function readRecovery(page) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, recoveryKey);
}
