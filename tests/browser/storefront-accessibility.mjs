import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright-core';
import { sourceModule } from '../helpers/load-ts.mjs';
import { fulfillLocalRead } from './fixtures/local-read.mjs';

const baseURL = process.env.BAGELITO_TEST_URL ?? 'http://127.0.0.1:3107';
const origin = new URL(baseURL).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname), 'Only a local review server is allowed');
const { translations } = sourceModule('src/lib/i18n.ts');
const { getWhatsAppHref } = sourceModule('src/lib/whatsapp.ts');
const { siteContactEmail, siteInstagramUrl } = sourceModule('src/lib/site.ts');
const report = [];
let browser;

test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true });
});
test.after(async () => {
  await browser?.close();
  mkdirSync('/tmp/bagelito-storefront-accessibility', { recursive: true });
  const phase = process.env.BAGELITO_A11Y_PHASE === 'baseline' ? 'baseline' : 'verified';
  writeFileSync(`/tmp/bagelito-storefront-accessibility/${phase}.json`, JSON.stringify(report, null, 2));
});

async function localPage(t, locale, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const writes = [], external = [], redirects = [], errors = [];
  let closing = false;
  await context.addInitScript(value => localStorage.setItem('bagelito-locale', value), locale);
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    if (new URL(request.url()).origin !== origin) {
      external.push(request.url());
      return route.abort();
    }
    try { await fulfillLocalRead(route); }
    catch (error) {
      if (!closing) redirects.push(error.code ?? error.message);
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(20_000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    closing = true;
    await context.close();
    assert.deepEqual(writes, [], 'No submission, analytics POST or other mutation may leave the browser');
    assert.deepEqual(external, [], 'No external resources/providers should be requested');
    assert.deepEqual(redirects, [], 'Local redirects cannot bypass the network guard');
    assert.deepEqual(errors, [], 'No browser runtime errors');
  });
  return page;
}

async function accessibilityTree(page) {
  const session = await page.context().newCDPSession(page);
  try { return (await session.send('Accessibility.getFullAXTree')).nodes; }
  finally { await session.detach(); }
}

async function assertNamedControls(page) {
  const roles = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'spinbutton'];
  const nodes = await accessibilityTree(page);
  assert.deepEqual(nodes.filter(node => !node.ignored && roles.includes(node.role?.value) && !node.name?.value?.trim())
    .map(node => ({ role: node.role.value, backendDOMNodeId: node.backendDOMNodeId })), [], 'Visible interactive controls need accessible names');
}

async function geometry(page) {
  return page.evaluate(() => ({
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    mainLanguage: document.querySelector('main')?.closest('[lang]')?.lang,
    clippedControls: [...document.querySelectorAll('header a,header button,footer a,main input:not([tabindex="-1"]),main select,main textarea,main button,.legal-contact-actions a')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(element => ({ tag: element.tagName, name: element.getAttribute('name'),
        text: element.textContent?.trim().slice(0, 70), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })),
    clippedSummary: [...document.querySelectorAll('.legal-summary strong')]
      .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent),
  }));
}

async function headerKeyboard(page, locale) {
  await page.locator('.logo-link').focus();
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('.header-checkout-link').evaluate(element => element === document.activeElement));
  const focus = await page.locator('.header-checkout-link').evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && (parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none');
  });
  assert.equal(focus, true, 'Keyboard checkout link needs a visible focus indicator');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'EN');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'ES');
  const alternate = locale === 'es' ? 'en' : 'es';
  const toggle = page.getByRole('button', { name: alternate.toUpperCase(), exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await page.locator(`html[lang="${alternate}"]`).waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  const restore = page.getByRole('button', { name: locale.toUpperCase(), exact: true });
  await restore.focus();
  await restore.press('Space');
  await page.locator(`html[lang="${locale}"]`).waitFor();
  assert.equal(await restore.getAttribute('aria-pressed'), 'true');
}

async function contactLinks(page, locale) {
  const footer = page.locator('footer');
  assert.equal(await footer.getByRole('link', { name: translations[locale].footer.homeLabel, exact: true }).getAttribute('href'), '/');
  assert.equal(await footer.getByRole('link', { name: translations[locale].footer.legal, exact: true }).getAttribute('href'), '/legal');
  assert.equal(await footer.getByRole('link', { name: 'Libro de Reclamaciones', exact: true }).getAttribute('href'), '/libro-de-reclamaciones');
  assert.equal(await footer.getByRole('link', { name: siteContactEmail, exact: true }).getAttribute('href'), `mailto:${siteContactEmail}`);
  assert.equal(await footer.locator('a').filter({ hasText: '+51 917 547 745' }).getAttribute('href'), getWhatsAppHref());
  assert.equal(await footer.getByRole('link', { name: '@bagelito.pe', exact: true }).getAttribute('href'), siteInstagramUrl);
}

async function legalKeyboard(page) {
  const anchors = page.locator('.legal-anchor-nav a');
  const hrefs = await anchors.evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  for (const href of hrefs) assert.equal(await page.locator(`[id="${href.slice(1)}"]`).count(), 1);
  const first = anchors.first();
  const href = await first.getAttribute('href');
  await first.focus();
  await first.press('Enter');
  await page.waitForURL(url => url.hash === href);
  for (const alias of ['privacy', 'privacidad', 'terms', 'terminos']) {
    assert.equal(await page.locator(`[id="${alias}"]`).count(), 1);
  }
  const complaintsLink = page.locator('.legal-contact-actions a[href="/libro-de-reclamaciones"]');
  await complaintsLink.focus();
  await complaintsLink.press('Enter');
  await page.waitForURL('**/libro-de-reclamaciones');
  await page.getByRole('heading', { name: 'Libro de Reclamaciones', exact: true }).waitFor();
}

async function complaintsKeyboard(page) {
  const minor = page.getByRole('checkbox', { name: 'El consumidor es menor de edad', exact: true });
  await minor.focus();
  await minor.press('Space');
  assert.equal(await minor.isChecked(), true);
  const representative = page.getByRole('textbox', { name: 'Padre, madre o representante', exact: true });
  await representative.waitFor();
  assert.equal(await representative.getAttribute('required'), '');
  await page.keyboard.press('Tab');
  assert.ok(await representative.evaluate(element => element === document.activeElement));
  assert.notEqual(await representative.evaluate(element => getComputedStyle(element).boxShadow), 'none');
  const grievance = page.getByRole('radio', { name: /^Queja/ });
  await grievance.focus();
  await grievance.press('Space');
  assert.equal(await grievance.isChecked(), true);
  await grievance.press('ArrowLeft');
  assert.equal(await page.getByRole('radio', { name: /^Reclamo/ }).isChecked(), true);
  await assertNamedControls(page);
  assert.equal(await page.locator('input[name="website"]').getAttribute('tabindex'), '-1');
  assert.equal(await page.locator('input[name="website"]').evaluate(element => element.closest('[aria-hidden]')?.getAttribute('aria-hidden')), 'true');
}

for (const width of [320, 360, 390, 1440]) {
  for (const locale of ['es', 'en']) {
    test(`storefront, legal and complaint controls/links/geometry (${locale}, ${width}px)`, async t => {
      const page = await localPage(t, locale, { width, height: 900 });
      for (const path of ['/', '/legal', '/libro-de-reclamaciones']) {
        await page.goto(`${baseURL}${path}`);
        await page.locator(`html[lang="${locale}"]`).waitFor();
        assert.equal(await page.getByRole('main').count(), 1);
        assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
        await assertNamedControls(page);
        await contactLinks(page, locale);
        await headerKeyboard(page, locale);
        if (path === '/libro-de-reclamaciones') await complaintsKeyboard(page);
        const metrics = await geometry(page);
        report.push({ locale, width, path, ...metrics });
        assert.ok(metrics.documentWidth <= metrics.viewport + 1, JSON.stringify(metrics));
        assert.deepEqual(metrics.clippedControls, []);
        assert.deepEqual(metrics.clippedSummary, []);
        if (path === '/libro-de-reclamaciones') assert.equal(metrics.mainLanguage, 'es', 'Spanish complaint content must keep its own language under an English document');
        if (path === '/legal') await legalKeyboard(page);
      }
    });
  }
}

test('the Spanish complaint receipt declares its language without any submission', () => {
  const submitted = { code: 'SYNTHETIC-001', createdAt: '2026-10-31T12:00:00Z', requestType: 'reclamo',
    consumerName: 'Synthetic Consumer', documentType: 'DNI', documentNumber: '00000000',
    consumerAddress: 'Synthetic address', phone: '000000000', email: 'qa@example.invalid',
    itemType: 'product', amount: 50, itemDescription: 'Synthetic pack', detail: 'Synthetic issue', requestedAction: 'Synthetic request' };
  const slots = [false, 'reclamo', false, '', submitted];
  let cursor = 0;
  const { ComplaintsBookForm } = sourceModule('src/app/libro-de-reclamaciones/ComplaintsBookForm.tsx', {
    react: { ...React, useState: () => [slots[cursor++], () => {}] },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  });
  const html = renderToStaticMarkup(React.createElement(ComplaintsBookForm));
  assert.match(html, /<main\b[^>]*lang="es"/);
  assert.ok(html.includes('SYNTHETIC-001'));
});

test('the real mobile CTA keeps the visible label inside its browser accessible name in every display state', async t => {
  const page = await localPage(t, 'en', { width: 360, height: 900 });
  for (const locale of ['es', 'en']) {
    for (const [accepting, merchantReviewOnly] of [[false, false], [true, false], [false, true]]) {
      const { MobileStickyReserveCTA } = sourceModule('src/components/MobileStickyReserveCTA.tsx', {
        react: { ...React, useState: () => [true, () => {}] },
        'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
        'next/navigation': { useSearchParams: () => new URLSearchParams() },
        './LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
        './BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting, merchantReviewOnly }) },
        '@/lib/analytics': { trackBagelitoEvent() {} },
      });
      const html = renderToStaticMarkup(React.createElement(MobileStickyReserveCTA));
      await page.setContent(`<html lang="${locale}"><body>${html}</body></html>`);
      const visible = (await page.locator('a').innerText()).trim();
      const node = (await accessibilityTree(page)).find(item => !item.ignored && item.role?.value === 'link');
      assert.ok(node, 'The CTA must be exposed as a link');
      report.push({ component: 'MobileStickyReserveCTA', locale, accepting, merchantReviewOnly, visible, accessible: node.name.value });
      assert.ok(node.name.value.includes(visible), `${locale}: visible=${visible}; accessible=${node.name.value}`);
    }
  }
});
