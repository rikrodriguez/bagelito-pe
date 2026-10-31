import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { syntheticPage, fillCheckout, queryNavigate, readRecovery, localURL, recoveryKey } from './fixtures/synthetic-checkout.mjs';

let browser;
test.before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', headless: true,
  });
});
test.after(async () => { await browser?.close(); });

const until = async (predicate, message) => {
  const deadline = Date.now() + 10_000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), message);
};

for (const [locale, viewport] of [['en', { width: 1440, height: 1000 }], ['es', { width: 390, height: 844 }]]) {
  test('URL selection during preparation preserves the original hold and final-slot owner (' + locale + ')', async t => {
    const f = await syntheticPage(browser, t, { locale, viewport, holdReservation: true });
    await fillCheckout(f.page);
    await until(() => f.count('reservation') === 1, 'A real-schema reservation must start after explicit consent');
    const reference = f.state.reservation.checkoutSessionId;
    await queryNavigate(f.page);
    assert.ok((await f.page.locator('.checkout-review-card').innerText()).includes('Cheddar'));
    assert.equal(f.count('reservation'), 1, 'Query changes cannot prepare a replacement purchase');
    f.releaseReservation();
    await f.page.locator('.synthetic-culqi-pay').waitFor();
    assert.equal(f.count('session'), 1);
    const sdk = await f.page.evaluate(() => ({ opens: window.__syntheticCulqi.opens,
      instances: window.__syntheticCulqi.instances.length }));
    assert.deepEqual(sdk, { opens: 1, instances: 1 });
    assert.equal(f.state.reservation.checkoutSessionId, reference);
    f.state.accepting = false;
    const beforeBatch = f.count('batch');
    await f.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await until(() => f.count('batch') > beforeBatch, 'Synthetic last-slot availability must refresh');
    await f.page.locator('.reserve-batch-card.is-closed').waitFor();
    await f.page.locator('.synthetic-culqi-pay').waitFor();
    assert.equal(await f.page.locator('.reserve-closed-card').count(), 0, 'Original preparation owns its displayed last slot');
    assert.equal(f.count('reservation'), 1);
    assert.equal(f.count('charge'), 0);
  });

  test('lost charge response stays locked across query navigation and reload until verified status (' + locale + ')', async t => {
    const f = await syntheticPage(browser, t, { locale, viewport, lostChargeResponse: true, holdStatus: true });
    await fillCheckout(f.page);
    await f.page.locator('.synthetic-culqi-pay').click();
    await until(() => f.count('charge') === 1, 'Synthetic token must cross the actual compiled callback');
    const recoveryHeading = locale === 'es' ? 'Tu pago necesita revisión' : 'Your payment needs review';
    await f.page.getByRole('heading', { name: recoveryHeading, exact: true }).waitFor();
    const reference = await readRecovery(f.page);
    assert.equal(reference.orderCode, f.state.orderCode);
    assert.equal(reference.checkoutSessionId, f.state.reservation.checkoutSessionId);
    assert.equal(reference.state, 'review');
    await queryNavigate(f.page);
    await f.page.getByRole('heading', { name: recoveryHeading, exact: true }).waitFor();
    await f.page.reload();
    await f.page.getByRole('heading', { name: recoveryHeading, exact: true }).waitFor();
    assert.deepEqual(await readRecovery(f.page), reference);
    assert.equal(await f.page.locator('.synthetic-culqi-pay:not([disabled])').count(), 0);
    assert.equal(await f.page.locator('.reserve-pack-option').count(), 0);
    assert.equal(f.count('reservation'), 1);
    assert.equal(f.count('session'), 1);
    assert.equal(f.count('charge'), 1, 'Recovery must never submit another token');
    await f.page.locator('.review-card:has(h1) button.pink').click();
    await until(() => f.count('status') === 1, 'Status lookup must use the original private checkout reference');
    await f.page.waitForFunction(() => document.querySelector('.review-card:has(h1) button.pink')?.disabled === true);
    assert.deepEqual(await readRecovery(f.page), reference, 'An in-flight status lookup cannot unlock the previous payment');
    assert.equal(await f.page.locator('.reserve-pack-option').count(), 0);
    f.releaseStatus();
    await f.page.getByRole('heading', { name: locale === 'es' ? 'Pago confirmado' : 'Payment confirmed', exact: true }).waitFor();
    assert.equal(await readRecovery(f.page), null);
    assert.equal(f.count('charge'), 1);
  });

  test('malformed durable recovery fails closed after navigation without any payment write (' + locale + ')', async t => {
    const f = await syntheticPage(browser, t, { locale, viewport, recoverySeed: '{invalid-synthetic-json' });
    await f.page.goto(localURL + '/checkout?pack=6-single&flavor=cheddar');
    const blockedCopy = locale === 'es' ? /No vuelvas a pagar ni crees otro pedido/ : /Do not pay again or create another order/;
    await f.page.locator('.review-card:has(h1)').getByText(blockedCopy).waitFor();
    await queryNavigate(f.page);
    await f.page.locator('.review-card:has(h1)').getByText(blockedCopy).waitFor();
    assert.equal(await f.page.locator('.reserve-pack-option').count(), 0);
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), recoveryKey), '{invalid-synthetic-json');
    assert.equal(f.count('reservation'), 0);
    assert.equal(f.count('session'), 0);
    assert.equal(f.count('charge'), 0);
    assert.equal(f.count('status'), 0);
  });
}
