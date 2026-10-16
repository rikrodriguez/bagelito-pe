// Actual components/service/admin reader, synthetic browser and in-memory transport only.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceModule } from './helpers/load-ts.mjs';

const { translations } = sourceModule('src/lib/i18n.ts');
const catalog = sourceModule('src/lib/catalog.ts');
const attr = sourceModule('src/lib/waitlist/attribution.ts');
const origin = 'https://synthetic.invalid';
const privateQuery = 'token=synthetic-private&checkoutSessionId=synthetic-private&orderCode=BAG-PRIVATE&email=private%40example.invalid&fbclid=synthetic-private';
const Placeholder = () => null;
function deps(query, accepting = false, locale = 'es') {
  return {
    'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: Placeholder },
    '@/components/LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
    './LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
    '@/components/BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting, batchName: 'Synthetic', deliveryDate: null, ordersCloseAt: null }) },
    './BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting }) },
    '@/components/RollingBagel': { RollingBagel: Placeholder },
    '@/components/ConversionTrustStrip': { ConversionTrustStrip: Placeholder },
    '@/components/payments/CulqiCheckoutButton': { CulqiCheckoutButton: Placeholder },
    '@/components/Header': { Header: Placeholder }, '@/components/Footer': { Footer: Placeholder },
    '@/lib/analytics': { trackBagelitoEvent() {} },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [tree];
}
function hooks() {
  const slots = []; let cursor = 0; const pending = [];
  return {
    api: {
      useState(initial) { const i = cursor++; if (!Object.hasOwn(slots, i)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useMemo(fn) { cursor++; return fn(); },
      useEffect(fn, dependencies) { const i = cursor++; const old = slots[i]; if (!old || !dependencies?.every((value, j) => Object.is(value, old.dependencies[j]))) pending.push(() => { old?.cleanup?.(); slots[i] = { dependencies, cleanup: fn() }; }); },
    },
    render(Component, props) { cursor = 0; const tree = Component(props); while (pending.length) pending.shift()(); return tree; },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function assertHref(href, path, pack, campaign) {
  const url = new URL(href, origin);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, path);
  assert.equal(url.searchParams.get('pack'), pack);
  assert.deepEqual(attr.readWaitlistCampaign(url.searchParams), campaign);
  assert.deepEqual([...url.searchParams.keys()].sort(), [...(pack ? ['pack'] : []), ...Object.keys(campaign ?? {})].sort());
}
function reserveEntry(query, pack) {
  const { Packs } = sourceModule('src/components/Packs.tsx', deps(query, true));
  const html = renderToStaticMarkup(React.createElement(Packs));
  return [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&')).find(href => new URL(href, origin).searchParams.get('pack') === pack);
}
function closedExit(query, pack, locale) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {}, scrollTo() {}, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {} };
  globalThis.document = { documentElement: {}, body: { classList: { toggle() {}, remove() {} } } };
  const h = hooks();
  try {
    const { ReservationFlow } = sourceModule('src/app/reserve/ReservationFlow.tsx', { ...deps(query, false, locale), react: { ...React, ...h.api } });
    const props = { ...catalog, initialPackSlug: catalog.getValidPack(pack).slug, paymentConfig: { enabled: false, mode: 'disabled', provider: 'manual' } };
    h.render(ReservationFlow, props); // Restores an empty synthetic recovery store.
    const tree = h.render(ReservationFlow, props);
    return nodes(tree).find(node => node?.props?.href?.startsWith('/waitlist')).props.href;
  } finally { h.cleanup(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}

test('a direct closed-reserve visit retains its validated campaign in the waitlist exit', () => {
  const query = 'pack=12-mixed&utm_source=tiktok&utm_campaign=closed&' + privateQuery;
  const href = closedExit(query, '12-mixed', 'es');
  assertHref(href, '/waitlist', '12-mixed', { utm_source: 'tiktok', utm_campaign: 'closed' });
});

const scenarios = [
  ['instagram', 'utm_source=Instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1&utm_term=bagels&' + privateQuery, { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'october', utm_content: 'reel-1', utm_term: 'bagels' }],
  ['tiktok', 'utm_source=tiktok&utm_campaign=october&' + privateQuery, { utm_source: 'tiktok', utm_campaign: 'october' }],
  ['direct', privateQuery, null],
  ['invalid source', 'utm_source=%3Cscript%3E&utm_campaign=october&' + privateQuery, null],
  ['duplicate source', 'utm_source=instagram&utm_source=tiktok&' + privateQuery, null],
  ['invalid optional', 'utm_source=instagram&utm_content=%40private&utm_medium=' + 'x'.repeat(33) + '&utm_campaign=a&utm_campaign=b&' + privateQuery, { utm_source: 'instagram' }],
];
for (const [name, query, campaign] of scenarios) {
  test(`home -> reserve -> closed waitlist -> signup -> admin/CSV (${name})`, async () => {
    const pack = name === 'tiktok' ? '6-single' : '12-mixed';
    const locale = name === 'tiktok' ? 'en' : 'es';
    const entry = reserveEntry(query, pack);
    assertHref(entry, '/reserve', pack, campaign);
    const exit = closedExit(new URL(entry, origin).search.slice(1), pack, locale);
    assertHref(exit, '/waitlist', pack, campaign);
    const { default: Page } = sourceModule('src/app/waitlist/page.tsx', deps('', false, locale));
    const page = await Page({ searchParams: Promise.resolve(Object.fromEntries(new URL(exit, origin).searchParams)) });
    const formProps = nodes(page).find(node => node?.type?.name === 'WaitlistForm').props;
    const expectedSource = attr.waitlistCampaignSource(campaign);
    assert.equal(formProps.source, expectedSource);
    assert.equal(formProps.initialPackSlug, pack);

    const rows = []; let reads = 0;
    const client = { from(table) {
      if (table === 'batches') return { select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'synthetic-batch' }, error: null }) }) }) }) };
      assert.equal(table, 'waitlist_signups');
      return {
        insert(row) { rows.push({ ...row, id: 'synthetic-signup' }); return { select: () => ({ single: async () => ({ data: rows[0], error: null }) }) }; },
        select: () => ({ order: () => ({ limit: async () => { reads++; return { data: rows, error: null }; } }) }),
      };
    } };
    const backend = { '@/lib/env': { getMissingReservationEnv: () => [] }, '@/lib/supabase/admin': { createSupabaseAdminClient: () => client } };
    const service = sourceModule('src/lib/waitlist/service.ts', backend);
    const h = hooks();
    const { WaitlistForm } = sourceModule('src/app/waitlist/WaitlistForm.tsx', { ...deps('', false, locale), react: { ...React, ...h.api } });
    let tree = h.render(WaitlistForm, formProps);
    const inputs = nodes(tree).filter(node => node?.type === 'input');
    inputs.filter(node => node.props.type !== 'checkbox').forEach((node, i) => node.props.onChange({ target: { value: ['', 'QA Synthetic', '000000000', 'qa@example.invalid'][i] } }));
    const consent = inputs.find(node => node.props.type === 'checkbox');
    assert.equal(consent.props.checked, false);
    const previousFetch = globalThis.fetch; let submissions = 0;
    globalThis.fetch = async (url, init) => { assert.equal(url, '/api/waitlist'); submissions++; const signup = await service.createWaitlistSignup(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true, signup }) }; };
    try {
      tree = h.render(WaitlistForm, formProps);
      await nodes(tree).find(node => node?.type === 'button').props.onClick();
      assert.equal(submissions, 0); assert.equal(rows.length, 0);
      consent.props.onChange({ target: { checked: true } });
      tree = h.render(WaitlistForm, formProps);
      await nodes(tree).find(node => node?.type === 'button').props.onClick();
      assert.equal(submissions, 1); assert.equal(rows.length, 1);
      assert.equal(rows[0].source, expectedSource); assert.equal(rows[0].preferred_pack_slug, pack);
      assert.equal(rows[0].locale, locale); assert.equal(rows[0].consent_accepted, true);
      assert.ok(!rows[0].source.includes('private'));
    } finally { globalThis.fetch = previousFetch; }
    const queries = sourceModule('src/lib/admin/queries.ts', backend);
    let authenticated = false;
    const { GET } = sourceModule('src/app/admin/export/waitlist/route.ts', {
      '@/lib/admin/auth': { requireAdmin: async () => { if (!authenticated) throw new Error('Synthetic unauthenticated'); } },
      '@/lib/admin/queries': { fetchWaitlistSignups: queries.fetchWaitlistSignups },
    });
    await assert.rejects(GET()); assert.equal(reads, 0);
    authenticated = true;
    const csv = await (await GET()).text(); assert.equal(reads, 1);
    assert.ok(csv.includes(expectedSource)); assert.ok(csv.includes(pack));
    const cells = csv.split('\n')[1].split(',');
    assert.deepEqual(cells.slice(-5), ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map(key => campaign?.[key] ?? ''));
    const { WaitlistSource } = sourceModule('src/components/WaitlistSource.tsx');
    const html = renderToStaticMarkup(React.createElement(WaitlistSource, { source: rows[0].source }));
    assert.ok(html.includes(campaign?.utm_source === 'instagram' ? 'Instagram' : campaign ? 'TikTok' : 'Direct / waitlist'));
    assert.ok(!html.includes('synthetic-private'));
  });
}

test('all four pack choices survive entry and closed exit; invalid selections use the existing catalog fallback', () => {
  for (const pack of catalog.packs) {
    const entry = reserveEntry('utm_source=instagram', pack.slug);
    assertHref(entry, '/reserve', pack.slug, { utm_source: 'instagram' });
    assertHref(closedExit(new URL(entry, origin).search.slice(1), pack.slug, 'es'), '/waitlist', pack.slug, { utm_source: 'instagram' });
  }
  assertHref(closedExit('pack=../private&token=synthetic-private', '../private', 'en'), '/waitlist', catalog.packs[0].slug, null);
});
