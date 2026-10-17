import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceModule } from './helpers/load-ts.mjs';

const attribution = sourceModule('src/lib/waitlist/attribution.ts');
const { readWaitlistCampaign, waitlistCampaignSource, campaignFromWaitlistSource, waitlistCampaignHref, isWaitlistSource } = attribution;
const instagram = 'utm:v1:utm_source=instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1';
const tiktok = 'utm:v1:utm_source=tiktok&utm_medium=social&utm_campaign=october&utm_content=video-2';
const payload = { customerName: 'QA Synthetic', whatsapp: '000000000', email: 'qa@example.invalid', preferredPackSlug: '12-mixed', locale: 'es', consentAccepted: true };

test('Instagram and TikTok sources survive a canonical URL/source round trip', () => {
  for (const source of [instagram, tiktok]) {
    const campaign = campaignFromWaitlistSource(source);
    assert.ok(campaign);
    assert.equal(waitlistCampaignSource(campaign), source);
    const href = new URL(waitlistCampaignHref(campaign, '12-mixed'), 'https://synthetic.invalid');
    assert.equal(href.searchParams.get('pack'), '12-mixed');
    assert.deepEqual(readWaitlistCampaign(href.searchParams), campaign);
  }
});

test('direct visits, missing source and unknown parameters do not acquire attribution', () => {
  for (const query of ['', 'utm_campaign=october', 'fbclid=synthetic&ttclid=synthetic&token=synthetic']) {
    const campaign = readWaitlistCampaign(new URLSearchParams(query));
    assert.equal(campaign, null);
    assert.equal(waitlistCampaignSource(campaign), 'waitlist_page');
    assert.equal(waitlistCampaignHref(campaign), '/waitlist');
  }
  assert.equal(waitlistCampaignHref(null, '6-single'), '/waitlist?pack=6-single');
  assert.equal(waitlistCampaignHref(null, '../reserve'), '/waitlist');
});

test('normalization is bounded and only five explicit campaign keys propagate', () => {
  const campaign = readWaitlistCampaign({ utm_source: ' Instagram ', utm_campaign: 'October Bagels', utm_term: 'six_pack', fbclid: 'private', email: 'qa@example.invalid' });
  assert.deepEqual(campaign, { utm_source: 'instagram', utm_campaign: 'October Bagels', utm_term: 'six_pack' });
  assert.equal(waitlistCampaignSource(campaign), 'utm:v1:utm_source=instagram&utm_campaign=October+Bagels&utm_term=six_pack');
  const maximum = { utm_source: 's'.repeat(32), utm_medium: 'm'.repeat(32), utm_campaign: 'c'.repeat(64), utm_content: 'x'.repeat(64), utm_term: 't'.repeat(64) };
  assert.ok(waitlistCampaignSource(maximum).length <= attribution.WAITLIST_SOURCE_LIMIT);
  assert.deepEqual(campaignFromWaitlistSource(waitlistCampaignSource(maximum)), maximum);
  for (const key of Object.keys(maximum)) {
    const parsed = readWaitlistCampaign({ ...maximum, [key]: maximum[key] + 'x' });
    if (key === 'utm_source') assert.equal(parsed, null);
    else assert.equal(parsed[key], undefined);
  }
});

test('ambiguous, untrusted and malformed labels cannot become a stored campaign', () => {
  for (const value of ['=SUM(1)', '+script', '-formula', '@identity', 'https://example.invalid', 'qa@example.invalid', '<script>', 'hello\nworld', 'hello\tworld', 'bad%value', 'café']) {
    assert.equal(readWaitlistCampaign({ utm_source: value }), null, value);
  }
  assert.equal(readWaitlistCampaign(new URLSearchParams('utm_source=instagram&utm_source=tiktok')), null);
  assert.deepEqual(readWaitlistCampaign(new URLSearchParams('utm_source=instagram&utm_campaign=a&utm_campaign=b')), { utm_source: 'instagram' });
  for (const raw of ['utm:v1:utm_source=Instagram', 'utm:v1:utm_source=instagram&unknown=value', 'utm:v1:utm_source=instagram&utm_source=instagram', 'utm:v1:utm_source=%ZZ', 'utm:v1:utm_campaign=only', 'utm:v1:utm_source=instagram&utm_content=%3Cscript%3E', 'utm:v1:utm_source=' + 'a'.repeat(400)]) {
    assert.equal(campaignFromWaitlistSource(raw), null, raw);
    assert.equal(isWaitlistSource(raw), false);
  }
  assert.equal(isWaitlistSource('waitlist_page'), true);
  assert.equal(isWaitlistSource('legacy_campaign'), true);
  assert.equal(isWaitlistSource(''), true);
  assert.equal(isWaitlistSource('x'.repeat(81)), false);
});

function signupService() {
  const inserted = [];
  const client = { from(table) {
    if (table === 'batches') return { select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'synthetic-batch' }, error: null }) }) }) }) };
    assert.equal(table, 'waitlist_signups');
    return { insert(row) { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'synthetic-signup', list_date: row.list_date, list_label: row.list_label }, error: null }) }) }; } };
  } };
  const service = sourceModule('src/lib/waitlist/service.ts', {
    '@/lib/env': { getMissingReservationEnv: () => [] },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => client },
  });
  return { ...service, inserted };
}

for (const source of [instagram, tiktok, '', undefined]) {
  test(`service persists the validated source, pack, language and consent (${source?.split(':').at(-1).slice(0, 22) ?? 'omitted'})`, async () => {
    const { createWaitlistSignup, inserted } = signupService();
    await createWaitlistSignup({ ...payload, ...(source === undefined ? {} : { source }) });
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].source, source || 'waitlist_page');
    assert.equal(inserted[0].preferred_pack_slug, '12-mixed');
    assert.equal(inserted[0].locale, 'es');
    assert.equal(inserted[0].consent_accepted, true);
  });
}

test('invalid source and missing consent fail before any simulated insert', async () => {
  const { createWaitlistSignup, inserted } = signupService();
  for (const invalid of [{ source: 'utm:v1:utm_source=%3Cscript%3E' }, { source: 'x'.repeat(385) }, { consentAccepted: false }]) {
    await assert.rejects(createWaitlistSignup({ ...payload, ...invalid }));
  }
  assert.equal(inserted.length, 0);
});

test('admin source component decodes campaign labels and safely handles legacy sources', () => {
  const { WaitlistSource } = sourceModule('src/components/WaitlistSource.tsx');
  for (const [source, label] of [[instagram, 'Instagram'], [tiktok, 'TikTok'], ['waitlist_page', 'Direct / waitlist'], ['legacy_campaign', 'legacy_campaign'], ['<script>', 'Unknown']]) {
    const html = renderToStaticMarkup(React.createElement(WaitlistSource, { source }));
    assert.ok(html.includes(label));
    if (source.startsWith('utm:')) { assert.ok(html.includes('october')); assert.ok(html.includes('Campaign')); }
    assert.ok(!html.includes('<script>'));
  }
});

test('admin CSV exports raw source and decoded campaign columns without dropping existing fields', async () => {
  const signups = [instagram, tiktok, 'waitlist_page'].map((source, i) => ({ id: 'synthetic-' + i, source, customer_name: 'QA Synthetic', email: 'qa@example.invalid', whatsapp: '000000000', preferred_pack_slug: '12-mixed', locale: 'es', contact_preference: 'whatsapp', notes: 'Synthetic note' }));
  let authorized = false;
  const { GET } = sourceModule('src/app/admin/export/waitlist/route.ts', {
    '@/lib/admin/auth': { requireAdmin: async () => { authorized = true; } },
    '@/lib/admin/queries': { fetchWaitlistSignups: async () => { assert.equal(authorized, true); return { signups }; } },
  });
  const response = await GET();
  assert.equal(response.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  const lines = (await response.text()).split('\n').map(line => line.split(','));
  const header = lines[0];
  assert.deepEqual(header.slice(0, 16), ['Waitlist ID', 'List date', 'List label', 'Created at', 'Status', 'Customer', 'WhatsApp', 'Email', 'Preferred pack slug', 'Preferred pack', 'Contact preference', 'Language', 'Source', 'Notes', 'Contacted at', 'Batch ID']);
  for (const [i, source] of [instagram, tiktok, 'waitlist_page'].entries()) {
    const row = lines[i + 1];
    assert.equal(row.length, header.length);
    assert.equal(row[header.indexOf('Source')], source);
    assert.equal(row[header.indexOf('UTM source')], i < 2 ? ['instagram', 'tiktok'][i] : '');
    assert.equal(row[header.indexOf('UTM campaign')], i < 2 ? 'october' : '');
    assert.equal(row[header.indexOf('Preferred pack slug')], '12-mixed');
    assert.equal(row[header.indexOf('Language')], 'es');
    assert.equal(row[header.indexOf('Notes')], 'Synthetic note');
  }
});

test('unauthenticated CSV never reads signups', async () => {
  let reads = 0;
  const { GET } = sourceModule('src/app/admin/export/waitlist/route.ts', {
    '@/lib/admin/auth': { requireAdmin: async () => { throw new Error('Synthetic unauthenticated'); } },
    '@/lib/admin/queries': { fetchWaitlistSignups: async () => { reads++; return { signups: [] }; } },
  });
  await assert.rejects(GET());
  assert.equal(reads, 0);
});
