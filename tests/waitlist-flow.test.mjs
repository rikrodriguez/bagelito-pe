import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceModule } from './helpers/load-ts.mjs';

const { translations, packCopy } = sourceModule('src/lib/i18n.ts');
const campaign = 'utm_source=instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1';
const expectedSource = 'utm:v1:' + campaign;
const Placeholder = () => null;
function overrides(locale = 'en', query = campaign) {
  return {
    'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: Placeholder },
    '@/components/RollingBagel': { RollingBagel: Placeholder }, './RollingBagel': { RollingBagel: Placeholder },
    '@/components/LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
    './LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
    '@/components/BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting: false }) },
    './BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting: false }) },
    '@/lib/analytics': { trackBagelitoEvent() {} },
  };
}

for (const name of ['Hero', 'Packs', 'FinalCTA', 'BatchDeadlineBanner', 'MobileStickyReserveCTA']) {
  test(`${name} preserves the campaign in every home-to-waitlist link`, () => {
    const deps = overrides();
    if (name === 'MobileStickyReserveCTA') deps.react = { ...React, useState: () => [true, () => {}] };
    const Component = sourceModule(`src/components/${name}.tsx`, deps)[name];
    const html = renderToStaticMarkup(React.createElement(Component));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&')).filter(href => href.startsWith('/waitlist'));
    assert.ok(hrefs.length);
    for (const href of hrefs) {
      const url = new URL(href, 'https://synthetic.invalid');
      assert.equal(url.searchParams.get('utm_source'), 'instagram');
      assert.equal(url.searchParams.get('utm_campaign'), 'october');
      assert.equal(url.searchParams.get('utm_content'), 'reel-1');
      if (name === 'Packs') assert.match(url.searchParams.get('pack'), /^(6|12)-(single|mixed)$/);
    }
  });
}

test('open-batch CTAs retain campaign on the way to packs and reservation', () => {
  for (const name of ['Hero', 'Packs', 'FinalCTA', 'BatchDeadlineBanner', 'MobileStickyReserveCTA']) {
    const deps = overrides();
    deps['./BatchAvailabilityProvider'] = { useBatchAvailability: () => ({ accepting: true }) };
    if (name === 'MobileStickyReserveCTA') deps.react = { ...React, useState: () => [true, () => {}] };
    const Component = sourceModule(`src/components/${name}.tsx`, deps)[name];
    const html = renderToStaticMarkup(React.createElement(Component));
    assert.ok(!html.includes('href="/waitlist'));
    if (name === 'Hero') assert.ok(html.includes('href="#packs"'));
    else {
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
      const target = hrefs.find(href => href.startsWith(name === 'Packs' ? '/reserve?pack=12-mixed' : '/?'));
      assert.ok(target, name);
      const url = new URL(target, 'https://synthetic.invalid');
      assert.equal(url.searchParams.get('utm_source'), 'instagram');
      if (name !== 'Packs') assert.equal(url.hash, '#packs');
    }
  }
});

test('open-batch links keep their original destinations when no valid campaign exists', () => {
  for (const query of ['', 'token=synthetic-private', 'utm_source=%3Cscript%3E', 'utm_source=instagram&utm_source=tiktok']) {
    for (const name of ['Hero', 'Packs', 'FinalCTA', 'BatchDeadlineBanner', 'MobileStickyReserveCTA']) {
      const deps = overrides('en', query);
      deps['./BatchAvailabilityProvider'] = { useBatchAvailability: () => ({ accepting: true }) };
      if (name === 'MobileStickyReserveCTA') deps.react = { ...React, useState: () => [true, () => {}] };
      const Component = sourceModule(`src/components/${name}.tsx`, deps)[name];
      const html = renderToStaticMarkup(React.createElement(Component));
      const expected = name === 'Hero' ? '#packs' : name === 'Packs' ? '/reserve?pack=12-mixed' : '/#packs';
      assert.ok(html.includes(`href="${expected}"`));
      assert.ok(!html.includes('synthetic-private'));
    }
  }
});

test('waitlist page passes validated campaign source and pack to the form', async () => {
  const { default: Page } = sourceModule('src/app/waitlist/page.tsx', overrides());
  const tree = await Page({ searchParams: Promise.resolve({ ...Object.fromEntries(new URLSearchParams(campaign)), pack: '12-mixed' }) });
  const form = nodes(tree).find(node => node?.type?.name === 'WaitlistForm');
  assert.equal(form.props.initialPackSlug, '12-mixed');
  assert.equal(form.props.source, expectedSource);
});

function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [tree];
}
function hooks() {
  const slots = []; let cursor = 0;
  return {
    api: { useState(initial) {
      const i = cursor++; if (!Object.hasOwn(slots, i)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    }, useMemo: fn => fn() },
    render(fn, props) { cursor = 0; return fn(props); },
  };
}

for (const locale of ['es', 'en']) {
  test(`form preserves campaign, pack, language and explicit consent (${locale})`, async () => {
    const h = hooks(); const deps = overrides(locale);
    deps.react = { ...React, ...h.api };
    const { WaitlistForm } = sourceModule('src/app/waitlist/WaitlistForm.tsx', deps);
    const props = { initialPackSlug: '12-mixed', source: expectedSource };
    let tree = h.render(WaitlistForm, props);
    const inputs = nodes(tree).filter(node => node?.type === 'input');
    const values = ['', 'QA Synthetic', '000000000', 'qa@example.invalid'];
    inputs.filter(node => node.props.type !== 'checkbox').forEach((node, i) => node.props.onChange({ target: { value: values[i] } }));
    const consent = inputs.find(node => node.props.type === 'checkbox');
    assert.equal(consent.props.checked, false);
    const previousFetch = globalThis.fetch; const calls = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/waitlist'); calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ ok: true, signup: { list_date: '2026-10-16', list_label: 'Synthetic' } }) };
    };
    try {
      tree = h.render(WaitlistForm, props);
      await nodes(tree).find(node => node?.type === 'button').props.onClick();
      assert.equal(calls.length, 0, 'a campaign must not imply consent');
      consent.props.onChange({ target: { checked: true } }); tree = h.render(WaitlistForm, props);
      await nodes(tree).find(node => node?.type === 'button').props.onClick();
      assert.equal(calls.length, 1); assert.equal(calls[0].source, expectedSource);
      assert.equal(calls[0].preferredPackSlug, '12-mixed'); assert.equal(calls[0].locale, locale);
      assert.equal(calls[0].consentAccepted, true); assert.equal(calls[0].contactPreference, 'whatsapp');
      assert.equal(packCopy[locale]['12-mixed'].name.length > 0, true);
    } finally { if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch; }
  });
}
