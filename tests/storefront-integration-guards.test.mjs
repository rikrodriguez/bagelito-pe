import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { sourceModule } from './helpers/load-ts.mjs';

const origin = 'https://synthetic.invalid';
const components = ['Hero', 'Packs', 'FlavorStrip', 'FinalCTA', 'MobileStickyReserveCTA'];
const { translations } = sourceModule('src/lib/i18n.ts');
const { packs, getCheckoutSelection } = sourceModule('src/lib/catalog.ts');
const { flavors } = sourceModule('src/data/flavors.ts');
const { flavorImages } = sourceModule('src/data/flavor-images.ts');
const { readWaitlistCampaign } = sourceModule('src/lib/waitlist/attribution.ts');
const query = 'utm_source=Instagram&utm_campaign=local-integration&utm_content=card-one&pack=unknown&flavor=unknown'
  + '&email=private%40example.invalid&token=private-token&checkoutSessionId=private-session&orderCode=BAG-PRIVATE&fbclid=private-click';
const campaign = { utm_source: 'instagram', utm_campaign: 'local-integration', utm_content: 'card-one' };

function render(name, locale, availability, merchantReviewOnly = false) {
  const { [name]: Component } = sourceModule(`src/components/${name}.tsx`, {
    react: name === 'MobileStickyReserveCTA' ? { ...React, useState: () => [true, () => {}] } : React,
    'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: ({ src, alt, className, loading }) => React.createElement('img', { src, alt, className, loading }) },
    './LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
    './BatchAvailabilityProvider': { useBatchAvailability: () => ({ ...availability, merchantReviewOnly }) },
    '@/lib/analytics': { trackBagelitoEvent() {} },
    'framer-motion': {
      motion: { div: ({ children, ...props }) => React.createElement('div', { ...props, style: undefined }, children) },
      useScroll: () => ({ scrollYProgress: 0 }), useTransform: () => 0,
    },
  });
  return renderToStaticMarkup(React.createElement(Component));
}

function links(html) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([, href]) => href.replaceAll('&amp;', '&'));
}

function assertCampaign(href, extra = []) {
  const url = new URL(href, origin);
  assert.equal(url.origin, origin);
  assert.deepEqual(readWaitlistCampaign(url.searchParams), campaign);
  assert.deepEqual([...url.searchParams.keys()].sort(), [...Object.keys(campaign), ...extra].sort());
  assert.ok(!href.includes('private'));
  assert.ok(!href.includes('BAG-PRIVATE'));
  return url;
}

// The availability service itself executes here. The synthetic DB supplies only
// batch/usage reads, so closed/window/capacity rules cannot be replaced by a
// storefront fixture that simply claims orders are open.
async function batchAvailability(overrides = {}) {
  const batch = {
    id: 'synthetic-storefront-batch', name: 'Synthetic storefront batch', status: 'orders_open',
    orders_open_at: null, orders_close_at: null, delivery_date: null,
    capacity_packs: 10, capacity_bagels: 60, ...overrides,
  };
  const db = { from(table) {
    if (table === 'batches') return { select: () => ({ order: () => ({ limit: () => ({
      maybeSingle: async () => ({ data: batch, error: null }),
    }) }) }) };
    assert.equal(table, 'orders');
    return { select: () => ({ eq: () => ({ neq: async () => ({ data: [], error: null }) }) }) };
  } };
  const service = sourceModule('src/lib/reservations/service.ts', {
    '@/lib/env': { getMissingReservationEnv: () => [] },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
  });
  const availability = await service.getReservationBatchAvailability();
  assert.equal(availability.batchName, batch.name, 'The real service must not fall back after a fixture error');
  return availability;
}

for (const locale of ['es', 'en']) {
  test(`open storefront keeps catalog quantities, prices, exact flavors and validated attribution (${locale})`, async () => {
    const availability = await batchAvailability();
    assert.equal(availability.accepting, true);
    for (const name of components) {
      const html = render(name, locale, availability);
      const destinations = links(html);
      assert.ok(destinations.length > 0, name);
      if (name === 'Hero') {
        assert.deepEqual(destinations, ['#packs']);
      } else {
        for (const [index, href] of destinations.entries()) {
          const extra = name === 'Packs' ? ['pack'] : name === 'FlavorStrip' ? ['pack', 'flavor'] : [];
          const url = assertCampaign(href, extra);
          assert.equal(url.pathname, name === 'Packs' ? '/reserve' : name === 'FlavorStrip' ? '/checkout' : '/');
          if (name === 'Packs') assert.equal(url.searchParams.get('pack'), packs[index].slug);
          else if (name === 'FlavorStrip') {
            const selection = getCheckoutSelection(Object.fromEntries(url.searchParams));
            assert.equal(selection.pack.slug, '6-single');
            assert.equal(selection.pack.units, 6);
            assert.equal(selection.flavor.slug, flavors[index].slug);
          } else assert.equal(url.hash, '#packs');
        }
      }
      assert.doesNotMatch(html, /<canvas\b|<model-viewer\b|<iframe\b/);
    }
    const packHtml = render('Packs', locale, availability);
    const cards = [...packHtml.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(([, html]) => html);
    assert.equal(cards.length, packs.length);
    for (const [index, pack] of packs.entries()) {
      assert.ok(cards[index].includes(`S/${pack.amount}</strong>`));
      assert.ok(cards[index].includes(`S/${(pack.amount / pack.units).toFixed(2)}`));
    }
    const flavorHtml = render('FlavorStrip', locale, availability);
    for (const flavor of flavors) assert.ok(flavorHtml.includes(`src="${flavorImages[flavor.slug]}"`));
  });
}

for (const [name, fields] of [
  ['closed status', { status: 'orders_closed' }],
  ['opening in the future', { orders_open_at: '2999-01-01T00:00:00Z' }],
  ['closing in the past', { orders_close_at: '2000-01-01T00:00:00Z' }],
  ['zero pack capacity', { capacity_packs: 0 }],
  ['zero bagel capacity', { capacity_bagels: 0 }],
]) {
  test(`${name} sends every normal storefront purchase entry to the attributed waitlist`, async () => {
    const availability = await batchAvailability(fields);
    assert.equal(availability.accepting, false);
    for (const locale of ['es', 'en']) {
      for (const component of components) {
        const html = render(component, locale, availability);
        for (const href of links(html)) {
          const url = assertCampaign(href, component === 'Packs' || component === 'FlavorStrip' ? ['pack'] : []);
          assert.equal(url.pathname, '/waitlist');
          assert.equal(url.searchParams.get('flavor'), null);
        }
        assert.doesNotMatch(html, /href="(?:\/checkout|\/reserve|#packs|\/\?[^\"]*#packs)/);
      }
    }
  });
}

for (const accepting of [false, true]) {
  test(`review-only storefront stays an explicit demonstration with correct selections (internal accepting=${accepting})`, () => {
    for (const locale of ['es', 'en']) {
      for (const component of components) {
        const html = render(component, locale, { accepting }, true);
        for (const [index, href] of links(html).entries()) {
          const extra = component === 'Packs' ? ['pack'] : component === 'FlavorStrip' ? ['pack', 'flavor'] : [];
          const url = assertCampaign(href, extra);
          assert.equal(url.pathname, '/checkout');
          if (component === 'Packs') assert.equal(url.searchParams.get('pack'), packs[index].slug);
          if (component === 'FlavorStrip') assert.equal(url.searchParams.get('flavor'), flavors[index].slug);
        }
        assert.ok(html.includes(locale === 'es' ? 'Ver checkout de demostración' : 'Preview checkout'));
        assert.doesNotMatch(html, /href="(?:\/reserve|\/waitlist|#packs)/);
      }
    }
  });
}

test('merged CSS keeps affirmative-consent focus/disabled guards and the responsive photographed storefront', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  const stylesheet = postcss.parse(css);
  const declarations = selector => {
    const found = [];
    stylesheet.walkRules(rule => { if (rule.selector === selector) found.push(Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))); });
    return found;
  };
  assert.equal(declarations('.checkout-terms-acceptance').length, 1, 'Store preview must not override the financial consent block again');
  assert.equal(declarations('.checkout-terms-acceptance input:disabled')[0].cursor, 'not-allowed');
  assert.match(declarations('.checkout-terms-acceptance:focus-within')[0].outline, /^2px solid/);
  assert.equal(declarations('.culqi-preview-pay:disabled')[0].cursor, 'not-allowed');
  assert.equal(declarations('body.reservation-review-active .batch-deadline-banner')[0].display, 'none');
  assert.equal(declarations('.flavor-product-photo img')[0]['object-fit'], 'contain');
  assert.ok(declarations('.checkout-review-banner, .culqi-review-only-note').length > 0);
  assert.ok(declarations('.flavor-select-card .flavor-select-photo').length > 0);
  assert.ok(declarations('.culqi-demo-illustration').length > 0);
  assert.ok(declarations('.flavor-product-cta:focus-visible').length > 0);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*?\.flavor-strip \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
